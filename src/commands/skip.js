import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { replyError, requirePlayer } from '../util.js';

export const data = new SlashCommandBuilder().setName('skip').setDescription('Skip the current track');

export async function execute(interaction) {
  try {
    const player = requirePlayer(interaction);
    const skipped = player.skip();
    if (!skipped) return interaction.reply({ content: 'Nothing is playing.', flags: MessageFlags.Ephemeral });
    const nextUp = player.current ? ` Now playing **${player.current.title}**.` : ' The queue is empty.';
    await interaction.reply(`Skipped **${skipped.title}**.${nextUp}`);
  } catch (err) {
    await replyError(interaction, err);
  }
}
