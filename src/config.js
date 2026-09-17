import 'dotenv/config';

const env = process.env;

function clientIdFromToken(token) {
  try {
    return Buffer.from(token.split('.')[0], 'base64').toString('utf8');
  } catch {
    return null;
  }
}

if (!env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

export const config = {
  token: env.DISCORD_TOKEN,
  clientId: env.DISCORD_CLIENT_ID || clientIdFromToken(env.DISCORD_TOKEN),
  guildId: env.GUILD_ID || null,
  autoDeploy: (env.AUTO_DEPLOY_COMMANDS ?? 'true').toLowerCase() !== 'false',

  ytdlpPath: env.YTDLP_PATH || 'yt-dlp',
  ffmpegPath: env.FFMPEG_PATH || 'ffmpeg',
  ytdlpCookies: env.YTDLP_COOKIES || null,
  ytdlpExtraArgs: (env.YTDLP_ARGS || '').split(' ').filter(Boolean),

  soundDirs: (env.SOUND_DIRS || 'sounds,sounds-builtin')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  idleTimeoutMs: Number(env.IDLE_TIMEOUT_SECONDS || 300) * 1000,
  aloneTimeoutMs: 60_000,
  defaultMusicVolume: Math.min(2, Math.max(0, Number(env.DEFAULT_VOLUME || 50) / 100)),
  maxPlaylist: Number(env.MAX_PLAYLIST_ITEMS || 100),
};
