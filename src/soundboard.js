import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, resolve as resolvePath } from 'node:path';
import { config } from './config.js';

const AUDIO_EXT = new Set(['.mp3', '.ogg', '.oga', '.opus', '.wav', '.flac', '.m4a', '.aac', '.webm', '.wma']);
const MAX_SFX_SECONDS = 90;
const CACHE_LIMIT = 60;
const RESCAN_MS = 10_000;

export class Soundboard {
  constructor(dirs) {
    this.dirs = dirs.map((d) => resolvePath(d));
    this.sounds = new Map(); // name -> absolute path
    this.cache = new Map(); // name -> { buffer, mtimeMs }
    this.lastScan = 0;
    this.scan();
  }

  scan() {
    const found = new Map();
    for (const dir of this.dirs) {
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir)) {
        const ext = extname(file).toLowerCase();
        if (!AUDIO_EXT.has(ext)) continue;
        const name = basename(file, ext).toLowerCase().replace(/[\s_]+/g, '-');
        found.set(name, join(dir, file));
      }
    }
    this.sounds = found;
    this.lastScan = Date.now();
    return found.size;
  }

  maybeRescan() {
    if (Date.now() - this.lastScan > RESCAN_MS) this.scan();
  }

  list() {
    this.maybeRescan();
    return [...this.sounds.keys()].sort();
  }

  search(query, limit = 25) {
    const q = (query || '').toLowerCase().trim();
    const names = this.list();
    if (!q) return names.slice(0, limit);
    const starts = names.filter((n) => n.startsWith(q));
    const contains = names.filter((n) => !n.startsWith(q) && n.includes(q));
    return [...starts, ...contains].slice(0, limit);
  }

  resolveName(name) {
    this.maybeRescan();
    const key = (name || '').toLowerCase().trim().replace(/[\s_]+/g, '-');
    if (this.sounds.has(key)) return key;
    const fuzzy = this.search(key, 1);
    return fuzzy[0] ?? null;
  }

  /** Decode a clip to PCM s16le 48k stereo and cache it. */
  async load(name) {
    const path = this.sounds.get(name);
    if (!path) throw new Error(`No sound called "${name}"`);
    const mtimeMs = statSync(path).mtimeMs;
    const cached = this.cache.get(name);
    if (cached && cached.mtimeMs === mtimeMs) return cached.buffer;

    const buffer = await decode(path);
    if (this.cache.size >= CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(name, { buffer, mtimeMs });
    return buffer;
  }
}

function decode(path) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner', '-loglevel', 'error',
      '-i', path,
      '-t', String(MAX_SFX_SECONDS),
      '-vn',
      '-f', 's16le', '-ar', '48000', '-ac', '2',
      'pipe:1',
    ];
    const ff = spawn(config.ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const chunks = [];
    let err = '';
    ff.stdout.on('data', (d) => chunks.push(d));
    ff.stderr.on('data', (d) => {
      err += d;
    });
    ff.on('error', (e) => reject(e.code === 'ENOENT' ? new Error('ffmpeg not found on PATH') : e));
    ff.on('close', (code) => {
      const buf = Buffer.concat(chunks);
      if (code !== 0 && buf.length === 0) return reject(new Error(err.trim() || `ffmpeg exited with ${code}`));
      // Trim to a whole number of samples (4 bytes per stereo frame).
      resolve(buf.subarray(0, buf.length - (buf.length % 4)));
    });
  });
}

export const soundboard = new Soundboard(config.soundDirs);
