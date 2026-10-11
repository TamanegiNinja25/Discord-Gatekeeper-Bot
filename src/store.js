// Tiny JSON-file persistence: per-server settings + activity records.
// Swap for SQLite/Postgres later without touching the rest of the bot.
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
const FILE = path.join(DATA_DIR, 'guilds.json');
const MAX_RECORDS_PER_GUILD = 20_000;

function defaults() {
  return {
    welcome: {
      enabled: false,
      channelId: null,
      message: 'Hey {user}, welcome to **{server}**! You are member **#{count}**. 🎉',
      dm: false,
    },
    goodbye: {
      enabled: false,
      channelId: null,
      message: '**{username}** has left {server}. We now have {count} members.',
    },
    logChannelId: null,
    autoRoles: { humans: [], bots: [] },
    rolePanels: {}, // messageId -> { channelId, mode: 'toggle'|'unique', roleIds: [] }
    voiceSessions: {}, // userId -> { channelId, joinedAt }
    records: [], // { at, type, userId, tag, channelId?, durationMs? }
  };
}

let data = {};
try {
  data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch (err) {
  if (err.code !== 'ENOENT') console.error(`[store] Could not read ${FILE}, starting fresh:`, err.message);
}

const normalized = new Set();

/** Returns the live (mutable) config object for a server. Call save() after changing it. */
export function guildConfig(guildId) {
  if (!normalized.has(guildId)) {
    const base = defaults();
    const cur = data[guildId] ?? {};
    data[guildId] = {
      ...base,
      ...cur,
      welcome: { ...base.welcome, ...cur.welcome },
      goodbye: { ...base.goodbye, ...cur.goodbye },
      autoRoles: { ...base.autoRoles, ...cur.autoRoles },
    };
    normalized.add(guildId);
  }
  return data[guildId];
}

const LINKED_KEY = '_linkedAccounts';

/** Every server's config (skips internal keys). */
export function allGuildConfigs() {
  return Object.keys(data)
    .filter((k) => !k.startsWith('_'))
    .map((id) => guildConfig(id));
}

/** Linked Roles OAuth tokens, keyed by user ID: { username, accessToken, refreshToken, expiresAt }. */
export function linkedAccounts() {
  return (data[LINKED_KEY] ??= {});
}

/** Remove one member's records from a server (privacy requests). Returns how many were removed. */
export function forgetUser(guildId, userId) {
  const g = guildConfig(guildId);
  const before = g.records.length;
  g.records = g.records.filter((r) => r.userId !== userId);
  delete g.voiceSessions[userId];
  save();
  return before - g.records.length;
}

export function addRecord(guildId, record) {
  const g = guildConfig(guildId);
  g.records.push({ at: Date.now(), ...record });
  if (g.records.length > MAX_RECORDS_PER_GUILD) {
    g.records.splice(0, g.records.length - MAX_RECORDS_PER_GUILD);
  }
  save();
}

let timer = null;
export function save() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, 1000);
}

/** Write to disk now (atomic: write temp file, then rename). */
export function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILE);
}
