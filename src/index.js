import { ActivityType, Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { generateDependencyReport } from '@discordjs/voice';
import { config } from './config.js';
import { loadCommands } from './commands/index.js';
import { deployCommands } from './deploy-commands.js';
import { destroyAll, getPlayer } from './player/manager.js';
import { soundboard } from './soundboard.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const commands = await loadCommands();

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}. ${soundboard.list().length} soundboard clips loaded.`);
  console.log(generateDependencyReport());
  c.user.setActivity({ name: '/play • /sfx', type: ActivityType.Listening });
  if (config.autoDeploy) {
    try {
      await deployCommands(commands);
    } catch (err) {
      console.error('Failed to register slash commands:', err);
    }
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.inGuild()) {
    if (interaction.isRepliable()) await interaction.reply({ content: 'This bot only works inside a server.', flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }
  const command = commands.get(interaction.commandName);
  if (!command) return;

  if (interaction.isAutocomplete()) {
    if (command.autocomplete) await command.autocomplete(interaction).catch(() => {});
    return;
  }
  if (!interaction.isChatInputCommand()) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const payload = { content: 'Something went wrong running that command.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
});

// If someone drags the bot out of the channel or kicks it, clean up.
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  if (oldState.member?.id !== client.user?.id) return;
  if (oldState.channelId && !newState.channelId) getPlayer(oldState.guild.id)?.destroy();
});

client.on(Events.Error, (err) => console.error('Client error:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n${sig} received, shutting down...`);
    destroyAll();
    client.destroy();
    process.exit(0);
  });
}

await client.login(config.token);
