// Registers slash commands + Linked Roles requirements with Discord.
// Safe to run repeatedly: each call replaces the previous registration.
import { REST, Routes } from 'discord.js';
import { commandData } from './commands.js';
import { METADATA } from './linkedroles.js';

export async function registerWithDiscord() {
  const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
  if (!DISCORD_TOKEN || !CLIENT_ID) throw new Error('Set DISCORD_TOKEN and CLIENT_ID first.');

  const rest = new REST().setToken(DISCORD_TOKEN);
  const route = GUILD_ID ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID) : Routes.applicationCommands(CLIENT_ID);

  const cmds = await rest.put(route, { body: commandData });
  console.log(`✅ Registered ${cmds.length} commands ${GUILD_ID ? `to server ${GUILD_ID}` : 'globally (new ones can take up to an hour to appear)'}.`);

  const meta = await rest.put(Routes.applicationRoleConnectionMetadata(CLIENT_ID), { body: METADATA });
  console.log(`✅ Registered ${meta.length} Linked Roles requirements.`);
}
