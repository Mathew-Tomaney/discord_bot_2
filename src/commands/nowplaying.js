import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { formatDuration, progressBar, replyError, requirePlayer, trackLink } from '../util.js';

export const data = new SlashCommandBuilder().setName('nowplaying').setDescription('Show the current track');

export async function execute(interaction) {
  try {
    const player = requirePlayer(interaction);
    const t = player.current;
    if (!t) return interaction.reply({ content: 'Nothing is playing.', flags: MessageFlags.Ephemeral });

    const elapsedSec = player.elapsedMs / 1000;
    const bar = t.isLive ? 'LIVE' : `${progressBar(elapsedSec, t.duration)}\n\`${formatDuration(elapsedSec)} / ${formatDuration(t.duration)}\``;
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: player.paused ? 'Paused' : 'Now playing' })
      .setDescription(`${trackLink(t)}\n${t.uploader ? `by ${t.uploader}\n` : ''}\n${bar}`)
      .setFooter({ text: `loop: ${player.loop} • volume: ${Math.round(player.musicVolume * 100)}%` });
    if (t.thumbnail) embed.setThumbnail(t.thumbnail);
    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    await replyError(interaction, err);
  }
}
