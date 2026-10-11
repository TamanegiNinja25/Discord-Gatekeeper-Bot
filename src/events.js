import { MessageFlags } from 'discord.js';
import { guildConfig, addRecord, save } from './store.js';
import { fillTemplate, sendLog, logEmbed, formatDuration, roleProblem, COLORS } from './util.js';
import { scheduleMetadataUpdate } from './linkedroles.js';

const tagOf = (user) => user.username;

// ───────────────────────── Members joining / leaving ─────────────────────────

export async function sendWelcome(member, { force = false } = {}) {
  const { welcome } = guildConfig(member.guild.id);
  if ((!welcome.enabled && !force) || !welcome.channelId) return;
  const text = fillTemplate(welcome.message, member);

  const channel = await member.guild.channels.fetch(welcome.channelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel
      .send({ content: text, allowedMentions: { users: [member.id] } })
      .catch((err) => console.warn(`[welcome] ${member.guild.name}: ${err.message}`));
  }
  if (welcome.dm && !member.user.bot) {
    await member.send(text).catch(() => {}); // many users block DMs from servers; that's fine
  }
}

async function giveAutoRoles(member) {
  const { autoRoles } = guildConfig(member.guild.id);
  const ids = member.user.bot ? autoRoles.bots : autoRoles.humans;
  if (!ids.length) return [];

  const given = [];
  for (const id of ids) {
    const role = member.guild.roles.cache.get(id);
    if (!role) continue; // role was deleted
    const problem = roleProblem(member.guild, role);
    if (problem) {
      await sendLog(member.guild, logEmbed(COLORS.warn, 'Auto role failed', `Couldn’t give ${role} to <@${member.id}>: ${problem}`));
      continue;
    }
    try {
      await member.roles.add(role, 'Auto role on join');
      given.push(role);
    } catch (err) {
      await sendLog(member.guild, logEmbed(COLORS.warn, 'Auto role failed', `${role} → <@${member.id}>: ${err.message}`));
    }
  }
  return given;
}

export async function onMemberJoin(member) {
  addRecord(member.guild.id, { type: 'join', userId: member.id, tag: tagOf(member.user) });
  scheduleMetadataUpdate(member.id);

  // Members who must pass Membership Screening (rules gate) get roles after they accept — see onMemberUpdate.
  const given = member.pending ? [] : await giveAutoRoles(member);
  await sendWelcome(member);

  const ageDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);
  const lines = [
    `<@${member.id}> (${tagOf(member.user)}) · \`${member.id}\``,
    `Account created <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>${ageDays < 7 ? ' ⚠️ **new account**' : ''}`,
    `Member #${member.guild.memberCount}`,
  ];
  if (given.length) lines.push(`Auto roles: ${given.join(', ')}`);
  if (member.pending) lines.push('_Waiting on rules screening — auto roles will be given after they accept._');
  await sendLog(
    member.guild,
    logEmbed(COLORS.join, member.user.bot ? '🤖 Bot added' : '🟢 Member joined', lines.join('\n')).setThumbnail(
      member.user.displayAvatarURL(),
    ),
  );
}

export async function onMemberUpdate(oldMember, newMember) {
  // Membership Screening completed → hand out auto roles now.
  if (oldMember.pending && !newMember.pending) {
    const given = await giveAutoRoles(newMember);
    if (given.length) {
      await sendLog(newMember.guild, logEmbed(COLORS.join, '✅ Rules accepted', `<@${newMember.id}> got ${given.join(', ')}`));
    }
  }
}

export async function onMemberLeave(member) {
  const cfg = guildConfig(member.guild.id);
  closeVoiceSession(member.guild, member.id, 'leave'); // left server while in voice
  addRecord(member.guild.id, { type: 'leave', userId: member.id, tag: tagOf(member.user) });

  if (cfg.goodbye.enabled && cfg.goodbye.channelId) {
    const channel = await member.guild.channels.fetch(cfg.goodbye.channelId).catch(() => null);
    if (channel?.isTextBased()) {
      await channel
        .send({ content: fillTemplate(cfg.goodbye.message, member), allowedMentions: { parse: [] } })
        .catch((err) => console.warn(`[goodbye] ${member.guild.name}: ${err.message}`));
    }
  }

  const lines = [`<@${member.id}> (${tagOf(member.user)}) · \`${member.id}\``];
  if (member.joinedTimestamp) lines.push(`Joined <t:${Math.floor(member.joinedTimestamp / 1000)}:R>`);
  const roles = member.roles?.cache.filter((r) => r.id !== member.guild.id);
  if (roles?.size) lines.push(`Roles: ${roles.map((r) => r.toString()).join(', ')}`);
  await sendLog(member.guild, logEmbed(COLORS.leave, '🔴 Member left', lines.join('\n')).setThumbnail(member.user.displayAvatarURL()));
}

// ───────────────────────── Voice in / out records ─────────────────────────

