import { SlashCommandBuilder } from 'discord.js';
import { replyError, requirePlayer } from '../util.js';

export const data = new SlashCommandBuilder().setName('resume').setDescription('Resume paused music');

export async function execute(interaction) {
  try {
    const player = requirePlayer(interaction);
    await interaction.reply(player.resume() ? 'Resumed.' : 'The music is not paused.');
  } catch (err) {
    await replyError(interaction, err);
  }
}
