import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { Command } from '../index.js';
import { getUser } from '../db/index.js';
import { decrypt } from '../utils/crypto.js';
import { getOdds } from '../services/odds-api.js';
import { buildOddsEmbed, buildErrorEmbed } from '../utils/embeds.js';
import { COLORS } from '../utils/constants.js';

const odds: Command = {
  data: new SlashCommandBuilder()
    .setName('odds')
    .setDescription('Compare odds across books (requires your Odds API key via /settings)')
    .addStringOption(opt =>
      opt.setName('game').setDescription('Game (e.g. "Lakers vs Nuggets" or "LAL")').setRequired(true))
    .addStringOption(opt =>
      opt.setName('market')
        .setDescription('Market type (default: moneyline)')
        .setRequired(false)
        .addChoices(
          { name: 'Moneyline', value: 'h2h' },
          { name: 'Spreads', value: 'spreads' },
          { name: 'Totals (O/U)', value: 'totals' },
        ))
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
    await interaction.deferReply({ ephemeral: false });

    const gameQuery = interaction.options.getString('game', true);
    const market = (interaction.options.getString('market') ?? 'h2h') as 'h2h' | 'spreads' | 'totals';
    const sport = interaction.options.getString('sport') ?? 'nba';

    const user = getUser(interaction.user.id);
    if (!user?.odds_api_key_enc) {
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.NEUTRAL)
          .setTitle('🔑 Odds API Key Required')
          .setDescription(
            'This feature uses [The Odds API](https://the-odds-api.com) (free tier: 500 req/month).\n\n' +
            '1. Get a free key at https://the-odds-api.com\n' +
            '2. Run `/settings oddskey:YOUR_KEY` to store it securely\n\n' +
            'Your key is encrypted and only used for your requests.'
          )],
      });
      return;
    }

    let apiKey: string;
    try {
      apiKey = decrypt(user.odds_api_key_enc);
    } catch {
      await interaction.editReply({
        embeds: [buildErrorEmbed('Failed to decrypt your API key. Please re-enter it with `/settings oddskey:`.')],
      });
      return;
    }

    try {
      const result = await getOdds(apiKey, sport, gameQuery, market);

      if (!result) {
        await interaction.editReply({
          embeds: [buildErrorEmbed(
            `No odds found for \`${gameQuery}\` in ${sport.toUpperCase()}.\n` +
            'The game may not be listed yet, or try a different team name.'
          )],
        });
        return;
      }

      const embed = buildOddsEmbed(result.game, result.outcomes);
      embed.setFooter({ text: `${result.remainingRequests} API requests remaining this month · ${sport.toUpperCase()} ${marketLabel(market)}` });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await interaction.editReply({ embeds: [buildErrorEmbed(msg)] });
    }
  },
};

function marketLabel(market: string): string {
  return { h2h: 'Moneyline', spreads: 'Spreads', totals: 'Totals' }[market] ?? market;
}

export default odds;
