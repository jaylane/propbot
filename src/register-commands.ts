/**
 * Run this script once to register slash commands with Discord.
 * Usage: npm run register
 *
 * For guild-specific (instant, for testing):
 *   GUILD_ID=your-guild-id npm run register
 *
 * For global (takes ~1 hour to propagate):
 *   npm run register
 */
import 'dotenv/config';
import { REST, Routes } from 'discord.js';

async function register(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!token) throw new Error('DISCORD_TOKEN not set');
  if (!clientId) throw new Error('DISCORD_CLIENT_ID not set');

  const modules = await Promise.all([
    import('./commands/prop.js'),
    import('./commands/parlay.js'),
    import('./commands/track.js'),
    import('./commands/monitor.js'),
    import('./commands/status.js'),
    import('./commands/odds.js'),
    import('./commands/settings.js'),
  ]);

  const commandData = modules.map(m => m.default.data.toJSON());

  const rest = new REST().setToken(token);
  const guildId = process.env.GUILD_ID;

  if (guildId) {
    console.log(`Registering ${commandData.length} commands to guild ${guildId}...`);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData });
    console.log('Done! Commands available immediately.');
  } else {
    console.log(`Registering ${commandData.length} commands globally...`);
    await rest.put(Routes.applicationCommands(clientId), { body: commandData });
    console.log('Done! Commands will propagate globally within ~1 hour.');
  }

  for (const cmd of commandData) {
    console.log(`  /${cmd.name}`);
  }
}

register().catch((err) => {
  console.error(err);
  process.exit(1);
});
