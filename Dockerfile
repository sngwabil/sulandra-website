FROM node:22-bookworm-slim

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
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
# The owner-authorized IT release installer verifies the same live activity
# runtime used by the Static Website. Copy only that verification asset into the
# API image; it is not served by the API and does not turn the API into a static
# host.
COPY assets/it-agent-conversational-ui.js ./assets/it-agent-conversational-ui.js
RUN node scripts/optimize-admin-login-performance.mjs && npm run build

ENV NODE_ENV=production
ENV PORT=4000
ENV INTERVIEW_SCHEDULING_URL=https://sulandra-static-website-production.up.railway.app/interview-scheduling.html

EXPOSE 4000

USER node

CMD ["npm", "run", "start"]
