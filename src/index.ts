import 'dotenv/config';
import { Collection, Interaction, Events } from 'discord.js';
import type { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { client } from './client.js';
import { getDb } from './db/index.js';
import { startAllMonitors } from './services/monitor.js';

// ── Command registry ───────────────────────────────────────────────────────────

export interface Command {
  data: SlashCommandBuilder | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const commands = new Collection<string, Command>();

async function loadCommands(): Promise<void> {
  const modules = [
    import('./commands/prop.js'),
    import('./commands/parlay.js'),
    import('./commands/track.js'),
    import('./commands/monitor.js'),
    import('./commands/status.js'),
    import('./commands/odds.js'),
    import('./commands/settings.js'),
  ];

  const loaded = await Promise.all(modules);
  for (const mod of loaded) {
    const cmd = mod.default as Command;
    commands.set(cmd.data.name, cmd);
    console.log(`[Commands] Loaded: /${cmd.data.name}`);
  }
}

// ── Client setup ───────────────────────────────────────────────────────────────

client.once(Events.ClientReady, async (c) => {
  console.log(`[PropBot] Logged in as ${c.user.tag}`);
  getDb();
  startAllMonitors(client);
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    await interaction.reply({ content: 'Unknown command.', ephemeral: true });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[Error] /${interaction.commandName}:`, err);
    const msg = { content: '❌ Something went wrong. Please try again.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg).catch(() => null);
    } else {
      await interaction.reply(msg).catch(() => null);
    }
  }
});

// ── Boot ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN is not set');

  await loadCommands();
  await client.login(token);
}

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
