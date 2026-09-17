import { SlashCommandBuilder } from 'discord.js';
import { UserError, replyError, requirePlayer } from '../util.js';

export const data = new SlashCommandBuilder()
  .setName('remove')
  .setDescription('Remove a track from the queue by its position')
  .addIntegerOption((o) => o.setName('position').setDescription('Position shown in /queue').setRequired(true).setMinValue(1));

export async function execute(interaction) {
  try {
    const player = requirePlayer(interaction);
    const pos = interaction.options.getInteger('position', true);
    const removed = player.remove(pos - 1);
    if (!removed) throw new UserError(`There is no track at position ${pos}.`);
    await interaction.reply(`Removed **${removed.title}** from the queue.`);
  } catch (err) {
    await replyError(interaction, err);
  }
}
