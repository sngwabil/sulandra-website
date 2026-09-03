FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=4000 \
    WORKSPACE_DIR=/workspace/sulandra-website

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY codebase-e2e-api/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY codebase-e2e-api/server.mjs ./server.mjs

RUN mkdir -p /workspace && chown -R node:node /workspace /app

EXPOSE 4000
USER node
CMD ["node", "server.mjs"]
