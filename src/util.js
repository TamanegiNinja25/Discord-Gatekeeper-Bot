import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { guildConfig } from './store.js';

/** Fill {user} {username} {server} {count} placeholders. */
export function fillTemplate(text, member) {
  return text
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{count}', String(member.guild.memberCount));
}

export function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h && `${h}h`, m && `${m}m`, `${sec}s`].filter(Boolean).join(' ');
}

export const COLORS = { join: 0x2ecc71, leave: 0xe74c3c, voice: 0x5865f2, info: 0x95a5a6, warn: 0xf1c40f };

/** Send an embed to the server's configured log channel (silently skip if unset/unreachable). */
export async function sendLog(guild, embed) {
  const { logChannelId } = guildConfig(guild.id);
  if (!logChannelId) return;
  const channel = await guild.channels.fetch(logChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel.send({ embeds: [embed] }).catch((err) => console.warn(`[log] ${guild.name}: ${err.message}`));
}

export function logEmbed(color, title, description) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp();
}

/**
 * Can the bot hand out this role? Returns an error string, or null if fine.
 * Discord only lets a bot manage roles strictly below its own highest role.
 */
export function roleProblem(guild, role) {
  const me = guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return 'I need the **Manage Roles** permission.';
  if (role.id === guild.id) return 'You can’t assign @everyone.';
  if (role.managed) return `${role} is managed by an integration and can’t be assigned.`;
  if (role.position >= me.roles.highest.position) {
    return `${role} is above or equal to my highest role. Drag my role above it in Server Settings → Roles.`;
  }
  return null;
}
