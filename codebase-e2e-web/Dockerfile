FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app
COPY codebase-e2e-web/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY codebase-e2e-web/server.mjs ./server.mjs

EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
