import { REST, Routes } from 'discord.js';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { loadCommands } from './commands/index.js';

/** Register slash commands. Guild-scoped if GUILD_ID is set (instant), otherwise global. */
export async function deployCommands(commands) {
  if (!config.clientId) throw new Error('Could not determine the application id. Set DISCORD_CLIENT_ID.');
  const body = [...commands.values()].map((c) => c.data.toJSON());
  const rest = new REST().setToken(config.token);
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);
  const result = await rest.put(route, { body });
  console.log(
    `Registered ${result.length} slash commands ${config.guildId ? `in guild ${config.guildId}` : 'globally (may take up to an hour to show up)'}.`,
  );
  return result;
}

// Run directly: `npm run deploy`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const commands = await loadCommands();
  await deployCommands(commands);
}
