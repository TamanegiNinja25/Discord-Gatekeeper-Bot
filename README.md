# Gatekeeper — Discord admin automation bot

Welcomes new members, keeps join/leave and voice in/out records, and hands out roles automatically or through click-to-pick role panels.

> **Why a bot and not a webhook?** A Discord webhook can only *post* messages into one channel. It can't see people joining, track voice, or give roles. Those need a bot account connected to Discord's gateway, which is what this is.

## Features

| Feature | What it does |
|---|---|
| **Welcome / goodbye** | Posts a custom message when someone joins or leaves, optionally DMs the welcome. Placeholders: `{user}` `{username}` `{server}` `{count}` |
| **Activity log** | Posts embeds to a staff channel: joins (with account age + ⚠️ for accounts < 7 days old), leaves (with roles they had), voice in / out / move with time spent, role panel changes, auto-role failures |
| **Records** | Every join, leave, voice in/out is saved. View per member or recent, or export a CSV for a date range |
| **Auto roles** | Separate role lists for humans and bots on join. Respects Membership Screening — roles are given once the member accepts the rules |
| **Role panels** | Button panels (up to 10 roles). *Toggle* mode = pick any; *Unique* mode = only one (e.g. year level, section, region) |
| **Linked Roles** | Roles members unlock by connecting their account: verified, voice hours, days as member |
| **Web pages** | Built-in Interactions endpoint, Terms of Service and Privacy Policy pages for the Developer Portal |

## Commands

All commands are admin-only by default (Manage Server). You can change who sees them in Server Settings → Integrations.

- `/welcome set channel [message] [dm]` · `/welcome off` · `/welcome test`
- `/goodbye set channel [message]` · `/goodbye off`
- `/logs set channel` · `/logs off`
- `/autorole add role [for: humans|bots]` · `/autorole remove role` · `/autorole list`
- `/rolepanel create channel title role1 … role10 [mode] [description]`
- `/records user member` · `/records recent [count]` · `/records export [days]` · `/records forget member`
- `/settings`

## Setup (≈10 minutes)

**1. Create the bot**
1. Go to https://discord.com/developers/applications → **New Application**.
2. **Bot** tab → **Reset Token** → copy it (this is `DISCORD_TOKEN`).
3. Same tab, under *Privileged Gateway Intents*, turn on **Server Members Intent**. (Required — without it the bot never sees joins/leaves and will fail to log in.)
4. **General Information** → copy **Application ID** (this is `CLIENT_ID`).

**2. Invite it to your server**
OAuth2 → URL Generator → scopes **bot** + **applications.commands**; bot permissions **Manage Roles, View Channels, Send Messages, Embed Links, Read Message History**. Open the generated URL and pick your server.

Then in Server Settings → Roles, **drag the bot's role above every role it should give out.** Discord blocks bots from assigning roles higher than their own.

**3. Run it**
```bash
npm install
cp .env.example .env        # CLIENT_ID + PUBLIC_KEY are pre-filled; add DISCORD_TOKEN (and GUILD_ID while testing)
npm run deploy              # registers the slash commands
npm start
```
Needs Node.js 18.17+. To get your server ID: User Settings → Advanced → Developer Mode on, then right-click the server → Copy Server ID.

**4. Configure in Discord**
```
/logs set channel:#staff-logs
/welcome set channel:#welcome
/autorole add role:@Member
/rolepanel create channel:#roles title:Pick your interests role1:@Gaming role2:@Coding role3:@Music
```

## Developer Portal URLs (Interactions, Linked Roles, Terms, Privacy)

The bot runs a small web server in the same process (port `PORT`, default 3000). It needs to be reachable at a public **HTTPS** address — set that as `PUBLIC_URL` in `.env`. Then fill in **General Information** in the Developer Portal:

| Portal field | Value | What it does |
|---|---|---|
| Interactions Endpoint URL | `PUBLIC_URL/api/interactions` | Discord sends slash commands and button clicks here as signed HTTP POSTs instead of over the gateway. Optional — see below |
| Linked Roles Verification URL | `PUBLIC_URL/verify-user` | Where members go to connect their account for Linked Roles |
| Terms of Service URL | `PUBLIC_URL/terms-of-service` | Built-in page |
| Privacy Policy URL | `PUBLIC_URL/privacy-policy` | Built-in page |