function closeVoiceSession(guild, userId, reason) {
  const cfg = guildConfig(guild.id);
  const session = cfg.voiceSessions[userId];
  if (!session) return null;
  delete cfg.voiceSessions[userId];
  save();
  return { ...session, durationMs: Date.now() - session.joinedAt, reason };
}

export async function onVoiceUpdate(oldState, newState) {
  const guild = newState.guild;
  const member = newState.member ?? oldState.member;
  if (!member) return;
  const cfg = guildConfig(guild.id);
  const from = oldState.channelId;
  const to = newState.channelId;
  if (from === to) return; // mute/deafen/stream changes — not an in/out event
  if (from) scheduleMetadataUpdate(member.id); // a voice session just ended → voice hours changed

  const tag = tagOf(member.user);

  if (!from && to) {
    cfg.voiceSessions[member.id] = { channelId: to, joinedAt: Date.now() };
    addRecord(guild.id, { type: 'voice_in', userId: member.id, tag, channelId: to });
    await sendLog(guild, logEmbed(COLORS.voice, '🔊 Voice in', `<@${member.id}> joined <#${to}>`));
  } else if (from && !to) {
    const s = closeVoiceSession(guild, member.id, 'out');
    const durationMs = s?.durationMs;
    addRecord(guild.id, { type: 'voice_out', userId: member.id, tag, channelId: from, durationMs });
    await sendLog(
      guild,
      logEmbed(COLORS.voice, '🔇 Voice out', `<@${member.id}> left <#${from}>${durationMs ? ` after **${formatDuration(durationMs)}**` : ''}`),
    );
  } else {
    // Moved between channels: close the old session, start a new one.
    const s = closeVoiceSession(guild, member.id, 'move');
    cfg.voiceSessions[member.id] = { channelId: to, joinedAt: Date.now() };
    addRecord(guild.id, { type: 'voice_move', userId: member.id, tag, channelId: to, durationMs: s?.durationMs });
    await sendLog(guild, logEmbed(COLORS.voice, '↔️ Voice move', `<@${member.id}> moved <#${from}> → <#${to}>`));
  }
}

/** After a restart, sessions saved on disk may be stale. Reconcile with who is actually in voice now. */
export function reconcileVoice(guild) {
  const cfg = guildConfig(guild.id);
  const now = Date.now();
  for (const [userId, s] of Object.entries(cfg.voiceSessions)) {
    const state = guild.voiceStates.cache.get(userId);
    if (state?.channelId === s.channelId) continue; // still there, keep timing
    delete cfg.voiceSessions[userId];
    // Exact leave time unknown (bot was offline) — record it without a duration.
    addRecord(guild.id, { type: 'voice_out', userId, tag: '(left while bot offline)', channelId: s.channelId, at: now });
  }
  for (const state of guild.voiceStates.cache.values()) {
    if (state.channelId && !cfg.voiceSessions[state.id]) {
      cfg.voiceSessions[state.id] = { channelId: state.channelId, joinedAt: now };
    }
  }
  save();
}

// ───────────────────────── Role panel buttons ─────────────────────────

export async function onRoleButton(interaction) {
  const roleId = interaction.customId.slice('role:'.length);
  const cfg = guildConfig(interaction.guildId);
  const panel = cfg.rolePanels[interaction.message.id];
  const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

  if (!panel || !panel.roleIds.includes(roleId)) return reply('This role panel is no longer active.');
  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) return reply('That role no longer exists — ask an admin to recreate the panel.');
  const problem = roleProblem(interaction.guild, role);
  if (problem) return reply(`I can’t manage that role right now. ${problem}`);

  const member = interaction.member;
  try {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(role, 'Role panel');
      await reply(`Removed ${role}.`);
      await sendLog(interaction.guild, logEmbed(COLORS.info, 'Role removed (panel)', `<@${member.id}> − ${role}`));
      return;
    }
    let swapped = [];
    if (panel.mode === 'unique') {
      swapped = panel.roleIds.filter((id) => id !== roleId && member.roles.cache.has(id));
      if (swapped.length) await member.roles.remove(swapped, 'Role panel (unique swap)');
    }
    await member.roles.add(role, 'Role panel');
    const extra = swapped.length ? ` (removed ${swapped.map((id) => `<@&${id}>`).join(', ')})` : '';
    await reply(`Added ${role}${extra}.`);
    await sendLog(interaction.guild, logEmbed(COLORS.info, 'Role added (panel)', `<@${member.id}> + ${role}${extra}`));
  } catch (err) {
    console.warn(`[rolepanel] ${err.message}`);
    if (!interaction.replied) await reply('Something went wrong changing your roles. Ask an admin to check my permissions.');
  }
}

/** Forget panels whose message was deleted. */
export function onMessageDelete(message) {
  if (!message.guildId) return;
  const cfg = guildConfig(message.guildId);
  if (cfg.rolePanels[message.id]) {
    delete cfg.rolePanels[message.id];
    save();
  }
}
