FROM node:22-bookworm-slim

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json ./api/package.json
RUN npm ci --include=dev

COPY prisma ./prisma
COPY scripts ./scripts
COPY interview-scheduling.html ./interview-scheduling.html
RUN npm run db:generate

COPY api ./api
RUN npm run build

ENV NODE_ENV=production
ENV PORT=4000
ENV INTERVIEW_SCHEDULING_URL=https://sulandra-static-website-production.up.railway.app/interview-scheduling.html

EXPOSE 4000

USER node

CMD ["npm", "run", "start"]
