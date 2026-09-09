FROM node:20-bookworm-slim

ENV NODE_ENV=production

# Remotion uses these binaries when producing the final video.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

RUN useradd --create-home --uid 10001 appuser \
  && chown -R appuser:appuser /app
USER appuser

EXPOSE 8080

# The HTTP worker entrypoint will be added before the first deployment.
CMD ["node", "dist/server.js"]
