import { MessageFlags } from 'discord.js';
import { getOrCreatePlayer, getPlayer } from './player/manager.js';

export class UserError extends Error {}

export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '?:??';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

export function trackLink(track) {
  const title = track.title.length > 80 ? track.title.slice(0, 77) + '...' : track.title;
  return `[${title.replace(/[[\]]/g, '')}](${track.url})`;
}

export function progressBar(elapsedSec, totalSec, width = 18) {
  if (!totalSec) return '';
  const ratio = Math.min(1, elapsedSec / totalSec);
  const pos = Math.round(ratio * (width - 1));
  return '▬'.repeat(pos) + '🔘' + '▬'.repeat(width - 1 - pos);
}

/** The voice channel the invoking user is currently in, or throw. */
export function requireUserVoiceChannel(interaction) {
  const channel = interaction.member?.voice?.channel;
  if (!channel) throw new UserError('Join a voice channel first.');
  const me = interaction.guild.members.me;
  const perms = channel.permissionsFor(me);
  if (!perms?.has('Connect') || !perms?.has('Speak')) {
    throw new UserError(`I don't have permission to connect and speak in **${channel.name}**.`);
  }
  return channel;
}

/** Get the existing player for this guild, or throw if there is none. */
export function requirePlayer(interaction) {
  const player = getPlayer(interaction.guildId);
  if (!player || player.destroyed) throw new UserError("I'm not playing anything right now.");
  return player;
}

/**
 * Get (or create) the guild player and make sure it is connected to the
 * caller's voice channel. Refuses to be yanked away while others are listening.
 */
export async function ensurePlayer(interaction) {
  const channel = requireUserVoiceChannel(interaction);
  const player = getOrCreatePlayer(interaction.guild);
  player.textChannel = interaction.channel;

  if (player.connected && player.voiceChannelId !== channel.id) {
    const current = interaction.guild.channels.cache.get(player.voiceChannelId);
    const listeners = current ? current.members.filter((m) => !m.user.bot).size : 0;
    if (listeners > 0) {
      throw new UserError(`I'm already playing in **${current.name}**. Join that channel, or wait until it's empty.`);
    }
  }
  await player.connect(channel);
  return player;
}

export async function replyError(interaction, err) {
  const content = err instanceof UserError ? err.message : `Something went wrong: ${err.message ?? err}`;
  if (!(err instanceof UserError)) console.error(err);
  const payload = { content, flags: MessageFlags.Ephemeral };
  try {
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content });
    else await interaction.reply(payload);
  } catch {}
}
