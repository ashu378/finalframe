FROM node:22-bookworm-slim

ENV NODE_ENV=production

# Remotion uses these binaries when producing the final video.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.19.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
COPY fixtures ./fixtures
RUN pnpm build

RUN useradd --create-home --uid 10001 appuser \
  && chown -R appuser:appuser /app/dist /app/fixtures
USER appuser

EXPOSE 8080

# Start the HTTP worker entrypoint.
CMD ["node", "dist/server.js"]
