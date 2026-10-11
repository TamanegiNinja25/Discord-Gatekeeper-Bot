import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  MessageFlags,
  InteractionContextType,
} from 'discord.js';
import { guildConfig, save, forgetUser } from './store.js';
import { fillTemplate, roleProblem, formatDuration, COLORS } from './util.js';

const textChannel = (o, name, desc, required = true) =>
  o.setName(name).setDescription(desc).setRequired(required).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

const ADMIN = PermissionFlagsBits.ManageGuild;

// ───────────────────────── Command definitions ─────────────────────────

const welcome = new SlashCommandBuilder()
  .setName('welcome')
  .setDescription('Configure welcome messages for new members')
  .setDefaultMemberPermissions(ADMIN)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('set')
      .setDescription('Turn on welcomes in a channel')
      .addChannelOption((o) => textChannel(o, 'channel', 'Where to post welcomes'))
      .addStringOption((o) =>
        o.setName('message').setDescription('Placeholders: {user} {username} {server} {count}').setMaxLength(1500),
      )
      .addBooleanOption((o) => o.setName('dm').setDescription('Also DM the welcome to the new member')),
  )
  .addSubcommand((s) => s.setName('off').setDescription('Turn off welcome messages'))
  .addSubcommand((s) => s.setName('test').setDescription('Preview the welcome using yourself'));

const goodbye = new SlashCommandBuilder()
  .setName('goodbye')
  .setDescription('Configure messages when members leave')
  .setDefaultMemberPermissions(ADMIN)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('set')
      .setDescription('Turn on goodbye messages in a channel')
      .addChannelOption((o) => textChannel(o, 'channel', 'Where to post goodbyes'))
      .addStringOption((o) =>
        o.setName('message').setDescription('Placeholders: {user} {username} {server} {count}').setMaxLength(1500),
      ),
  )
  .addSubcommand((s) => s.setName('off').setDescription('Turn off goodbye messages'));

const logs = new SlashCommandBuilder()
  .setName('logs')
  .setDescription('Set the admin log channel (joins, leaves, voice in/out, role changes)')
  .setDefaultMemberPermissions(ADMIN)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('set')
      .setDescription('Send activity logs to a channel')
      .addChannelOption((o) => textChannel(o, 'channel', 'Private staff channel recommended')),
  )
  .addSubcommand((s) => s.setName('off').setDescription('Stop posting logs (records are still saved)'));

const autorole = new SlashCommandBuilder()
  .setName('autorole')
  .setDescription('Roles given automatically when someone joins')
  .setDefaultMemberPermissions(ADMIN)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('add')
      .setDescription('Give a role automatically on join')
      .addRoleOption((o) => o.setName('role').setDescription('Role to give').setRequired(true))
      .addStringOption((o) =>
        o
          .setName('for')
          .setDescription('Who gets it (default: humans)')
          .addChoices({ name: 'Humans', value: 'humans' }, { name: 'Bots', value: 'bots' }),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName('remove')
      .setDescription('Stop giving a role on join')
      .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
  )
  .addSubcommand((s) => s.setName('list').setDescription('Show auto roles'));

const rolepanel = new SlashCommandBuilder()
  .setName('rolepanel')
  .setDescription('Post a button panel members click to pick their own roles')
  .setDefaultMemberPermissions(ADMIN)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => {
    s.setName('create')
      .setDescription('Create a self-assign role panel')
      .addChannelOption((o) => textChannel(o, 'channel', 'Where to post the panel'))
      .addStringOption((o) => o.setName('title').setDescription('Panel title').setRequired(true).setMaxLength(200))
      .addRoleOption((o) => o.setName('role1').setDescription('Role').setRequired(true));
    for (let i = 2; i <= 10; i++) s.addRoleOption((o) => o.setName(`role${i}`).setDescription('Role'));
    s.addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('Toggle (pick any) or unique (only one at a time)')
        .addChoices({ name: 'Toggle — pick any', value: 'toggle' }, { name: 'Unique — only one', value: 'unique' }),
    ).addStringOption((o) => o.setName('description').setDescription('Text shown above the buttons').setMaxLength(1000));
    return s;
  });

const records = new SlashCommandBuilder()
  .setName('records')
  .setDescription('View join/leave and voice in/out records')
  .setDefaultMemberPermissions(ADMIN)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('user')
      .setDescription('Recent activity for one member')
      .addUserOption((o) => o.setName('member').setDescription('Member').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('recent')
      .setDescription('Most recent server activity')
      .addIntegerOption((o) => o.setName('count').setDescription('How many (default 15)').setMinValue(1).setMaxValue(25)),
  )
  .addSubcommand((s) =>
    s
      .setName('export')
      .setDescription('Download records as a CSV')
      .addIntegerOption((o) => o.setName('days').setDescription('Last N days (default: all)').setMinValue(1)),
  )
  .addSubcommand((s) =>
    s
      .setName('forget')
      .setDescription('Delete all stored records for a member (privacy request)')
      .addUserOption((o) => o.setName('member').setDescription('Member').setRequired(true)),
  );

