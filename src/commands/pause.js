import { SlashCommandBuilder } from 'discord.js';
import { replyError, requirePlayer } from '../util.js';

export const data = new SlashCommandBuilder().setName('pause').setDescription('Pause the music');

export async function execute(interaction) {
  try {
    const player = requirePlayer(interaction);
    await interaction.reply(player.pause() ? 'Paused. Use /resume to continue.' : 'Nothing to pause.');
  } catch (err) {
    await replyError(interaction, err);
  }
}
