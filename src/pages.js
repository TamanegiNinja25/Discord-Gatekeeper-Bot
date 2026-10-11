// Public pages: Terms of Service, Privacy Policy, and small status/result pages.
// Edit the text to match how you actually run the bot. This is a starting template, not legal advice.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const BOT = () => esc(process.env.BOT_NAME || 'Gatekeeper');
const OPERATOR = () => esc(process.env.OPERATOR_NAME || 'the bot operator');
const CONTACT = () => {
  const c = process.env.CONTACT_EMAIL;
  return c ? `<a href="mailto:${esc(c)}">${esc(c)}</a>` : 'the server staff where the bot is used';
};
const UPDATED = '11 October 2026';

function layout(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root{--bg:#f6f6f8;--fg:#1d1d22;--muted:#5d5d6a;--card:#fff;--line:#e3e3ea;--accent:#5865f2}
  @media (prefers-color-scheme:dark){:root{--bg:#16171a;--fg:#ececf1;--muted:#a0a0ad;--card:#1f2024;--line:#2e2f35;--accent:#8891f7}}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}
  main{max-width:720px;margin:0 auto;padding:48px 16px 72px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px 28px 20px}
  h1{font-size:1.75rem;line-height:1.25;margin:0 0 4px}h2{font-size:1.1rem;margin:28px 0 6px}
  p,li{color:var(--fg)}.muted{color:var(--muted);font-size:.9rem}a{color:var(--accent)}
  ul{padding-left:1.2rem}nav{margin-top:20px;font-size:.9rem;color:var(--muted)}nav a{margin-right:14px}
</style></head>
<body><main><div class="card">${body}</div>
<nav><a href="/">${BOT()}</a><a href="/terms-of-service">Terms</a><a href="/privacy-policy">Privacy</a></nav></main></body></html>`;
}

export function messagePage(title, html) {
  return layout(title, `<h1>${esc(title)}</h1><p>${html}</p>`);
}

export function homePage(client) {
  const status = client.isReady() ? `Online in ${client.guilds.cache.size} server(s).` : 'Starting up…';
  return layout(BOT(), `<h1>${BOT()}</h1><p class="muted">${esc(status)}</p>
<p>Discord admin automation: welcome messages, join/leave and voice activity records, automatic roles and self-assign role panels.</p>`);
}

export function termsPage() {
  return layout(
    `${BOT()} — Terms of Service`,
    `<h1>Terms of Service</h1><p class="muted">Last updated ${UPDATED}</p>
<p>These terms cover your use of ${BOT()} (“the bot”), a Discord application operated by ${OPERATOR()}. By adding the bot to a server or using its commands, buttons or Linked Roles connection, you agree to them.</p>

<h2>1. What the bot does</h2>
<p>The bot posts welcome and goodbye messages, records when members join or leave a server and when they enter or leave voice channels, gives roles automatically or through role panels, and can report activity statistics to Discord for Linked Roles.</p>

<h2>2. Server administrators</h2>
<ul>
<li>You are responsible for how the bot is configured in your server, including which roles it assigns and who can view activity records.</li>
<li>You should let your members know that activity in your server is logged, for example in your rules channel.</li>
<li>You must follow Discord’s <a href="https://discord.com/terms">Terms of Service</a> and <a href="https://discord.com/guidelines">Community Guidelines</a>.</li>
</ul>

<h2>3. Acceptable use</h2>
<p>Don’t use the bot to harass people, to collect data about members for purposes unrelated to running your server, or to try to disrupt or overload the service.</p>

<h2>4. Availability</h2>
<p>The bot is provided “as is”, without guarantees of uptime or accuracy. Records may be incomplete, for example while the bot is offline. Features may change or be discontinued.</p>

<h2>5. Liability</h2>
<p>To the extent allowed by law, ${OPERATOR()} is not liable for any loss arising from use of the bot, including incorrect role assignments or missing records.</p>

<h2>6. Ending use</h2>
<p>You can stop using the bot at any time by removing it from your server or revoking its access under Discord → User Settings → Authorized Apps. Access may be withdrawn from servers that break these terms.</p>

<h2>7. Changes and contact</h2>
<p>These terms may be updated; the date above shows the latest version. Questions: ${CONTACT()}.</p>`,
  );
}

export function privacyPage() {
  return layout(
    `${BOT()} — Privacy Policy`,
    `<h1>Privacy Policy</h1><p class="muted">Last updated ${UPDATED}</p>
<p>This policy explains what ${BOT()} (“the bot”), operated by ${OPERATOR()}, stores and why.</p>

<h2>What we store</h2>
<ul>
<li><b>Server settings</b> — channel and role IDs and message templates that administrators configure.</li>
<li><b>Activity records</b> — for each server: your Discord user ID and username, and the time you joined or left the server, or entered, moved between or left voice channels (with the channel ID and time spent).</li>
<li><b>Linked Roles connection</b> (only if you choose to connect) — your user ID, username and the OAuth access and refresh tokens Discord issues, used to update your Linked Roles stats.</li>
</ul>
<p>The bot does <b>not</b> read or store message content, and does not record or listen to voice audio.</p>

<h2>Why</h2>
<p>To welcome members, give roles, help server staff keep an activity log, and — if you connect — show Discord your verified status, voice hours and days as a member so servers can offer roles based on them.</p>

<h2>Who can see it</h2>
<p>Activity records are visible to staff with the <i>Manage Server</i> permission in the server they relate to, through the bot’s log channel and commands. Linked Roles stats are sent to Discord and shown on your profile connection. Data is not sold or shared with anyone else.</p>

<h2>How long it’s kept</h2>
<p>Each server keeps its most recent 20,000 records; older ones are deleted automatically. Removing the bot from a server stops new records. Linked Roles tokens are deleted when you revoke access.</p>

<h2>Your choices</h2>
<ul>
<li>Ask a server’s staff to delete your records — they can use <code>/records forget</code>.</li>
<li>Disconnect Linked Roles any time under Discord → User Settings → Authorized Apps.</li>
<li>For any other request, contact ${CONTACT()}.</li>
</ul>

<h2>Changes</h2>
<p>This policy may be updated; the date above shows the latest version.</p>`,
  );
}
