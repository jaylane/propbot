import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { Command } from '../index.js';
import { insertSlip, insertLeg, getLegs, getSlip } from '../db/index.js';
import { parseSlipImage, parseSlipText } from '../services/slip-parser.js';
import { findGame, getScoreboard } from '../services/espn.js';
import { resolveStatKey } from '../services/prop-tracker.js';
import { buildSlipAddedEmbed, buildErrorEmbed } from '../utils/embeds.js';
import { COLORS } from '../utils/constants.js';
import type { Sport, ParsedLeg } from '../models/bet.js';

const track: Command = {
  data: new SlashCommandBuilder()
    .setName('track')
    .setDescription('Parse a bet slip image or text and start tracking it')
    .addAttachmentOption(opt =>
      opt.setName('slip').setDescription('Bet slip image (PNG, JPG, PDF screenshot)').setRequired(false))
    .addStringOption(opt =>
      opt.setName('text').setDescription('Paste bet slip text if no image available').setRequired(false))
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
        )) as any,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const attachment = interaction.options.getAttachment('slip');
    const text = interaction.options.getString('text');
    const sport = (interaction.options.getString('sport') ?? 'nba') as Sport;

    if (!attachment && !text) {
      await interaction.reply({
        embeds: [buildErrorEmbed('Please attach a bet slip image or paste the text.')],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    const processingEmbed = new EmbedBuilder()
      .setColor(COLORS.PENDING)
      .setTitle('🔍 Parsing Bet Slip...')
      .setDescription('Using AI vision to extract your bets. This takes a few seconds.');

    await interaction.editReply({ embeds: [processingEmbed] });

    let parsedSlip;
    try {
      if (attachment) {
        // Validate file type
        const url = attachment.url;
        const name = attachment.name.toLowerCase();
        if (!name.match(/\.(png|jpg|jpeg|webp|gif)$/) && !attachment.contentType?.startsWith('image/')) {
          await interaction.editReply({
            embeds: [buildErrorEmbed('Please attach an image file (PNG, JPG, WEBP). PDFs are not directly supported — take a screenshot instead.')],
          });
          return;
        }
        parsedSlip = await parseSlipImage(url);
      } else {
        parsedSlip = await parseSlipText(text!);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await interaction.editReply({
        embeds: [buildErrorEmbed(`Failed to parse slip: ${msg}`)],
      });
      return;
    }

    if (!parsedSlip.legs.length) {
      await interaction.editReply({
        embeds: [buildErrorEmbed("Couldn't find any bets in that slip. Try pasting the text with `/track text:`.")],
      });
      return;
    }

    // Wager fallback
    if (!parsedSlip.wager) {
      await interaction.editReply({
        embeds: [buildErrorEmbed("Couldn't detect wager amount. Please use `/prop add` to enter manually.")],
      });
      return;
    }

    // Pre-fetch today's scoreboard to attempt game matching
    let todaysGames: any[] = [];
    try {
      todaysGames = await getScoreboard(sport);
    } catch { /* not critical */ }

    const slipId = insertSlip({
      userId: interaction.user.id,
      guildId: interaction.guildId!,
      channelId: interaction.channelId,
      type: parsedSlip.type,
      wager: parsedSlip.wager,
      toWin: parsedSlip.toWin,
      odds: parsedSlip.odds,
      source: 'image',
    });

    const unmatchedLegs: ParsedLeg[] = [];

    for (const leg of parsedSlip.legs) {
      const stat = leg.stat ? resolveStatKey(leg.stat) : null;

      // Try to match game
      let gameId: string | undefined;
      if (leg.gameDescription && todaysGames.length) {
        try {
          const game = await findGame(sport, leg.gameDescription);
          if (game) gameId = game.id;
        } catch { /* skip */ }
      }

      if (leg.type === 'prop' && (!stat || !gameId)) {
        unmatchedLegs.push(leg);
      }

      insertLeg({
        slipId,
        type: leg.type as any,
        player: leg.player,
        team: leg.team,
        stat: (stat ?? leg.stat) as any,
        line: leg.line,
        direction: leg.direction,
        gameId,
        sport,
        odds: leg.odds,
      });
    }

    const slip = getSlip(slipId)!;
    const legs = getLegs(slipId);

    await interaction.editReply({ embeds: [buildSlipAddedEmbed(slipId, slip, legs)] });

    if (unmatchedLegs.length > 0) {
      const warnings = unmatchedLegs.map(l =>
        `• ${l.player ?? '?'} — ${l.rawText || 'unknown'}`
      ).join('\n');

      await interaction.followUp({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.PENDING)
          .setTitle('⚠️ Some Legs Need Game Linking')
          .setDescription(
            `${unmatchedLegs.length} leg(s) couldn't be auto-linked to a game. Use \`/prop add\` with a \`game:\` arg to link them for live tracking:\n\n${warnings}`
          )],
        ephemeral: true,
      });
    }
  },
};

export default track;
