import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { config } from '../config.js';

const URL_RE = /^https?:\/\/\S+$/i;
const SKIP_TITLES = new Set(['[Private video]', '[Deleted video]', '[Unavailable video]']);

function baseArgs() {
  const args = ['--no-warnings', '--no-progress', '--no-color', '--ignore-config'];
  if (config.ytdlpCookies) args.push('--cookies', config.ytdlpCookies);
  args.push(...config.ytdlpExtraArgs);
  return args;
}

function cleanError(stderr) {
  const lines = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const err = lines.find((l) => l.startsWith('ERROR')) || lines.at(-1) || 'yt-dlp failed';
  return err.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?([\w-]+:\s*)?/, '').slice(0, 300);
}

function run(bin, args, { timeoutMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${bin} timed out`));
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.stderr.on('data', (d) => {
      err += d;
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e.code === 'ENOENT' ? new Error(`${bin} not found on PATH`) : e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 || out.trim()) resolve({ out, err, code });
      else reject(new Error(cleanError(err)));
    });
  });
}

export function toTrack(e) {
  const url =
    e.webpage_url ||
    (e.url && /^https?:/.test(e.url) ? e.url : null) ||
    (e.id ? `https://www.youtube.com/watch?v=${e.id}` : null);
  return {
    title: e.title || 'Unknown title',
    url,
    duration: typeof e.duration === 'number' ? Math.round(e.duration) : null,
    uploader: e.uploader || e.channel || null,
    thumbnail: e.thumbnail || e.thumbnails?.at(-1)?.url || null,
    isLive: Boolean(e.is_live),
  };
}

/**
 * Turn a URL or search phrase into a list of tracks.
 * - URL to a video (even inside a playlist) -> one track
 * - URL to a playlist -> up to config.maxPlaylist tracks
 * - anything else -> first YouTube search hit
 */
export async function resolve(query) {
  const isUrl = URL_RE.test(query);
  const target = isUrl ? query : `ytsearch1:${query}`;
  const args = [...baseArgs(), '-J', '--flat-playlist', '--playlist-end', String(config.maxPlaylist)];
  if (isUrl && /[?&]v=/.test(query)) args.push('--no-playlist');
  args.push('--', target);

  const { out } = await run(config.ytdlpPath, args, { timeoutMs: 60_000 });
  let json;
  try {
    json = JSON.parse(out);
  } catch {
    throw new Error('yt-dlp returned something that was not JSON');
  }

  let tracks;
  if (json._type === 'playlist') {
    tracks = (json.entries || []).filter((e) => e && !SKIP_TITLES.has(e.title)).map(toTrack);
  } else {
    tracks = [toTrack(json)];
  }
  tracks = tracks.filter((t) => t.url);
  if (!tracks.length) throw new Error(isUrl ? 'Nothing playable at that link' : `No results for "${query}"`);
  const playlistTitle = json._type === 'playlist' && isUrl ? json.title || 'playlist' : null;
  return { tracks, playlistTitle };
}

/**
 * Start streaming a track: yt-dlp -> ffmpeg -> PCM s16le 48k stereo.
 * Returns { stream, kill }. The stream emits 'finish' when the decoder is done
 * and 'error' if nothing could be decoded at all.
 */
export function createTrackStream(track) {
  const ytArgs = [
    ...baseArgs(),
    '-f', 'bestaudio[acodec=opus]/bestaudio/best',
    '--no-playlist',
    '-o', '-',
    '--', track.url,
  ];
  const ffArgs = [
    '-hide_banner', '-loglevel', 'error',
    '-i', 'pipe:0',
    '-vn',
    '-f', 's16le', '-ar', '48000', '-ac', '2',
    'pipe:1',
  ];

  const yt = spawn(config.ytdlpPath, ytArgs, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const ff = spawn(config.ffmpegPath, ffArgs, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

  // ~4MB each side of the PassThrough => roughly 40s of decoded audio buffered ahead.
  const stream = new PassThrough({ highWaterMark: 4 * 1024 * 1024 });
  let stderr = '';
  let bytes = 0;
  let killed = false;

  yt.stderr.on('data', (d) => {
    stderr = (stderr + d).slice(-4000);
  });
  ff.stderr.on('data', (d) => {
    stderr = (stderr + d).slice(-4000);
  });
  yt.stdout.on('error', () => {});
  ff.stdin.on('error', () => {}); // EPIPE when we kill things
  ff.stdout.on('data', (d) => {
    bytes += d.length;
  });

  yt.on('error', (e) => {
    if (!killed) stream.destroy(e.code === 'ENOENT' ? new Error('yt-dlp not found on PATH') : e);
  });
  ff.on('error', (e) => {
    if (!killed) stream.destroy(e.code === 'ENOENT' ? new Error('ffmpeg not found on PATH') : e);
  });

  yt.stdout.pipe(ff.stdin);
  ff.stdout.pipe(stream);

  ff.on('close', () => {
    if (killed) return;
    if (bytes === 0) stream.destroy(new Error(cleanError(stderr)));
  });

  const kill = () => {
    if (killed) return;
    killed = true;
    try {
      yt.kill('SIGKILL');
    } catch {}
    try {
      ff.kill('SIGKILL');
    } catch {}
    stream.destroy();
  };

  return { stream, kill };
}
