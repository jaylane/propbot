import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { Command } from '../index.js';
import { getUser, updateUserOddsKey, updateUserTimezone } from '../db/index.js';
import { encrypt, maskKey } from '../utils/crypto.js';
import { buildErrorEmbed } from '../utils/embeds.js';
import { COLORS, VALID_TIMEZONES } from '../utils/constants.js';

const settings: Command = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Configure your PropBot preferences')
    .addStringOption(opt =>
      opt.setName('oddskey')
        .setDescription('Your Odds API key (get one free at the-odds-api.com)')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('timezone')
        .setDescription('Your timezone for game times (e.g. America/New_York)')
        .setRequired(false)) as any,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const oddsKey = interaction.options.getString('oddskey');
    const timezone = interaction.options.getString('timezone');

    if (!oddsKey && !timezone) {
      // Show current settings
      await showSettings(interaction);
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    if (oddsKey) {
      if (oddsKey.length < 10) {
        await interaction.editReply({ embeds: [buildErrorEmbed('That doesn\'t look like a valid API key.')] });
        return;
      }
      try {
        const encrypted = encrypt(oddsKey);
        updateUserOddsKey(interaction.user.id, encrypted);
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.HIT)
            .setTitle('✅ Odds API Key Saved')
            .setDescription(`Key \`${maskKey(oddsKey)}\` stored securely.\nUse \`/odds\` to compare lines.`)],
        });
      } catch (err) {
        await interaction.editReply({
          embeds: [buildErrorEmbed('Failed to encrypt key. Is ENCRYPTION_KEY set correctly in the bot environment?')],
        });
      }
      return;
    }

    if (timezone) {
      // Validate timezone
      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone });
      } catch {
        await interaction.editReply({
          embeds: [buildErrorEmbed(
            `Invalid timezone: \`${timezone}\`\n\nCommon options:\n${VALID_TIMEZONES.map(t => `• \`${t}\``).join('\n')}`
          )],
        });
        return;
      }

      updateUserTimezone(interaction.user.id, timezone);
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.HIT)
          .setTitle('✅ Timezone Updated')
          .setDescription(`Timezone set to \`${timezone}\`.`)],
      });
    }
  },
};

async function showSettings(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const user = getUser(interaction.user.id);

  const embed = new EmbedBuilder()
    .setColor(COLORS.ACTIVE)
    .setTitle('⚙️ Your Settings')
    .setTimestamp();

  if (!user) {
    embed.setDescription('No settings saved yet. Use `/settings oddskey:` to get started.');
  } else {
    embed.addFields(
      {
        name: 'Odds API Key',
        value: user.odds_api_key_enc ? '🔐 Saved (encrypted)' : '❌ Not set — add one with `/settings oddskey:`',
        inline: false,
      },
      {
        name: 'Timezone',
        value: user.timezone ?? 'America/New_York',
        inline: true,
      },
    );
  }

  await interaction.editReply({ embeds: [embed] });
}

export default settings;
