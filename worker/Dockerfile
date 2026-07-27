FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate --schema=./prisma/schema.prisma
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
RUN addgroup --system --gid 1001 appgroup && adduser --system --uid 1001 --ingroup appgroup appuser
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates fonts-liberation \
  libnss3 libnspr4 libgbm1 libdrm2 \
  libxkbcommon0 libxrandr2 libxfixes3 libxdamage1 libxcomposite1 \
  libglib2.0-0 libasound2 libatk-bridge2.0-0 libatk1.0-0 \
  libcups2 libxshmfence1 libpango-1.0-0 libcairo2 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json
USER appuser
CMD ["node", "dist/src/main.js"]
