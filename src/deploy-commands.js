// Registers slash commands + Linked Roles metadata with Discord.
// Run once, and again whenever either changes: npm run deploy
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { commandData } from './commands.js';
import { METADATA } from './linkedroles.js';

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Set DISCORD_TOKEN and CLIENT_ID in .env first.');
  process.exit(1);
}

const rest = new REST().setToken(DISCORD_TOKEN);
const route = GUILD_ID ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID) : Routes.applicationCommands(CLIENT_ID);

try {
  const result = await rest.put(route, { body: commandData });
  console.log(`✅ Registered ${result.length} commands ${GUILD_ID ? `to server ${GUILD_ID} (instant)` : 'globally (may take up to an hour)'}.`);

  const meta = await rest.put(Routes.applicationRoleConnectionMetadata(CLIENT_ID), { body: METADATA });
  console.log(`✅ Registered ${meta.length} Linked Roles requirements: ${meta.map((m) => m.name).join(', ')}.`);
} catch (err) {
  console.error('Failed to register with Discord:', err);
  process.exit(1);
}
