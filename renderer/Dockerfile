FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    DEBIAN_FRONTEND=noninteractive

# FFmpeg/ffprobe and Chrome Headless Shell's Debian runtime dependencies.
# Keep these in sync with https://www.remotion.dev/docs/docker.
RUN apt-get update \
 && apt-get install -y --no-install-recommends -o Dpkg::Use-Pty=0 \
    ffmpeg curl ca-certificates fonts-liberation \
    libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 libxrandr2 \
    libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 \
    libpango-1.0-0 libcairo2 libcups2 \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.19.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
# Download the installed Remotion version's browser at build time. This does
# not launch Chrome or render media, and avoids a first-render download.
RUN node --input-type=module -e "import { ensureBrowser } from '@remotion/renderer'; await ensureBrowser();"

COPY tsconfig.json ./
COPY src ./src
COPY fixtures ./fixtures
RUN pnpm build

RUN useradd --create-home --uid 10001 appuser \
  && chown -R appuser:appuser /app/dist /app/fixtures
USER appuser

EXPOSE 8080

# Coolify can restart an unhealthy worker without exposing its internals.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl --fail --silent http://127.0.0.1:8080/health || exit 1

# Start the HTTP worker entrypoint.
CMD ["node", "dist/server.js"]
