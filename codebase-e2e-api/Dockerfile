FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=4000 \
    WORKSPACE_DIR=/workspace/codebase

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY codebase-e2e-api/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY codebase-e2e-api/bootstrap.mjs ./bootstrap.mjs
COPY codebase-e2e-api/server.mjs ./server.mjs
COPY codebase-e2e-api/patch-independent-workspace.mjs ./patch-independent-workspace.mjs
RUN node ./patch-independent-workspace.mjs ./server.mjs \
    && node --check ./server.mjs \
    && grep -Fq 'CODEBASE_API_INDEPENDENT_WORKSPACE_V1' ./server.mjs \
    && grep -Fq "workspaceKind: 'independent'" ./server.mjs \
    && grep -Fq "No project Git repository is linked to this independent Codebase workspace." ./server.mjs \
    && ! grep -Fq "process.env.SULANDRA_GITHUB_REPOSITORY" ./server.mjs \
    && ! grep -Fq "https://github.com/sngwabil/sulandra-website.git" ./server.mjs

RUN mkdir -p /workspace/codebase && chown -R node:node /workspace /app

EXPOSE 4000
USER node
CMD ["node", "bootstrap.mjs"]
