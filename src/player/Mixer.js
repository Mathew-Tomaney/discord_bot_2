import { Readable } from 'node:stream';

// Discord voice wants 48kHz, 2-channel, 16-bit PCM, in 20ms frames.
export const SAMPLE_RATE = 48000;
export const CHANNELS = 2;
export const FRAME_SAMPLES = 960; // 20ms
export const FRAME_BYTES = FRAME_SAMPLES * CHANNELS * 2; // 3840
export const BYTES_PER_SECOND = SAMPLE_RATE * CHANNELS * 2;

const PREBUFFER_BYTES = BYTES_PER_SECOND * 0.75; // wait for 750ms of music before starting it
const DUCK_LEVEL = 0.35; // music gain multiplier while a sound effect plays
const DUCK_STEP = 0.06; // per frame -> ~330ms ramp

/**
 * A never-ending PCM stream. One "music" source (pulled lazily, so a long
 * track never gets decoded ahead of time into RAM) plus any number of one-shot
 * sound effect buffers, summed together with per-channel gain and auto-ducking.
 *
 * Events: 'musicEnd' (track fully played), 'musicError' (err), 'sfxEnd' (id)
 */
export class Mixer extends Readable {
  constructor({ musicVolume = 0.5, sfxVolume = 1 } = {}) {
    super({ highWaterMark: FRAME_BYTES * 4 });
    this.musicVolume = musicVolume;
    this.sfxVolume = sfxVolume;
    this.paused = false;
    this.music = null;
    this.sfx = [];
    this.nextSfxId = 1;
    this.duck = 1;
    this.lastActivity = Date.now();
    this._acc = new Int32Array(FRAME_SAMPLES * CHANNELS);
  }

  /** Attach a PCM (s16le 48k stereo) Readable as the music source. */
  setMusic(stream) {
    this.clearMusic();
    // If the decoder already finished before we got here, don't wait for a 'finish' that won't come.
    const alreadyDone = stream.writableFinished === true || stream.readableEnded === true;
    const source = { stream, started: false, ended: alreadyDone, framesPlayed: 0 };
    source.onFinish = () => {
      source.ended = true;
    };
    source.onError = (err) => {
      if (this.music !== source) return;
      this.clearMusic();
      this.emit('musicError', err);
    };
    stream.on('finish', source.onFinish);
    stream.on('error', source.onError);
    this.music = source;
    this.lastActivity = Date.now();
  }

  clearMusic() {
    const m = this.music;
    if (!m) return;
    m.stream.off('finish', m.onFinish);
    m.stream.off('error', m.onError);
    this.music = null;
  }

  get hasMusic() {
    return this.music !== null;
  }

  get musicElapsedMs() {
    return this.music ? this.music.framesPlayed * 20 : 0;
  }

  /** Play a fully-decoded PCM buffer once, on top of the music. Returns an id. */
  playSfx(buffer, { volume = 1, name = null } = {}) {
    const id = this.nextSfxId++;
    this.sfx.push({ id, buffer, offset: 0, volume, name });
    this.lastActivity = Date.now();
    return id;
  }

  stopSfx() {
    const n = this.sfx.length;
    this.sfx = [];
    return n;
  }

  get activeSfx() {
    return this.sfx.map((s) => s.name).filter(Boolean);
  }

  get isActive() {
    return (this.music !== null && !this.paused) || this.sfx.length > 0;
  }

  _read() {
    const acc = this._acc;
    acc.fill(0);
    let any = false;

    // --- ducking: ease the music down while any effect is playing, back up afterwards ---
    const targetDuck = this.sfx.length > 0 ? DUCK_LEVEL : 1;
    if (this.duck > targetDuck) this.duck = Math.max(targetDuck, this.duck - DUCK_STEP);
    else if (this.duck < targetDuck) this.duck = Math.min(targetDuck, this.duck + DUCK_STEP);

    // --- music ---
    const m = this.music;
    if (m && !this.paused) {
      if (!m.started && (m.ended || m.stream.readableLength >= PREBUFFER_BYTES)) m.started = true;
      if (m.started) {
        const chunk = m.stream.read(FRAME_BYTES);
        if (chunk && chunk.length > 0) {
          mixInto(acc, chunk, this.musicVolume * this.duck);
          m.framesPlayed++;
          any = true;
        } else if (m.ended && m.stream.readableLength === 0) {
          this.clearMusic();
          // Emit outside of the read path so listeners can safely swap sources.
          setImmediate(() => this.emit('musicEnd'));
        }
        // else: underrun (network hiccup) -> this frame is silence for the music layer
      }
    }

    // --- sound effects ---
    if (this.sfx.length > 0) {
      const finished = [];
      for (const s of this.sfx) {
        const slice = s.buffer.subarray(s.offset, s.offset + FRAME_BYTES);
        mixInto(acc, slice, this.sfxVolume * s.volume);
        s.offset += FRAME_BYTES;
        if (s.offset >= s.buffer.length) finished.push(s);
      }
      if (finished.length) {
        this.sfx = this.sfx.filter((s) => !finished.includes(s));
        for (const s of finished) setImmediate(() => this.emit('sfxEnd', s.id));
      }
      any = true;
    }

    if (any) this.lastActivity = Date.now();

    const out = Buffer.allocUnsafe(FRAME_BYTES);
    for (let i = 0; i < acc.length; i++) {
      let v = acc[i];
      if (v > 32767) v = 32767;
      else if (v < -32768) v = -32768;
      out.writeInt16LE(v, i * 2);
    }
    this.push(out);
  }

  _destroy(err, cb) {
    this.clearMusic();
    this.sfx = [];
    cb(err);
  }
}

function mixInto(acc, chunk, gain) {
  const samples = chunk.length >> 1;
  for (let i = 0; i < samples; i++) {
    acc[i] += Math.round(chunk.readInt16LE(i * 2) * gain);
  }
}
