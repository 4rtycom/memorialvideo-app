# Render worker image. Build from the repository root:
#   docker build -f worker/Dockerfile -t memorialvideo-render-worker .
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core fonts-noto-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production \
    APP_ENV=production
# Local work directory for downloaded memories and finished renders (cleaned after each job).
VOLUME ["/app/.data"]

CMD ["pnpm", "worker:render"]
