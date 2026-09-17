import { SlashCommandBuilder } from 'discord.js';
import { replyError, requirePlayer } from '../util.js';

export const data = new SlashCommandBuilder().setName('leave').setDescription('Stop everything and leave the voice channel');

export async function execute(interaction) {
  try {
    const player = requirePlayer(interaction);
    player.destroy();
    await interaction.reply('Bye! 👋');
  } catch (err) {
    await replyError(interaction, err);
  }
}
