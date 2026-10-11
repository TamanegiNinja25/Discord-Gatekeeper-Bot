import './env.js'; // must be first: loads .env + platform defaults
import { Client, GatewayIntentBits, Partials, Events, ActivityType } from 'discord.js';
import { onMemberJoin, onMemberLeave, onMemberUpdate, onVoiceUpdate, onMessageDelete, reconcileVoice } from './events.js';
import { routeInteraction } from './interactions.js';
import { initLinkedRoles, startPeriodicRefresh, linkedRolesConfigured } from './linkedroles.js';
import { startWebServer } from './web.js';
import { flush } from './store.js';
import { registerWithDiscord } from './register.js';

if (!process.env.DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privileged: enable "Server Members Intent" in the Developer Portal
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages, // to notice deleted role-panel messages
  ],
  partials: [Partials.GuildMember, Partials.Message, Partials.User],
});

// Wrap handlers so one failure never crashes the bot.
const safe = (name, fn) => async (...args) => {
  try {
    await fn(...args);
  } catch (err) {
    console.error(`[${name}]`, err);
  }
};

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag} — serving ${c.guilds.cache.size} server(s)`);
  c.user.setActivity('the gates', { type: ActivityType.Watching });
  for (const guild of c.guilds.cache.values()) reconcileVoice(guild);
  if (linkedRolesConfigured()) startPeriodicRefresh();
  if (process.env.REGISTER_COMMANDS !== 'false') {
    registerWithDiscord().catch((err) => console.error('[register] Could not register commands:', err.message));
  }
});

client.on(Events.GuildMemberAdd, safe('memberAdd', onMemberJoin));
client.on(Events.GuildMemberRemove, safe('memberRemove', onMemberLeave));
client.on(Events.GuildMemberUpdate, safe('memberUpdate', onMemberUpdate));
client.on(Events.VoiceStateUpdate, safe('voice', onVoiceUpdate));
client.on(Events.MessageDelete, safe('messageDelete', onMessageDelete));

// Slash commands + buttons. Arrive here from the gateway OR from POST /api/interactions (web.js).
client.on(Events.InteractionCreate, (interaction) => {
  routeInteraction(interaction);
});

initLinkedRoles(client);
const server = startWebServer(client);

function shutdown() {
  console.log('Saving data and shutting down…');
  try {
    flush();
  } finally {
    server.close();
    client.destroy();
    process.exit(0);
  }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

client.login(process.env.DISCORD_TOKEN);
