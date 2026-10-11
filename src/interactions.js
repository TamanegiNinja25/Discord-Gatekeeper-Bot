// One router for slash commands + buttons, no matter how Discord delivered them
// (over the gateway, or as an HTTP POST to the Interactions Endpoint URL).
import { MessageFlags } from 'discord.js';
import { handleCommand } from './commands.js';
import { onRoleButton } from './events.js';

/** interaction.id -> promise of its handler, so the HTTP endpoint can wait for the reply to go out. */
export const inflight = new Map();

export function routeInteraction(interaction) {
  const p = run(interaction).finally(() => inflight.delete(interaction.id));
  inflight.set(interaction.id, p);
  return p;
}

async function run(interaction) {
  if (!interaction.inGuild()) return;
  try {
    if (interaction.isChatInputCommand()) await handleCommand(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith('role:')) await onRoleButton(interaction);
  } catch (err) {
    console.error('[interaction]', err);
    const msg = { content: '⚠️ Something went wrong. Check my permissions and try again.', flags: MessageFlags.Ephemeral };
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
      else await interaction.reply(msg).catch(() => {});
    }
  }
}
