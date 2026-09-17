import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { formatDuration, replyError, requirePlayer, trackLink } from '../util.js';

const PAGE_SIZE = 10;

export const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('Show what is playing and what is coming up')
  .addIntegerOption((o) => o.setName('page').setDescription('Page number').setMinValue(1));

export async function execute(interaction) {
  try {
    const player = requirePlayer(interaction);
    const page = interaction.options.getInteger('page') ?? 1;
    const pages = Math.max(1, Math.ceil(player.queue.length / PAGE_SIZE));
    const p = Math.min(page, pages);
    const start = (p - 1) * PAGE_SIZE;
    const slice = player.queue.slice(start, start + PAGE_SIZE);

    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('Queue');
    if (player.current) {
      const t = player.current;
      const elapsed = formatDuration(player.elapsedMs / 1000);
      const len = t.isLive ? 'LIVE' : formatDuration(t.duration);
      embed.addFields({
        name: player.paused ? 'Paused' : 'Now playing',
        value: `${trackLink(t)}\n\`${elapsed} / ${len}\``,
      });
    } else {
      embed.setDescription('Nothing is playing.');
    }

    if (slice.length) {
      const lines = slice.map((t, i) => `\`${start + i + 1}.\` ${trackLink(t)} \`${t.isLive ? 'LIVE' : formatDuration(t.duration)}\``);
      embed.addFields({ name: 'Up next', value: lines.join('\n') });
    } else if (player.current) {
      embed.addFields({ name: 'Up next', value: 'Nothing queued. Use /play to add more.' });
    }

    const total = player.queue.reduce((s, t) => s + (t.duration || 0), 0);
    embed.setFooter({
      text: `${player.queue.length} queued • ${formatDuration(total)} total • loop: ${player.loop} • volume: ${Math.round(player.musicVolume * 100)}%` +
        (pages > 1 ? ` • page ${p}/${pages}` : ''),
    });
    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    await replyError(interaction, err);
  }
}
