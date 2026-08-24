FROM node:22-bookworm-slim

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json ./api/package.json
RUN npm ci --include=dev

COPY prisma ./prisma
RUN npm run db:generate

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "-e", "setInterval(() => {}, 1 << 30)"]
