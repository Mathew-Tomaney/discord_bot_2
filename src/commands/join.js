import { SlashCommandBuilder } from 'discord.js';
import { ensurePlayer, replyError } from '../util.js';

export const data = new SlashCommandBuilder()
  .setName('join')
  .setDescription('Join your voice channel without playing anything (soundboard-only sessions)');

export async function execute(interaction) {
  await interaction.deferReply();
  try {
    const player = await ensurePlayer(interaction);
    await interaction.editReply(`Joined <#${player.voiceChannelId}>. Use /play or /sfx.`);
  } catch (err) {
    await replyError(interaction, err);
  }
}
