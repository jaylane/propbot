import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../index.js';
import { upsertMonitor, getMonitor, setMonitorActive } from '../db/index.js';
import { startMonitor, stopMonitor } from '../services/monitor.js';
import { buildSuccessEmbed, buildErrorEmbed } from '../utils/embeds.js';
import { COLORS } from '../utils/constants.js';
import { client } from '../client.js';

const DEFAULT_INTERVAL_MIN = parseInt(process.env.MONITOR_INTERVAL_MINUTES ?? '5', 10);

const monitor: Command = {
  data: new SlashCommandBuilder()
    .setName('monitor')
    .setDescription('Control live game monitoring')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('Start posting live updates to a channel')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel to post updates (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false))
        .addIntegerOption(opt =>
          opt.setName('interval')
            .setDescription(`Update interval in minutes (default: ${DEFAULT_INTERVAL_MIN})`)
            .setMinValue(1)
            .setMaxValue(60)
            .setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('stop')
        .setDescription('Stop live monitoring')
    )
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Show current monitor configuration')
    ) as any,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      await handleStart(interaction);
    } else if (sub === 'stop') {
      await handleStop(interaction);
    } else if (sub === 'status') {
      await handleStatus(interaction);
    }
  },
};

async function handleStart(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.options.getChannel('channel') ?? interaction.channel;
  const intervalMin = interaction.options.getInteger('interval') ?? DEFAULT_INTERVAL_MIN;
  const intervalMs = intervalMin * 60_000;

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ embeds: [buildErrorEmbed('Please specify a valid text channel.')], ephemeral: true });
    return;
  }

  upsertMonitor(interaction.guildId!, channel.id, interaction.user.id, intervalMs);

  const monitorRow = getMonitor(interaction.guildId!)!;
  startMonitor(client, monitorRow);

  await interaction.reply({
    embeds: [buildSuccessEmbed(
      'Monitor Started',
      `Posting live updates to <#${channel.id}> every **${intervalMin} minute${intervalMin !== 1 ? 's' : ''}**.\n\nUpdates will show when tracked games are in progress.`
    )],
  });
}

async function handleStop(interaction: ChatInputCommandInteraction): Promise<void> {
  const existing = getMonitor(interaction.guildId!);
  if (!existing || !existing.active) {
    await interaction.reply({ embeds: [buildErrorEmbed('No active monitor found.')], ephemeral: true });
    return;
  }

  stopMonitor(interaction.guildId!);
  await interaction.reply({ embeds: [buildSuccessEmbed('Monitor Stopped', 'Live updates have been paused.')] });
}

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const monitor = getMonitor(interaction.guildId!);

  const embed = new EmbedBuilder()
    .setColor(monitor?.active ? COLORS.HIT : COLORS.NEUTRAL)
    .setTitle('🔍 Monitor Status')
    .setTimestamp();

  if (!monitor) {
    embed.setDescription('No monitor configured. Use `/monitor start` to set one up.');
  } else {
    embed
      .addFields(
        { name: 'Status', value: monitor.active ? '🟢 Active' : '🔴 Stopped', inline: true },
        { name: 'Channel', value: `<#${monitor.channel_id}>`, inline: true },
        { name: 'Interval', value: `${monitor.interval_ms / 60_000} min`, inline: true },
        { name: 'Last Check', value: monitor.last_check ? `<t:${Math.floor(new Date(monitor.last_check).getTime() / 1000)}:R>` : 'Never', inline: true },
        { name: 'Configured By', value: `<@${monitor.user_id}>`, inline: true },
      );
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export default monitor;
