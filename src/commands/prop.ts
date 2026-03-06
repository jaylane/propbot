import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '../index.js';
import {
  insertSlip, insertLeg, getLegs, getAllUserActiveSlips,
  getSlip, updateSlipStatus,
} from '../db/index.js';
import { resolveStatKey } from '../services/prop-tracker.js';
import { findGame } from '../services/espn.js';
import { buildSlipAddedEmbed, buildErrorEmbed, buildPropListEmbed, buildSuccessEmbed } from '../utils/embeds.js';
import { STAT_ALIASES } from '../utils/constants.js';
import type { Sport } from '../models/bet.js';

const prop: Command = {
  data: new SlashCommandBuilder()
    .setName('prop')
    .setDescription('Manage individual prop bets')
    .setDMPermission(true)
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Track a new prop bet')
        .addStringOption(opt =>
          opt.setName('player').setDescription('Player name (e.g. Anthony Edwards)').setRequired(true))
        .addStringOption(opt =>
          opt.setName('stat')
            .setDescription('Stat category (points, rebounds, assists, threePointers, pra, etc.)')
            .setRequired(true))
        .addNumberOption(opt =>
          opt.setName('line').setDescription('The prop line (e.g. 3.5)').setRequired(true))
        .addStringOption(opt =>
          opt.setName('direction')
            .setDescription('Over or under')
            .setRequired(true)
            .addChoices({ name: 'Over', value: 'over' }, { name: 'Under', value: 'under' }))
        .addNumberOption(opt =>
          opt.setName('wager').setDescription('Wager amount in dollars').setRequired(true))
        .addStringOption(opt =>
          opt.setName('game').setDescription('Game (e.g. TOR@MIN or Lakers vs Nuggets)').setRequired(false))
        .addStringOption(opt =>
          opt.setName('sport')
            .setDescription('Sport (default: nba)')
            .setRequired(false)
            .addChoices(
              { name: 'NBA', value: 'nba' },
              { name: 'NCAAB', value: 'ncaab' },
              { name: 'NFL', value: 'nfl' },
              { name: 'MLB', value: 'mlb' },
              { name: 'NHL', value: 'nhl' },
            ))
        .addIntegerOption(opt =>
          opt.setName('odds').setDescription('American odds (e.g. -110, +150)').setRequired(false))
        .addNumberOption(opt =>
          opt.setName('towin').setDescription('To-win amount (overrides odds calculation)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List your active prop bets')
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove/void a slip')
        .addIntegerOption(opt =>
          opt.setName('slip').setDescription('Slip ID to void').setRequired(true))
    ) as any,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      await handleAdd(interaction);
    } else if (sub === 'list') {
      await handleList(interaction);
    } else if (sub === 'remove') {
      await handleRemove(interaction);
    }
  },
};

async function handleAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: false });

  const player = interaction.options.getString('player', true);
  const statInput = interaction.options.getString('stat', true);
  const line = interaction.options.getNumber('line', true);
  const direction = interaction.options.getString('direction', true) as 'over' | 'under';
  const wager = interaction.options.getNumber('wager', true);
  const gameQuery = interaction.options.getString('game');
  const sport = (interaction.options.getString('sport') ?? 'nba') as Sport;
  const odds = interaction.options.getInteger('odds');
  const toWinOpt = interaction.options.getNumber('towin');

  const stat = resolveStatKey(statInput);
  if (!stat) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(`Unknown stat: \`${statInput}\`\nValid options: ${Object.keys(STAT_ALIASES).slice(0, 20).join(', ')}...`)],
    });
    return;
  }

  // Try to resolve game ID
  let gameId: string | undefined;
  if (gameQuery) {
    const game = await findGame(sport, gameQuery);
    if (game) {
      gameId = game.id;
    } else {
      await interaction.editReply({
        embeds: [buildErrorEmbed(`Could not find a game matching \`${gameQuery}\` today.\nCheck ESPN or try a different format like \`LAL@DEN\`.`)],
      });
      return;
    }
  }

  // Calculate payout
  let toWin = toWinOpt;
  if (!toWin && odds) {
    const { calculatePayout } = await import('../services/prop-tracker.js');
    toWin = parseFloat(calculatePayout(wager, odds).toFixed(2));
  }

  const slipId = insertSlip({
    userId: interaction.user.id,
    guildId: interaction.guildId ?? undefined,
    channelId: interaction.channelId,
    type: 'single',
    wager,
    toWin: toWin ?? undefined,
    odds: odds ?? undefined,
    source: 'manual',
  });

  insertLeg({
    slipId,
    type: 'prop',
    player,
    stat,
    line,
    direction,
    gameId,
    sport,
    odds: odds ?? undefined,
  });

  const slip = getSlip(slipId)!;
  const legs = getLegs(slipId);

  await interaction.editReply({ embeds: [buildSlipAddedEmbed(slipId, slip, legs)] });

  if (!gameId) {
    await interaction.followUp({
      content: `⚠️ No game ID linked — run \`/prop add\` with a \`game:\` argument to enable live tracking.`,
      ephemeral: true,
    });
  }
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  const slips = getAllUserActiveSlips(interaction.user.id);
  const legsMap = new Map<number, any[]>();
  for (const slip of slips) {
    legsMap.set(slip.id, getLegs(slip.id));
  }
  await interaction.reply({ embeds: [buildPropListEmbed(slips, legsMap)], ephemeral: true });
}

async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const slipId = interaction.options.getInteger('slip', true);
  const slip = getSlip(slipId);

  if (!slip) {
    await interaction.reply({ embeds: [buildErrorEmbed(`Slip #${slipId} not found.`)], ephemeral: true });
    return;
  }

  if (slip.user_id !== interaction.user.id) {
    await interaction.reply({ embeds: [buildErrorEmbed("You can only remove your own slips.")], ephemeral: true });
    return;
  }

  updateSlipStatus(slipId, 'void');
  await interaction.reply({ embeds: [buildSuccessEmbed('Slip Voided', `Slip #${slipId} has been voided.`)], ephemeral: true });
}

export default prop;
