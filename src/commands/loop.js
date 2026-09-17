import { SlashCommandBuilder } from 'discord.js';
import { replyError, requirePlayer } from '../util.js';

export const data = new SlashCommandBuilder()
  .setName('loop')
  .setDescription('Repeat the current track or the whole queue (great for ambience)')
  .addStringOption((o) =>
    o
      .setName('mode')
      .setDescription('What to repeat')
      .setRequired(true)
      .addChoices(
        { name: 'off', value: 'off' },
        { name: 'track — repeat the current track forever', value: 'track' },
        { name: 'queue — cycle through the whole queue', value: 'queue' },
      ),
  );

export async function execute(interaction) {
  try {
    const player = requirePlayer(interaction);
    const mode = interaction.options.getString('mode', true);
    player.setLoop(mode);
    const msg = { off: 'Looping is off.', track: 'Looping the current track.', queue: 'Looping the whole queue.' }[mode];
    await interaction.reply(msg);
  } catch (err) {
    await replyError(interaction, err);
  }
}
