import { EmbedBuilder } from 'discord.js';
import { GuildPlayer } from './GuildPlayer.js';
import { formatDuration, trackLink } from '../util.js';

const players = new Map();

export function getPlayer(guildId) {
  return players.get(guildId) ?? null;
}

export function getOrCreatePlayer(guild) {
  let player = players.get(guild.id);
  if (player && !player.destroyed) return player;

  player = new GuildPlayer(guild);
  players.set(guild.id, player);

  const announce = (payload) => {
    player.textChannel?.send(payload).catch(() => {});
  };

  player.on('trackStart', (track) => {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: 'Now playing' })
      .setDescription(trackLink(track))
      .addFields(
        { name: 'Length', value: track.isLive ? 'LIVE' : formatDuration(track.duration), inline: true },
        { name: 'Requested by', value: track.requestedBy ? `<@${track.requestedBy}>` : 'unknown', inline: true },
      );
    if (track.thumbnail) embed.setThumbnail(track.thumbnail);
    announce({ embeds: [embed] });
  });

  player.on('trackError', (track, err) => {
    announce(`Couldn't play **${track?.title ?? 'that track'}**: ${err.message}`);
  });

  player.on('leaving', (reason) => announce(`${reason} Leaving the voice channel.`));

  player.on('destroy', () => {
    if (players.get(guild.id) === player) players.delete(guild.id);
  });

  return player;
}

export function destroyAll() {
  for (const p of players.values()) p.destroy();
  players.clear();
}
