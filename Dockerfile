# syntax=docker/dockerfile:1

# ---------- build stage: has a compiler so native modules (@discordjs/opus) can build if no prebuilt binary matches ----------
FROM node:22-bookworm-slim AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# ---------- runtime stage ----------
FROM node:22-bookworm-slim

# ffmpeg for decoding, curl/ca-certs for fetching yt-dlp (the standalone yt-dlp binary bundles its own Python).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp standalone binary, picked for the CPU we are building on (works on Oracle ARM and x86 alike).
# Owned by `node` so the self-update on container start (yt-dlp -U) can replace it.
RUN arch="$(uname -m)" \
 && case "$arch" in \
      x86_64) f=yt-dlp_linux ;; \
      aarch64) f=yt-dlp_linux_aarch64 ;; \
      armv7l) f=yt-dlp_linux_armv7l ;; \
      *) echo "unsupported arch $arch" && exit 1 ;; \
    esac \
 && curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/$f" -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp \
 && chown node:node /usr/local/bin/yt-dlp \
 && yt-dlp --version

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts

# Generate the built-in soundboard clips. Your own clips go in /app/sounds (mounted as a volume).
RUN node scripts/generate-sfx.js /app/sounds-builtin && mkdir -p /app/sounds && chown -R node:node /app/sounds

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
USER node
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/index.js"]
