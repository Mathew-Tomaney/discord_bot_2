# dnd-bot 🎲🔊

A Discord music + soundboard bot built for tabletop sessions.

- **YouTube queue** — `/play` a link, a playlist, or just words to search. Skip, pause, shuffle, loop, volume, the lot.
- **Soundboard over the music** — `/sfx play thunder` plays *on top of* the ambience, ducking the music while it fires. Comes with 14 synthesised fantasy/sci-fi clips; drop your own files in `sounds/`.
- **Self-hosted and free** — one small container, runs on your own PC or a free cloud VM.

Under the hood: discord.js 14 + `@discordjs/voice`, `yt-dlp` for YouTube, `ffmpeg` for decoding, and a small PCM mixer (`src/player/Mixer.js`) so several sounds can share one voice connection.

---

## Commands

| Command | What it does |
|---|---|
| `/play <query> [next]` | Queue a YouTube video / playlist / search. `next:true` jumps the queue. Also works with SoundCloud, Bandcamp, direct mp3 links… anything yt-dlp supports. |
| `/skip` | Skip the current track |
| `/stop` | Stop music and clear the queue (stays in channel for the soundboard) |
| `/pause` / `/resume` | Pause / resume |
| `/queue [page]` | Show now playing + what's next |
| `/nowplaying` | Progress bar for the current track |
| `/remove <position>` | Remove a queued track |
| `/shuffle` | Shuffle the queue |
| `/loop <off\|track\|queue>` | `track` is perfect for a looping ambience video |
| `/volume [0-200]` | Music volume |
| `/join` / `/leave` | Join your voice channel (soundboard-only sessions) / leave |
| `/sfx play <name> [volume]` | Play a sound effect over the music (autocompletes) |
| `/sfx list` | Show all clips |
| `/sfx stop` | Cut off playing effects |
| `/sfx volume <0-200>` | Overall soundboard volume |
| `/sfx reload` | Rescan the sound folders |

**Typical session:** `/play lofi tavern ambience` → `/loop track` → `/volume 30` → `/sfx play door-creak` when the party enters the inn.

---

## 1. Create the Discord application (5 minutes)

1. Go to https://discord.com/developers/applications → **New Application** → name it.
2. **Bot** tab → **Reset Token** → copy the token. You'll put it in `.env` as `DISCORD_TOKEN`. Never share it.
3. Still on the Bot tab: no privileged intents are needed. Leave them off.
4. **Installation** tab → Install Contexts: tick **Guild Install** only. Under *Default Install Settings* add scopes `applications.commands` and `bot`, and bot permissions: **View Channels, Send Messages, Embed Links, Connect, Speak**.
5. Copy the **Install Link** at the top of that page, open it, and add the bot to your server.

Optional: enable **Developer Mode** in Discord (Settings → Advanced), right-click your server → **Copy Server ID**, and set it as `GUILD_ID` in `.env`. Slash commands then appear instantly instead of taking up to an hour.

---

## 2. Run it

### Option A — Docker (recommended, works the same everywhere)

Docker installs ffmpeg and yt-dlp for you and generates the built-in sound clips.

```bash
cp .env.example .env      # then paste your token into .env
docker compose up -d --build
docker compose logs -f    # watch it log in
```

Update later with `docker compose up -d --build` again. yt-dlp self-updates every time the container starts, which matters because YouTube changes things often.

### Option B — plain Node on Windows / Mac / Linux

You need Node 22.12+, ffmpeg and yt-dlp on your PATH.

Windows (PowerShell):
```powershell
winget install Gyan.FFmpeg yt-dlp.yt-dlp
```
macOS: `brew install ffmpeg yt-dlp`  ·  Debian/Ubuntu: `sudo apt install ffmpeg && sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod +x /usr/local/bin/yt-dlp`

Then:
```bash
cp .env.example .env      # paste your token
npm install
npm run sfx               # generate the built-in soundboard clips (needs ffmpeg)
npm start
```

Keep yt-dlp fresh with `yt-dlp -U` (or `winget upgrade yt-dlp.yt-dlp`) if YouTube playback ever breaks.
---

## Adding your own sound effects

Drop `.mp3` / `.ogg` / `.wav` files into `sounds/`. `Dragon Roar.mp3` becomes `/sfx play dragon-roar`. Clips over 90 seconds are cut; use `/play` + `/loop track` for long ambience instead. See `sounds/README.md` for free CC0 sources.

The built-in clips (`sounds-builtin/`) are synthesised with ffmpeg by `scripts/generate-sfx.js`: thunder, explosion, sword-clash, laser, magic-sparkle, heartbeat, alarm, wind, rain, drum-hit, crit-fanfare, fail-trombone, door-creak, dice-roll. They're serviceable placeholders; real recorded clips will sound better.

---

## Configuration

Everything lives in `.env` — see `.env.example` for each setting. The ones you might touch:

| Variable | Default | Purpose |
|---|---|---|
| `DISCORD_TOKEN` | — | Required |
| `GUILD_ID` | global | Register commands to one server (instant) |
| `DEFAULT_VOLUME` | `50` | Starting music volume (%) |
| `IDLE_TIMEOUT_SECONDS` | `300` | Leave after this long with nothing playing |
| `YTDLP_COOKIES` | — | Cookies file for the YouTube bot-check wall |
| `YTDLP_ARGS` | — | Extra yt-dlp flags, e.g. a proxy |

## Troubleshooting

- **Commands don't appear** — with no `GUILD_ID`, global commands take up to an hour. Set `GUILD_ID` for instant results. Make sure the bot was invited with the `applications.commands` scope.
- **"Sign in to confirm you're not a bot"** — see the YouTube catch above (cookies or run at home).
- **"yt-dlp not found" / "ffmpeg not found"** — install them (section 2B) or use Docker.
- **Playback breaks after weeks of working** — YouTube changed something; update yt-dlp (`yt-dlp -U`, or restart the container which does it automatically).
- **Choppy audio** — the host is out of CPU or the network is congested. One ffmpeg decode is light, but a 1-core VM shared with other things can struggle.
- On startup the bot prints `generateDependencyReport()` from `@discordjs/voice`; it should list an Opus library, an encryption method and DAVE support. If Opus is missing, `npm rebuild @discordjs/opus`.
- **`npm audit` shows tar vulnerabilities** — they're in `node-pre-gyp`, which `@discordjs/opus` only uses at install time to unpack its prebuilt binary. Nothing from `tar` runs while the bot is up.

## Development

```bash
npm test          # unit tests for the mixer
npm run deploy    # (re)register slash commands without starting the bot
```

Layout: `src/index.js` (client + interaction routing) → `src/commands/*` (one file per slash command) → `src/player/GuildPlayer.js` (queue, connection, idle timer) → `src/player/Mixer.js` (PCM mixing) + `src/player/ytdlp.js` (stream from YouTube) + `src/soundboard.js` (clip library).
