FROM node:22-bookworm-slim

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends \
      openssl \
      bash \
      git \
      curl \
      ca-certificates \
      build-essential \
      python3 \
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

# The production API and the isolated coding-terminal worker deliberately share
# one immutable image so Railway cannot accidentally select a different
# Dockerfile for the worker. They still run as separate Railway services with
# separate environment variables and network boundaries.
COPY coding-terminal-worker/package.json ./coding-terminal-worker/package.json
RUN npm --prefix coding-terminal-worker install --omit=dev --no-audit --no-fund
COPY coding-terminal-worker/server.mjs ./coding-terminal-worker/server.mjs

# Seed an isolated, credential-free repository snapshot for terminal workspaces.
# The API service never executes the terminal worker, while the worker service
# copies from /seed into its own writable /workspaces directory.
RUN mkdir -p /seed /workspaces \
    && chown node:node /workspaces
COPY . /seed
RUN rm -rf \
      /seed/.git \
      /seed/node_modules \
      /seed/api/node_modules \
      /seed/api/dist \
      /seed/dist-web \
      /seed/coverage

ENV NODE_ENV=production
ENV PORT=4000
ENV INTERVIEW_SCHEDULING_URL=https://sulandra-static-website-production.up.railway.app/interview-scheduling.html

EXPOSE 4000 8080

USER node

CMD ["npm", "run", "start"]
