import { SlashCommandBuilder } from 'discord.js';
import { replyError, requirePlayer } from '../util.js';

export const data = new SlashCommandBuilder()
  .setName('volume')
  .setDescription('Set the music volume (0-200%)')
  .addIntegerOption((o) => o.setName('percent').setDescription('Volume percentage').setMinValue(0).setMaxValue(200));

export async function execute(interaction) {
  try {
    const player = requirePlayer(interaction);
    const pct = interaction.options.getInteger('percent');
    if (pct == null) return interaction.reply(`Music volume is **${Math.round(player.musicVolume * 100)}%**.`);
    player.musicVolume = pct / 100;
    await interaction.reply(`Music volume set to **${pct}%**.`);
  } catch (err) {
    await replyError(interaction, err);
  }
}
