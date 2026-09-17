import { SlashCommandBuilder } from 'discord.js';
import { replyError, requirePlayer } from '../util.js';

export const data = new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the queue');

export async function execute(interaction) {
  try {
    const player = requirePlayer(interaction);
    const n = player.shuffle();
    await interaction.reply(n > 1 ? `Shuffled ${n} tracks.` : 'Not enough tracks in the queue to shuffle.');
  } catch (err) {
    await replyError(interaction, err);
  }
}
