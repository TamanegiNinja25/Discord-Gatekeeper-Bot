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
npm start                   # also registers the slash commands on startup
```
Needs Node.js 22. To get your server ID: User Settings → Advanced → Developer Mode on, then right-click the server → Copy Server ID.

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
3. Restart the bot (it registers the three requirements on startup; `npm run deploy` does the same by hand).
4. In your server: **Server Settings → Roles → (a role) → Links → Add requirement** → pick the bot → choose e.g. *Voice hours ≥ 10*.

Members then see the role's connection option in the server's role menu / Linked Roles list, click it, approve, and get the role automatically when they qualify. Stats update about 30 seconds after each voice session and every 6 hours. The OAuth tokens are stored in `data/guilds.json`, so keep that folder private.

### Terms of Service & Privacy Policy

Set `BOT_NAME`, `OPERATOR_NAME` and `CONTACT_EMAIL` in `.env` — they're filled into the pages. The text describes exactly what this bot stores. Edit `src/pages.js` if you change what it does. It's a starting template, not legal advice.

### Testing locally

Discord can't reach `localhost`, so use a tunnel: `npx cloudflared tunnel --url http://localhost:3000` (or ngrok), and set `PUBLIC_URL` to the `https://…` address it prints. The tunnel URL changes each run, so update the portal fields too.

## Deploy on Railway (recommended)

The bot has to run 24/7 and keep its data on a disk. Railway does both, deploys automatically from this GitHub repo, and gives you the HTTPS address the Developer Portal needs. The Hobby plan is $5/month and includes $5 of usage, which a bot this size normally stays within.

> **Not Vercel:** Vercel runs code for a few seconds per web request and then shuts it down, and it doesn't keep files. The bot would never stay online, and its records would vanish.

**1. Create the service**
1. Sign in at [railway.com](https://railway.com) with GitHub → **New Project → Deploy from GitHub repo** → pick **Discord-Gatekeeper-Bot**.
2. Railway detects Node.js and runs `npm start` by itself. No config file needed.

**2. Add a volume (do this before inviting people — it's where all records live)**
Right-click the service on the project canvas → **Attach volume** → mount path **`/data`**. The bot finds it automatically. Without a volume, records and settings are wiped on every deploy, and the logs show a ⚠️ warning.

**3. Add variables** (service → **Variables** → *Raw Editor*, paste and fill in):
```
DISCORD_TOKEN=
CLIENT_ID=1558698425762193408
PUBLIC_KEY=770b2066e4b89df3cdd8c6c378f720088cd10487c3564e4441de64a4391783b7
CLIENT_SECRET=
OPERATOR_NAME=
CONTACT_EMAIL=
```
Don't set `PORT`, `PUBLIC_URL` or `DATA_DIR`; Railway provides them. Add `GUILD_ID=your-server-id` if you want new commands to show up instantly in one server.

**4. Get the public address**
Service → **Settings → Networking → Generate Domain**. You get something like `https://discord-gatekeeper-bot-production.up.railway.app`. That's your `PUBLIC_URL`. Opening it shows the bot's status page.

**5. Optional: health check**
Settings → **Deploy → Healthcheck Path** = `/health`. Railway then only switches to a new version once it has connected to Discord, so a broken token can't take the bot down.

**6. Finish in the Developer Portal**
Fill in the four URLs from [Developer Portal URLs](#developer-portal-urls-interactions-linked-roles-terms-privacy), using your Railway domain, and add `https://YOUR-DOMAIN/discord/oauth-callback` under OAuth2 → Redirects. Save the Interactions Endpoint URL **after** the deploy shows *Active*, because Discord tests it immediately.

Slash commands and Linked Roles requirements are registered automatically every time the bot starts, so there's no `npm run deploy` step on Railway. Every push to `main` redeploys automatically.

### Other hosts

Anything that keeps a Node process running with a persistent disk works: Render (paid instance + disk; the free tier sleeps after 15 minutes, which takes the bot offline), Fly.io, a VPS, or a spare PC with `pm2` (`npm i -g pm2 && pm2 start src/index.js --name gatekeeper`). Set `PUBLIC_URL` and `DATA_DIR` yourself there. `GET /health` returns 200 once the bot is connected.

Data lives in `data/guilds.json` (or `DATA_DIR`). The store is isolated in `src/store.js`, so swapping it for PostgreSQL/Supabase later only touches that file.

## Notes

- Voice durations survive restarts; anyone who left voice while the bot was offline is recorded without a duration.
- Records are capped at 20,000 per server (oldest dropped first) — export regularly if you need a full history.
- Deleting a role panel message automatically deactivates it.

## Project layout

```
src/
  index.js            client, intents, event wiring, graceful shutdown
  env.js              loads .env + auto-detects Railway/Render settings
  register.js         registers slash commands + Linked Roles requirements
  deploy-commands.js  `npm run deploy` (manual registration)
  commands.js         slash command definitions + handlers
  events.js           join/leave, welcome, auto roles, voice tracking, role panel buttons
  interactions.js     routes commands/buttons (same path for gateway and HTTP)
  web.js              HTTP server: /api/interactions, /verify-user, OAuth callback, pages
  linkedroles.js      Linked Roles OAuth + metadata (verified, voice hours, days as member)
  pages.js            Terms of Service, Privacy Policy and status pages
  store.js            JSON persistence (per-server config + records + linked accounts)
  util.js             templates, log embeds, role-hierarchy checks
```
