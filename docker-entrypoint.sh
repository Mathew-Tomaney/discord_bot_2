#!/bin/sh
set -e

# YouTube changes constantly and yt-dlp ships fixes within days.
# Self-update on every start unless disabled.
if [ "${YTDLP_AUTO_UPDATE:-true}" != "false" ]; then
  echo "Checking for yt-dlp updates..."
  yt-dlp -U 2>&1 | tail -n 1 || echo "yt-dlp self-update failed (continuing with installed version)"
fi

exec "$@"
