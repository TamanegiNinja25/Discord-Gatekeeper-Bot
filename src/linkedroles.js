// Linked Roles: members connect their Discord account to the bot, and the bot reports
// stats (verified, voice hours, days as member) that admins can require for a role.
// Docs: https://discord.com/developers/docs/tutorials/configuring-app-metadata-for-linked-roles
import { linkedAccounts, allGuildConfigs, save } from './store.js';

const API = 'https://discord.com/api/v10';
const { CLIENT_ID, CLIENT_SECRET } = process.env;

export const redirectUri = () => `${process.env.PUBLIC_URL?.replace(/\/$/, '')}/discord/oauth-callback`;

/** What admins can pick as requirements in Server Settings → Roles → Links. Max 5. */
export const METADATA = [
  { key: 'verified', name: 'Verified', description: 'Has connected their account to the bot', type: 7 }, // BOOLEAN_EQUAL
  { key: 'voice_hours', name: 'Voice hours', description: 'Hours spent in voice channels (at least)', type: 2 }, // INTEGER_GREATER_THAN_OR_EQUAL
  { key: 'member_since', name: 'Days as member', description: 'Days since they first joined (at least)', type: 6 }, // DATETIME_LESS_THAN_OR_EQUAL
];

let client = null;
export function initLinkedRoles(c) {
  client = c;
}

export function linkedRolesConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET && process.env.PUBLIC_URL);
}

export function authorizeUrl(state) {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    state,
    scope: 'identify role_connections.write',
    prompt: 'consent',
  });
  return `https://discord.com/oauth2/authorize?${p}`;
}

async function discordFetch(path, init = {}) {
  const res = await fetch(`${API}${path}`, init);
  if (!res.ok) {
    const err = new Error(`Discord ${init.method ?? 'GET'} ${path} → ${res.status}: ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

async function tokenRequest(params) {
  const t = await discordFetch('/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000 };
}

/** Finish the OAuth flow: exchange the code, remember the tokens, push metadata. Returns the Discord user. */
export async function completeLink(code) {
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
  const user = await discordFetch('/users/@me', { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
  linkedAccounts()[user.id] = { username: user.username, ...tokens };
  save();
  await pushMetadata(user.id);
  return user;
}

async function accessTokenFor(userId) {
  const acct = linkedAccounts()[userId];
  if (Date.now() < acct.expiresAt - 60_000) return acct.accessToken;
  Object.assign(acct, await tokenRequest({ grant_type: 'refresh_token', refresh_token: acct.refreshToken }));
  save();
  return acct.accessToken;
}

/** Totals for one user across every server the bot is in. */
export function userStats(userId) {
  let voiceMs = 0;
  let firstSeen = Infinity;
  for (const g of allGuildConfigs()) {
    for (const r of g.records) {
      if (r.userId !== userId) continue;
      if ((r.type === 'voice_out' || r.type === 'voice_move') && r.durationMs) voiceMs += r.durationMs;
      if (r.type === 'join') firstSeen = Math.min(firstSeen, r.at);
    }
    const open = g.voiceSessions[userId];
    if (open) voiceMs += Date.now() - open.joinedAt;
  }
  // Members who joined before the bot was added have no 'join' record — use Discord's joined date.
  for (const guild of client?.guilds.cache.values() ?? []) {
    const m = guild.members.cache.get(userId);
    if (m?.joinedTimestamp) firstSeen = Math.min(firstSeen, m.joinedTimestamp);
  }
  return { voiceHours: Math.floor(voiceMs / 3_600_000), firstSeen: Number.isFinite(firstSeen) ? firstSeen : null };
}

export async function pushMetadata(userId) {
  const acct = linkedAccounts()[userId];
  if (!acct || !linkedRolesConfigured()) return;
  try {
    const token = await accessTokenFor(userId);
    const { voiceHours, firstSeen } = userStats(userId);
    const metadata = { verified: 1, voice_hours: voiceHours };
    if (firstSeen) metadata.member_since = new Date(firstSeen).toISOString();
    await discordFetch(`/users/@me/applications/${CLIENT_ID}/role-connection`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform_name: client?.user?.username ?? 'Gatekeeper', platform_username: acct.username, metadata }),
    });
  } catch (err) {
    if (err.status === 400 || err.status === 401) {
      // User revoked access in Discord → Settings → Authorized Apps. Forget their tokens.
      delete linkedAccounts()[userId];
      save();
    }
    console.warn(`[linked-roles] ${userId}: ${err.message}`);
  }
}

// Stats change often (every voice session) — batch updates per user.
const timers = new Map();
export function scheduleMetadataUpdate(userId, delayMs = 30_000) {
  if (!linkedAccounts()[userId] || timers.has(userId)) return;
  timers.set(
    userId,
    setTimeout(() => {
      timers.delete(userId);
      pushMetadata(userId);
    }, delayMs),
  );
}

/** Push fresh stats for everyone linked (voice hours keep growing while people sit in voice). */
export function startPeriodicRefresh(everyMs = 6 * 3_600_000) {
  setInterval(() => {
    for (const id of Object.keys(linkedAccounts())) scheduleMetadataUpdate(id, Math.random() * 60_000);
  }, everyMs).unref();
}
