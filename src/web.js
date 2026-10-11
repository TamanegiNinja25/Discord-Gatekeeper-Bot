// HTTP side of the bot. Serves the four URLs from the Developer Portal → General Information:
//   Interactions Endpoint URL      → POST /api/interactions
//   Linked Roles Verification URL  → GET  /verify-user   (+ /discord/oauth-callback)
//   Terms of Service URL           → GET  /terms-of-service
//   Privacy Policy URL             → GET  /privacy-policy
import http from 'node:http';
import crypto from 'node:crypto';
import { inflight } from './interactions.js';
import { authorizeUrl, completeLink, linkedRolesConfigured } from './linkedroles.js';
import { termsPage, privacyPage, messagePage, homePage } from './pages.js';

const MAX_BODY = 1_000_000;

// Discord signs every interaction with Ed25519; we verify with the app's Public Key.
function loadPublicKey(hex) {
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) return null;
  const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
  return crypto.createPublicKey({ key: Buffer.concat([spkiPrefix, Buffer.from(hex, 'hex')]), format: 'der', type: 'spki' });
}

export function verifySignature(publicKey, signature, timestamp, rawBody) {
  if (!publicKey || !signature || !timestamp || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  try {
    return crypto.verify(null, Buffer.from(timestamp + rawBody), publicKey, Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body = '', headers = {}) {
  const isObj = typeof body === 'object';
  res.writeHead(status, {
    'Content-Type': isObj ? 'application/json' : 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(isObj ? JSON.stringify(body) : body);
}

const cookie = (req, name) =>
  (req.headers.cookie ?? '')
    .split(';')
    .map((s) => s.trim().split('='))
    .find(([k]) => k === name)?.[1];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function startWebServer(client) {
  const publicKey = loadPublicKey(process.env.PUBLIC_KEY);
  if (!publicKey) console.warn('[web] PUBLIC_KEY missing/invalid — /api/interactions will reject everything.');
  const secureCookie = (process.env.PUBLIC_URL ?? '').startsWith('https://') ? '; Secure' : '';

  // ── POST /api/interactions ──────────────────────────────────────────────
  async function interactions(req, res) {
    const raw = await readBody(req);
    const ok = verifySignature(publicKey, req.headers['x-signature-ed25519'], req.headers['x-signature-timestamp'], raw);
    // Discord deliberately sends badly-signed requests when you save the URL; it must get 401.
    if (!ok) return send(res, 401, { error: 'invalid request signature' });

    const body = JSON.parse(raw);
    if (body.type === 1) return send(res, 200, { type: 1 }); // PING → PONG (URL verification)

    if (!client.isReady()) {
      return send(res, 200, { type: 4, data: { content: '⏳ The bot is still starting up — try again in a few seconds.', flags: 64 } });
    }

    // Hand the raw payload to discord.js so the exact same handlers run as over the gateway.
    // (Internal API; discord.js is pinned to ~14.x in package.json for that reason.)
    body.entitlements ??= [];
    client.actions.InteractionCreate.handle(body);

    // Handlers reply via Discord's callback endpoint; the HTTP request then gets 202 with no body.
    // Wait (max 2.5s — Discord's limit is 3s) until the reply has gone out.
    const p = inflight.get(body.id);
    if (p) await Promise.race([p, sleep(2500)]);
    res.writeHead(202).end();
  }

  // ── GET /verify-user → Discord OAuth → /discord/oauth-callback ──────────
  function verifyUser(req, res) {
    if (!linkedRolesConfigured()) {
      return send(res, 503, messagePage('Linked Roles not set up', 'The bot owner still needs to set CLIENT_SECRET and PUBLIC_URL.'));
    }
    const state = crypto.randomUUID();
    send(res, 302, '', {
      Location: authorizeUrl(state),
      'Set-Cookie': `oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${secureCookie}`,
    });
  }

  async function oauthCallback(req, res, url) {
    const { code, state, error } = Object.fromEntries(url.searchParams);
    if (error) return send(res, 400, messagePage('Not connected', 'You cancelled the connection. You can close this tab.'));
    if (!state || state !== cookie(req, 'oauth_state')) {
      return send(res, 403, messagePage('Link expired', 'Please go back to Discord and start the connection again.'));
    }
    try {
      const user = await completeLink(code);
      send(
        res,
        200,
        messagePage('✅ Connected', `You’re linked as <b>${escapeHtml(user.username)}</b>. Head back to Discord — eligible roles update within a minute.`),
        { 'Set-Cookie': `oauth_state=; Path=/; Max-Age=0${secureCookie}` },
      );
    } catch (err) {
      console.error('[oauth]', err.message);
      send(res, 500, messagePage('Something went wrong', 'Couldn’t finish connecting. Please try again.'));
    }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const route = `${req.method} ${url.pathname.replace(/\/$/, '') || '/'}`;
    try {
      switch (route) {
        case 'POST /api/interactions':
          return await interactions(req, res);
        case 'GET /verify-user':
          return verifyUser(req, res);
        case 'GET /discord/oauth-callback':
          return await oauthCallback(req, res, url);
        case 'GET /terms-of-service':
          return send(res, 200, termsPage());
        case 'GET /privacy-policy':
          return send(res, 200, privacyPage());
        case 'GET /health':
          return send(res, client.isReady() ? 200 : 503, { ok: client.isReady(), guilds: client.guilds.cache.size });
        case 'GET /':
          return send(res, 200, homePage(client));
        default:
          return send(res, 404, messagePage('Not found', 'Nothing here.'));
      }
    } catch (err) {
      console.error(`[web] ${route}`, err);
      if (!res.headersSent) send(res, 500, { error: 'internal error' });
    }
  });

  const port = Number(process.env.PORT) || 3000;
  server.listen(port, () => console.log(`🌐 Web server on :${port}${process.env.PUBLIC_URL ? ` (${process.env.PUBLIC_URL})` : ''}`));
  return server;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