**Order matters:** start the bot with `PUBLIC_URL` and `PUBLIC_KEY` set *before* saving the Interactions Endpoint URL. When you click Save, Discord sends a test PING and a deliberately bad request; the bot must answer both correctly or the portal refuses the URL.

### Interactions Endpoint URL (optional)

Discord delivers commands and buttons either over the gateway **or** to this URL, never both. Either way, the same code handles them. Setting the URL is optional — the bot works without it. Use it if your host prefers HTTP traffic. Joins, leaves, voice tracking and auto roles always use the gateway, so the bot still needs to stay running. Requests are verified with your app's **Public Key** (Ed25519); anything unsigned or forged gets 401.

To go back to gateway delivery, clear the field in the portal.

### Linked Roles

Lets admins make roles that members unlock by connecting their account, with requirements based on the bot's records:

| Requirement | Meaning |
|---|---|
| Verified | Has connected their account |
| Voice hours | At least N hours in voice channels (across all servers the bot is in) |
| Days as member | At least N days since they first joined |

Setup:
1. Developer Portal → **OAuth2** → copy the **Client Secret** into `CLIENT_SECRET`, and under **Redirects** add `PUBLIC_URL/discord/oauth-callback` exactly.
2. Set the Linked Roles Verification URL to `PUBLIC_URL/verify-user`.
3. Run `npm run deploy` (registers the three requirements along with the commands).
4. In your server: **Server Settings → Roles → (a role) → Links → Add requirement** → pick the bot → choose e.g. *Voice hours ≥ 10*.

Members then see the role's connection option in the server's role menu / Linked Roles list, click it, approve, and get the role automatically when they qualify. Stats update about 30 seconds after each voice session and every 6 hours. The OAuth tokens are stored in `data/guilds.json`, so keep that folder private.

### Terms of Service & Privacy Policy

Set `BOT_NAME`, `OPERATOR_NAME` and `CONTACT_EMAIL` in `.env` — they're filled into the pages. The text describes exactly what this bot stores. Edit `src/pages.js` if you change what it does. It's a starting template, not legal advice.

### Testing locally

Discord can't reach `localhost`, so use a tunnel: `npx cloudflared tunnel --url http://localhost:3000` (or ngrok), and set `PUBLIC_URL` to the `https://…` address it prints. The tunnel URL changes each run, so update the portal fields too.

## Hosting 24/7

The bot only works while `npm start` is running. Options: a spare PC / Raspberry Pi with `pm2` (`npm i -g pm2 && pm2 start src/index.js --name gatekeeper`), or a host that runs always-on Node processes (Railway, Render background worker, Fly.io, a small VPS). Serverless platforms like Vercel won't work — they can't hold the persistent gateway connection. Pick a host that also exposes an HTTPS URL for the web server (Railway, Render *web service*, and Fly.io all do) — use that URL as `PUBLIC_URL`. `GET /health` returns 200 once the bot is connected, which hosts can use as a health check.

Data lives in `data/guilds.json` (set `DATA_DIR` to move it). On hosts with ephemeral disks, point `DATA_DIR` at a mounted volume or the records reset on redeploy. The store is isolated in `src/store.js`, so swapping it for PostgreSQL/Supabase later only touches that file.

## Notes

- Voice durations survive restarts; anyone who left voice while the bot was offline is recorded without a duration.
- Records are capped at 20,000 per server (oldest dropped first) — export regularly if you need a full history.
- Deleting a role panel message automatically deactivates it.

## Project layout

```
src/
  index.js            client, intents, event wiring, graceful shutdown
  deploy-commands.js  registers slash commands
  commands.js         slash command definitions + handlers
  events.js           join/leave, welcome, auto roles, voice tracking, role panel buttons
  interactions.js     routes commands/buttons (same path for gateway and HTTP)
  web.js              HTTP server: /api/interactions, /verify-user, OAuth callback, pages
  linkedroles.js      Linked Roles OAuth + metadata (verified, voice hours, days as member)
  pages.js            Terms of Service, Privacy Policy and status pages
  store.js            JSON persistence (per-server config + records + linked accounts)
  util.js             templates, log embeds, role-hierarchy checks
```
