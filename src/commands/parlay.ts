import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '../index.js';
import { insertSlip, insertLeg, getLegs, getSlip } from '../db/index.js';
import { findGame } from '../services/espn.js';
import { resolveStatKey } from '../services/prop-tracker.js';
import { buildSlipAddedEmbed, buildErrorEmbed } from '../utils/embeds.js';
import type { Sport } from '../models/bet.js';

// Parses free-text leg like: "Edwards O3.5 3PM" or "Randle O6.5 REB" or "Murray O25.5 PTS"
interface ParsedLeg {
  player: string;
  direction: 'over' | 'under';
  line: number;
  stat: string;
}

function parseLeg(text: string): ParsedLeg | null {
  // Pattern: <player> <O|U><line> <stat>  or  <player> Over/Under <line> <stat>
  const normalized = text.trim();

  // Regex: captures player name, direction indicator, line number, stat
  const match = normalized.match(
    /^(.+?)\s+(O|U|over|under)\s*([\d.]+)\s+(.+)$/i
  );

  if (!match) return null;

  const [, playerRaw, dirRaw, lineStr, statRaw] = match;
  const direction = dirRaw.toLowerCase().startsWith('o') ? 'over' : 'under';
  const line = parseFloat(lineStr);
  if (isNaN(line)) return null;

  return {
    player: playerRaw.trim(),
    direction,
    line,
    stat: statRaw.trim(),
  };
}

const parlay: Command = {
  data: new SlashCommandBuilder()
    .setName('parlay')
    .setDescription('Track a parlay bet')
    .addNumberOption(opt =>
      opt.setName('wager').setDescription('Wager amount').setRequired(true))
    .addStringOption(opt =>
      opt.setName('legs')
        .setDescription('Legs separated by commas. E.g: Edwards O3.5 3PM, Randle O6.5 REB')
        .setRequired(true))
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
      opt.setName('odds').setDescription('Parlay odds (American, e.g. +600)').setRequired(false))
    .addNumberOption(opt =>
      opt.setName('towin').setDescription('To-win amount').setRequired(false)) as any,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const wager = interaction.options.getNumber('wager', true);
    const legsInput = interaction.options.getString('legs', true);
    const sport = (interaction.options.getString('sport') ?? 'nba') as Sport;
    const odds = interaction.options.getInteger('odds');
    const toWinOpt = interaction.options.getNumber('towin');

    const rawLegs = legsInput.split(',').map(s => s.trim()).filter(Boolean);
    if (rawLegs.length < 2) {
      await interaction.editReply({ embeds: [buildErrorEmbed('A parlay requires at least 2 legs. Separate them with commas.')] });
      return;
    }

    const parsedLegs: ParsedLeg[] = [];
    const failedLegs: string[] = [];

    for (const raw of rawLegs) {
      const parsed = parseLeg(raw);
      if (!parsed) {
        failedLegs.push(raw);
        continue;
      }
      const stat = resolveStatKey(parsed.stat);
      if (!stat) {
        failedLegs.push(`${raw} (unknown stat: ${parsed.stat})`);
        continue;
      }
      parsedLegs.push({ ...parsed, stat });
    }

    if (failedLegs.length > 0) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(
          `Could not parse ${failedLegs.length} leg(s):\n${failedLegs.map(f => `• ${f}`).join('\n')}\n\n` +
          `Format: \`PlayerName O/U Line Stat\` (e.g. \`Edwards O3.5 3PM\`)`
        )],
      });
      return;
    }

    let toWin = toWinOpt;
    if (!toWin && odds) {
      const { calculatePayout } = await import('../services/prop-tracker.js');
      toWin = parseFloat(calculatePayout(wager, odds).toFixed(2));
    }

    const slipId = insertSlip({
      userId: interaction.user.id,
      guildId: interaction.guildId!,
      channelId: interaction.channelId,
      type: 'parlay',
      wager,
      toWin: toWin ?? undefined,
      odds: odds ?? undefined,
      source: 'manual',
    });

    // Try to find game IDs for each leg
    for (const leg of parsedLegs) {
      let gameId: string | undefined;
      // Try a general scoreboard search by player's team — we just try to find any active game
      // Without a game hint, we search across today's scoreboard
      try {
        const games = await (await import('../services/espn.js')).getScoreboard(sport);
        // For now, we can't reliably match player → team without a roster lookup
        // Store without gameId; user should specify game via /prop add for precise tracking
        void games;
      } catch { /* non-critical */ }

      insertLeg({
        slipId,
        type: 'prop',
        player: leg.player,
        stat: leg.stat as any,
        line: leg.line,
        direction: leg.direction,
        gameId,
        sport,
      });
    }

    const slip = getSlip(slipId)!;
    const legs = getLegs(slipId);

    await interaction.editReply({ embeds: [buildSlipAddedEmbed(slipId, slip, legs)] });

    if (parsedLegs.some(() => true)) {
      await interaction.followUp({
        content: `💡 Tip: For live stat tracking, use \`/prop add\` with a \`game:\` argument per leg to link each player to their ESPN game.`,
        ephemeral: true,
      });
    }
  },
};

export default parlay;
