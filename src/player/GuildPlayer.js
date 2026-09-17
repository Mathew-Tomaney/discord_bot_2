import { EventEmitter } from 'node:events';
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice';
import { config } from '../config.js';
import { Mixer } from './Mixer.js';
import { createTrackStream } from './ytdlp.js';
import { soundboard } from '../soundboard.js';

export const LOOP_MODES = ['off', 'track', 'queue'];

/**
 * One per guild. Owns the voice connection, the always-running mixer,
 * the queue and the idle timer.
 *
 * Events: 'trackStart' (track), 'trackError' (track, err), 'queueEnd', 'destroy'
 */
export class GuildPlayer extends EventEmitter {
  constructor(guild) {
    super();
    this.guild = guild;
    this.textChannel = null;
    this.connection = null;
    this.queue = [];
    this.current = null;
    this.loop = 'off';
    this.destroyed = false;

    this.mixer = new Mixer({ musicVolume: config.defaultMusicVolume });
    this.mixer.on('musicEnd', () => this._onTrackEnd(false));
    this.mixer.on('musicError', (err) => {
      const t = this.current;
      this.emit('trackError', t, err);
      this._onTrackEnd(true);
    });

    this.audioPlayer = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause, maxMissedFrames: 50 },
    });
    this.audioPlayer.on('error', (err) => console.error(`[${guild.name}] audio player error:`, err));
    this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      // The mixer never ends on its own; if the player ever goes idle, re-arm it.
      if (!this.destroyed && !this.mixer.destroyed) this._armPlayer();
    });
    this._armPlayer();

    this.idleTimer = setInterval(() => this._checkIdle(), 15_000);
  }

  _armPlayer() {
    this.audioPlayer.play(createAudioResource(this.mixer, { inputType: StreamType.Raw }));
  }

  get voiceChannelId() {
    return this.connection?.joinConfig.channelId ?? null;
  }

  get connected() {
    const s = this.connection?.state.status;
    return Boolean(s) && s !== VoiceConnectionStatus.Destroyed && s !== VoiceConnectionStatus.Disconnected;
  }

  async connect(voiceChannel) {
    if (this.connected && this.voiceChannelId === voiceChannel.id) return;
    if (this.connection) {
      try {
        this.connection.destroy();
      } catch {}
    }
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });
    this.connection = connection;

    connection.on('error', (err) => console.error(`[${this.guild.name}] voice connection error:`, err));
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Discord may be moving us between channels or reconnecting. Give it a moment.
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        if (this.connection === connection) this.destroy();
      }
    });

    connection.subscribe(this.audioPlayer);
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (err) {
      connection.destroy();
      if (this.connection === connection) this.connection = null;
      throw new Error('Could not connect to the voice channel (timed out).');
    }
  }

  // ---------- queue ----------

  enqueue(tracks, { next = false, requestedBy = null } = {}) {
    for (const t of tracks) t.requestedBy = requestedBy;
    if (next) this.queue.unshift(...tracks);
    else this.queue.push(...tracks);
    if (!this.current) this.playNext();
  }

  playNext() {
    if (this.destroyed) return;
    this._dropCurrent();
    const track = this.queue.shift();
    if (!track) {
      this.emit('queueEnd');
      return;
    }
    this.current = track;
    try {
      const source = createTrackStream(track);
      track.source = source;
      this.mixer.setMusic(source.stream);
      this.mixer.paused = false;
      this.emit('trackStart', track);
    } catch (err) {
      this.current = null;
      this.emit('trackError', track, err);
      this.playNext();
    }
  }

  _dropCurrent() {
    const cur = this.current;
    if (!cur) return null;
    this.current = null;
    this.mixer.clearMusic();
    cur.source?.kill();
    cur.source = null;
    return cur;
  }

  _onTrackEnd(errored) {
    const finished = this._dropCurrent();
    if (finished && !errored) {
      if (this.loop === 'track') this.queue.unshift(finished);
      else if (this.loop === 'queue') this.queue.push(finished);
    }
    this.playNext();
  }

  skip() {
    const skipped = this._dropCurrent();
    if (!skipped) return null;
    if (this.loop === 'queue') this.queue.push(skipped);
    this.playNext();
    return skipped;
  }

  stop() {
    const n = this.queue.length + (this.current ? 1 : 0);
    this.queue = [];
    this._dropCurrent();
    this.mixer.paused = false;
    return n;
  }

  pause() {
    if (!this.current || this.mixer.paused) return false;
    this.mixer.paused = true;
    return true;
  }

  resume() {
    if (!this.current || !this.mixer.paused) return false;
    this.mixer.paused = false;
    return true;
  }

  get paused() {
    return this.mixer.paused;
  }

  shuffle() {
    const q = this.queue;
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [q[i], q[j]] = [q[j], q[i]];
    }
    return q.length;
  }

  remove(index) {
    if (index < 0 || index >= this.queue.length) return null;
    return this.queue.splice(index, 1)[0];
  }

  clearQueue() {
    const n = this.queue.length;
    this.queue = [];
    return n;
  }

  setLoop(mode) {
    if (!LOOP_MODES.includes(mode)) throw new Error(`Loop mode must be one of ${LOOP_MODES.join(', ')}`);
    this.loop = mode;
  }

  get musicVolume() {
    return this.mixer.musicVolume;
  }

  set musicVolume(v) {
    this.mixer.musicVolume = Math.min(2, Math.max(0, v));
  }

  get sfxVolume() {
    return this.mixer.sfxVolume;
  }

  set sfxVolume(v) {
    this.mixer.sfxVolume = Math.min(2, Math.max(0, v));
  }

  get elapsedMs() {
    return this.mixer.musicElapsedMs;
  }

  // ---------- soundboard ----------

  async playSfx(name, { volume = 1 } = {}) {
    const key = soundboard.resolveName(name);
    if (!key) throw new Error(`No sound effect matching "${name}". Try /sfx list.`);
    const buffer = await soundboard.load(key);
    this.mixer.playSfx(buffer, { volume, name: key });
    return { name: key, seconds: buffer.length / (48000 * 4) };
  }

  stopSfx() {
    return this.mixer.stopSfx();
  }

  // ---------- lifecycle ----------

  _checkIdle() {
    if (this.destroyed) return;
    const channel = this.voiceChannelId ? this.guild.channels.cache.get(this.voiceChannelId) : null;
    const listeners = channel ? channel.members.filter((m) => !m.user.bot).size : 0;
    const idleFor = Date.now() - this.mixer.lastActivity;

    if (this.connected && listeners === 0 && idleFor > config.aloneTimeoutMs) {
      this.emit('leaving', 'Everyone left the voice channel.');
      this.destroy();
    } else if (!this.mixer.isActive && idleFor > config.idleTimeoutMs) {
      this.emit('leaving', 'Nothing has played for a while.');
      this.destroy();
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    clearInterval(this.idleTimer);
    this.queue = [];
    this._dropCurrent();
    this.mixer.destroy();
    try {
      this.audioPlayer.stop(true);
    } catch {}
    try {
      this.connection?.destroy();
    } catch {}
    this.connection = null;
    this.emit('destroy');
  }
}
