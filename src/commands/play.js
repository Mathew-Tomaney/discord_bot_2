import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { resolve } from '../player/ytdlp.js';
import { ensurePlayer, formatDuration, replyError, trackLink } from '../util.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Queue a YouTube video, playlist, or search term')
  .addStringOption((o) =>
    o.setName('query').setDescription('YouTube link, playlist link, or words to search for').setRequired(true),
  )
  .addBooleanOption((o) => o.setName('next').setDescription('Put it at the front of the queue'));

export async function execute(interaction) {
  const query = interaction.options.getString('query', true).trim();
  const next = interaction.options.getBoolean('next') ?? false;

  await interaction.deferReply();
  try {
    const player = await ensurePlayer(interaction);
    const { tracks, playlistTitle } = await resolve(query);
    const wasIdle = !player.current;
    player.enqueue(tracks, { next, requestedBy: interaction.user.id });

    const embed = new EmbedBuilder().setColor(0x57f287);
    if (tracks.length === 1) {
      const t = tracks[0];
      embed
        .setAuthor({ name: wasIdle ? 'Playing now' : next ? 'Playing next' : 'Added to queue' })
        .setDescription(trackLink(t))
        .addFields({ name: 'Length', value: t.isLive ? 'LIVE' : formatDuration(t.duration), inline: true });
      if (!wasIdle) {
        const pos = next ? 1 : player.queue.length;
        embed.addFields({ name: 'Position', value: `#${pos}`, inline: true });
      }
      if (t.thumbnail) embed.setThumbnail(t.thumbnail);
    } else {
      const total = tracks.reduce((s, t) => s + (t.duration || 0), 0);
      embed
        .setAuthor({ name: 'Added playlist to queue' })
        .setDescription(`**${playlistTitle ?? 'Playlist'}** — ${tracks.length} tracks (${formatDuration(total)})`)
        .addFields({ name: 'First up', value: trackLink(tracks[0]) });
      if (tracks[0].thumbnail) embed.setThumbnail(tracks[0].thumbnail);
    }
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await replyError(interaction, err);
  }
}
