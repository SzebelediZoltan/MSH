FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate --schema=./prisma/schema.prisma
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
RUN addgroup --system --gid 1001 appgroup && adduser --system --uid 1001 --ingroup appgroup appuser
RUN mkdir -p /home/appuser && chown -R appuser:appgroup /home/appuser
ENV HOME=/home/appuser
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates curl fonts-liberation \
  libnss3 libnspr4 libgbm1 libdrm2 \
  libxkbcommon0 libxrandr2 libxfixes3 libxdamage1 libxcomposite1 \
  libglib2.0-0 libasound2 libatk-bridge2.0-0 libatk1.0-0 \
  libcups2 libxshmfence1 libpango-1.0-0 libcairo2 \
  && rm -rf /var/lib/apt/lists/*
# Blender CLI az FBX -> GLB konverzióhoz (Debian bookworm: 3.4.1)
RUN apt-get update && apt-get install -y --no-install-recommends \
  blender python3-numpy \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json
COPY --from=builder --chown=appuser:appgroup /app/scripts ./scripts
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
RUN npx puppeteer browsers install chrome-headless-shell && chown -R appuser:appgroup /app/.cache
USER appuser
CMD ["node", "dist/src/main.js"]
