import { SlashCommandBuilder } from 'discord.js';
import { replyError, requirePlayer } from '../util.js';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Stop the music and clear the queue (stays in the channel for the soundboard)');

export async function execute(interaction) {
  try {
    const player = requirePlayer(interaction);
    const n = player.stop();
    await interaction.reply(n ? `Stopped and cleared ${n} track${n === 1 ? '' : 's'}.` : 'Nothing was playing.');
  } catch (err) {
    await replyError(interaction, err);
  }
}
