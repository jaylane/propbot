import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
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
    .setDescription('Control live game monitoring via DMs')
    .setDMPermission(true)
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('Start receiving live bet updates via DM')
        .addIntegerOption(opt =>
          opt.setName('interval')
            .setDescription(`Update interval in minutes (default: ${DEFAULT_INTERVAL_MIN})`)
            .setMinValue(1)
            .setMaxValue(60)
            .setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('stop')
        .setDescription('Stop live DM updates')
    )
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Show your current monitor configuration')
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
  const intervalMin = interaction.options.getInteger('interval') ?? DEFAULT_INTERVAL_MIN;
  const intervalMs = intervalMin * 60_000;

  upsertMonitor(interaction.user.id, intervalMs);

  const monitorRow = getMonitor(interaction.user.id)!;
  startMonitor(client, monitorRow);

  await interaction.reply({
    embeds: [buildSuccessEmbed(
      'Monitor Started',
      `You'll receive live bet updates via DM every **${intervalMin} minute${intervalMin !== 1 ? 's' : ''}**.\n\nUpdates fire when tracked games are in progress.`
    )],
    ephemeral: true,
  });

  // Confirm in DM so the user knows DMs are working
  await interaction.user.send('🔔 PropBot monitor is active — I\'ll DM you live updates as your games progress.').catch(() => {
    // User may have DMs disabled; the ephemeral reply above already informed them
  });
}

async function handleStop(interaction: ChatInputCommandInteraction): Promise<void> {
  const existing = getMonitor(interaction.user.id);
  if (!existing || !existing.active) {
    await interaction.reply({ embeds: [buildErrorEmbed('No active monitor found.')], ephemeral: true });
    return;
  }

  stopMonitor(interaction.user.id);
  await interaction.reply({ embeds: [buildSuccessEmbed('Monitor Stopped', 'Live DM updates have been paused.')], ephemeral: true });
}

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const monitorRow = getMonitor(interaction.user.id);

  const embed = new EmbedBuilder()
    .setColor(monitorRow?.active ? COLORS.HIT : COLORS.NEUTRAL)
    .setTitle('🔍 Monitor Status')
    .setTimestamp();

  if (!monitorRow) {
    embed.setDescription('No monitor configured. Use `/monitor start` to enable live DM updates.');
  } else {
    embed.addFields(
      { name: 'Status', value: monitorRow.active ? '🟢 Active' : '🔴 Stopped', inline: true },
      { name: 'Delivery', value: 'Direct Message', inline: true },
      { name: 'Interval', value: `${monitorRow.interval_ms / 60_000} min`, inline: true },
      { name: 'Last Check', value: monitorRow.last_check ? `<t:${Math.floor(new Date(monitorRow.last_check).getTime() / 1000)}:R>` : 'Never', inline: true },
    );
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export default monitor;
