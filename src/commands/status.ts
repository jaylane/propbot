import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { Command } from '../index.js';
import { getAllUserActiveSlips, getLegs, getSlip } from '../db/index.js';
import { evaluateSlip } from '../services/prop-tracker.js';
import { buildPropListEmbed, buildErrorEmbed, buildSettledEmbed } from '../utils/embeds.js';
import { COLORS, STAT_DISPLAY } from '../utils/constants.js';
import type { StatKey } from '../models/bet.js';

const status: Command = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check status of active bets')
    .setDMPermission(true)
    .addIntegerOption(opt =>
      opt.setName('slip').setDescription('Specific slip ID to check').setRequired(false)
    ) as any,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: false });

    const slipId = interaction.options.getInteger('slip');

    if (slipId !== null) {
      await showSlipStatus(interaction, slipId);
    } else {
      await showAllStatus(interaction);
    }
  },
};

async function showSlipStatus(interaction: ChatInputCommandInteraction, slipId: number): Promise<void> {
  const slip = getSlip(slipId);
  if (!slip || slip.user_id !== interaction.user.id) {
    await interaction.editReply({ embeds: [buildErrorEmbed(`Slip #${slipId} not found.`)] });
    return;
  }

  if (slip.status !== 'active') {
    const legs = getLegs(slipId);
    await interaction.editReply({ embeds: [buildSettledEmbed(slip, legs)] });
    return;
  }

  // Evaluate live
  const evals = await evaluateSlip(slipId);
  const legs = getLegs(slipId);

  const embed = new EmbedBuilder()
    .setColor(COLORS.ACTIVE)
    .setTitle(`📊 Slip #${slipId} — ${slip.type.toUpperCase()}`)
    .setDescription(`**$${slip.wager}** wager${slip.to_win ? ` · to win **$${slip.to_win.toFixed(2)}**` : ''}`)
    .setTimestamp();

  for (const leg of legs) {
    if (leg.type !== 'prop') continue;
    const ev = evals.find(e => e.legId === leg.id);
    const icon = !ev ? '⏳' : ev.status === 'hit' ? '✅' : ev.status === 'miss' ? '❌' : ev.status === 'push' ? '🔄' : '⏳';
    const statName = STAT_DISPLAY[leg.stat as StatKey] ?? leg.stat ?? '?';
    const dir = leg.direction === 'over' ? 'O' : 'U';
    const cur = ev ? `**${ev.currentValue}**` : (leg.current_value !== null ? `${leg.current_value}` : '—');
    const gameStr = ev ? ` · ${ev.gameStatus}` : '';

    embed.addFields({
      name: `${icon} ${leg.player ?? '?'}`,
      value: `${statName} ${dir}${leg.line} · ${cur}${gameStr}`,
      inline: true,
    });
  }

  if (!evals.length) {
    embed.setFooter({ text: 'No live game data yet. Games may not have started.' });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function showAllStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const slips = getAllUserActiveSlips(interaction.user.id);

  if (!slips.length) {
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(COLORS.NEUTRAL)
        .setTitle('📋 No Active Bets')
        .setDescription('No active bets found. Use `/prop add` or `/parlay` to start tracking!')],
    });
    return;
  }

  const legsMap = new Map<number, any[]>();
  for (const slip of slips) {
    legsMap.set(slip.id, getLegs(slip.id));
  }

  await interaction.editReply({ embeds: [buildPropListEmbed(slips, legsMap)] });
}

export default status;