const settings = new SlashCommandBuilder()
  .setName('settings')
  .setDescription('Show the bot’s current setup for this server')
  .setDefaultMemberPermissions(ADMIN)
  .setContexts(InteractionContextType.Guild);

export const commandData = [welcome, goodbye, logs, autorole, rolepanel, records, settings].map((c) => c.toJSON());

// ───────────────────────── Handlers ─────────────────────────

const ephemeral = MessageFlags.Ephemeral;
const reply = (i, content) => i.reply({ content, flags: ephemeral });

async function canPostIn(interaction, channel) {
  const perms = channel.permissionsFor(interaction.guild.members.me);
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
  if (perms?.has(needed)) return true;
  await reply(interaction, `I can’t post in ${channel} — I need View Channel, Send Messages and Embed Links there.`);
  return false;
}

const handlers = {
  async welcome(i) {
    const cfg = guildConfig(i.guildId);
    const sub = i.options.getSubcommand();
    if (sub === 'set') {
      const channel = i.options.getChannel('channel', true);
      if (!(await canPostIn(i, channel))) return;
      cfg.welcome.enabled = true;
      cfg.welcome.channelId = channel.id;
      cfg.welcome.message = i.options.getString('message') ?? cfg.welcome.message;
      cfg.welcome.dm = i.options.getBoolean('dm') ?? cfg.welcome.dm;
      save();
      return reply(i, `✅ Welcomes on in ${channel}${cfg.welcome.dm ? ' (+ DM)' : ''}.\nPreview: ${fillTemplate(cfg.welcome.message, i.member)}`);
    }
    if (sub === 'off') {
      cfg.welcome.enabled = false;
      save();
      return reply(i, 'Welcome messages turned off.');
    }
    if (sub === 'test') {
      if (!cfg.welcome.channelId) return reply(i, 'Run `/welcome set` first.');
      const { sendWelcome } = await import('./events.js');
      await sendWelcome(i.member, { force: true });
      return reply(i, `Sent a test welcome to <#${cfg.welcome.channelId}>.`);
    }
  },

  async goodbye(i) {
    const cfg = guildConfig(i.guildId);
    if (i.options.getSubcommand() === 'off') {
      cfg.goodbye.enabled = false;
      save();
      return reply(i, 'Goodbye messages turned off.');
    }
    const channel = i.options.getChannel('channel', true);
    if (!(await canPostIn(i, channel))) return;
    cfg.goodbye.enabled = true;
    cfg.goodbye.channelId = channel.id;
    cfg.goodbye.message = i.options.getString('message') ?? cfg.goodbye.message;
    save();
    return reply(i, `✅ Goodbyes on in ${channel}.`);
  },

  async logs(i) {
    const cfg = guildConfig(i.guildId);
    if (i.options.getSubcommand() === 'off') {
      cfg.logChannelId = null;
      save();
      return reply(i, 'Log channel cleared. Records are still saved — see `/records`.');
    }
    const channel = i.options.getChannel('channel', true);
    if (!(await canPostIn(i, channel))) return;
    cfg.logChannelId = channel.id;
    save();
    return reply(i, `✅ Logging joins, leaves, voice in/out and role changes to ${channel}.`);
  },

  async autorole(i) {
    const cfg = guildConfig(i.guildId);
    const sub = i.options.getSubcommand();
    if (sub === 'list') {
      const fmt = (ids) => (ids.length ? ids.map((id) => `<@&${id}>`).join(', ') : '_none_');
      return reply(i, `**Humans:** ${fmt(cfg.autoRoles.humans)}\n**Bots:** ${fmt(cfg.autoRoles.bots)}`);
    }
    const role = i.options.getRole('role', true);
    if (sub === 'remove') {
      cfg.autoRoles.humans = cfg.autoRoles.humans.filter((id) => id !== role.id);
      cfg.autoRoles.bots = cfg.autoRoles.bots.filter((id) => id !== role.id);
      save();
      return reply(i, `Removed ${role} from auto roles.`);
    }
    const problem = roleProblem(i.guild, role);
    if (problem) return reply(i, `⚠️ ${problem}`);
    const target = i.options.getString('for') ?? 'humans';
    const list = cfg.autoRoles[target];
    if (list.includes(role.id)) return reply(i, `${role} is already an auto role for ${target}.`);
    if (list.length >= 10) return reply(i, 'Max 10 auto roles per group.');
    list.push(role.id);
    save();
    return reply(i, `✅ New ${target} will get ${role} automatically.`);
  },

  async rolepanel(i) {
    const cfg = guildConfig(i.guildId);
    const channel = i.options.getChannel('channel', true);
    if (!(await canPostIn(i, channel))) return;

    const roles = [];
    for (let n = 1; n <= 10; n++) {
      const r = i.options.getRole(`role${n}`);
      if (r && !roles.some((x) => x.id === r.id)) roles.push(r);
    }
    for (const r of roles) {
      const problem = roleProblem(i.guild, r);
      if (problem) return reply(i, `⚠️ ${problem}`);
    }

    const mode = i.options.getString('mode') ?? 'toggle';
    const hint = mode === 'unique' ? 'Pick **one** — choosing another swaps it.' : 'Click to add a role, click again to remove it.';
    const embed = new EmbedBuilder()
      .setColor(COLORS.voice)
      .setTitle(i.options.getString('title', true))
      .setDescription(`${i.options.getString('description') ?? ''}\n\n${roles.map((r) => `• ${r}`).join('\n')}\n\n_${hint}_`.trim());

    const rows = [];
    for (let n = 0; n < roles.length; n += 5) {
      rows.push(
        new ActionRowBuilder().addComponents(
          roles.slice(n, n + 5).map((r) =>
            new ButtonBuilder().setCustomId(`role:${r.id}`).setLabel(r.name.slice(0, 80)).setStyle(ButtonStyle.Secondary),
          ),
        ),
      );
    }

    const msg = await channel.send({ embeds: [embed], components: rows });
    cfg.rolePanels[msg.id] = { channelId: channel.id, mode, roleIds: roles.map((r) => r.id) };
    save();
    return reply(i, `✅ Role panel posted: ${msg.url}`);
  },

  async records(i) {
    const cfg = guildConfig(i.guildId);
    const sub = i.options.getSubcommand();

    if (sub === 'forget') {
      const user = i.options.getUser('member', true);
      const n = forgetUser(i.guildId, user.id);
      return reply(i, `🗑️ Deleted ${n} record(s) for ${user.username} in this server.`);
    }

    if (sub === 'export') {
      const days = i.options.getInteger('days');
      const since = days ? Date.now() - days * 86_400_000 : 0;
      const rows = cfg.records.filter((r) => r.at >= since);
      if (!rows.length) return reply(i, 'No records yet.');
      const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
      const csv = [
        'timestamp_utc,event,user_id,username,channel_id,duration_seconds',
        ...rows.map((r) =>
          [new Date(r.at).toISOString(), r.type, r.userId, r.tag, r.channelId ?? '', r.durationMs ? Math.round(r.durationMs / 1000) : '']
            .map(esc)
            .join(','),
        ),
      ].join('\n');
      const file = new AttachmentBuilder(Buffer.from(csv, 'utf8'), { name: `records-${i.guild.id}.csv` });
      return i.reply({ content: `📄 ${rows.length} records.`, files: [file], flags: ephemeral });
    }

    let rows;
    let title;
    if (sub === 'user') {
      const user = i.options.getUser('member', true);
      rows = cfg.records.filter((r) => r.userId === user.id).slice(-20);
      title = `Records for ${user.username}`;
    } else {
      rows = cfg.records.slice(-(i.options.getInteger('count') ?? 15));
      title = 'Recent activity';
    }
    if (!rows.length) return reply(i, 'No records found.');

    const label = {
      join: '🟢 joined server',
      leave: '🔴 left server',
      voice_in: '🔊 joined voice',
      voice_out: '🔇 left voice',
      voice_move: '↔️ moved voice',
    };
    const lines = rows.reverse().map((r) => {
      const where = r.channelId ? ` <#${r.channelId}>` : '';
      const dur = r.durationMs ? ` · ${formatDuration(r.durationMs)}` : '';
      return `<t:${Math.floor(r.at / 1000)}:f> ${label[r.type] ?? r.type} — <@${r.userId}>${where}${dur}`;
    });
    const embed = new EmbedBuilder().setColor(COLORS.info).setTitle(title).setDescription(lines.join('\n').slice(0, 4000));
    return i.reply({ embeds: [embed], flags: ephemeral, allowedMentions: { parse: [] } });
  },

  async settings(i) {
    const c = guildConfig(i.guildId);
    const ch = (id) => (id ? `<#${id}>` : '_not set_');
    const roles = (ids) => (ids.length ? ids.map((id) => `<@&${id}>`).join(', ') : '_none_');
    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle(`Setup for ${i.guild.name}`)
      .addFields(
        { name: 'Welcome', value: c.welcome.enabled ? `${ch(c.welcome.channelId)}${c.welcome.dm ? ' + DM' : ''}` : 'off', inline: true },
        { name: 'Goodbye', value: c.goodbye.enabled ? ch(c.goodbye.channelId) : 'off', inline: true },
        { name: 'Log channel', value: ch(c.logChannelId), inline: true },
        { name: 'Auto roles (humans)', value: roles(c.autoRoles.humans), inline: true },
        { name: 'Auto roles (bots)', value: roles(c.autoRoles.bots), inline: true },
        { name: 'Role panels', value: String(Object.keys(c.rolePanels).length), inline: true },
        { name: 'Records stored', value: String(c.records.length), inline: true },
      );
    return i.reply({ embeds: [embed], flags: ephemeral });
  },
};

export async function handleCommand(interaction) {
  const fn = handlers[interaction.commandName];
  if (fn) await fn(interaction);
}
