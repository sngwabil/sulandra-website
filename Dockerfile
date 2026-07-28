FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json ./api/package.json
RUN npm ci --include=dev

COPY prisma ./prisma
COPY scripts ./scripts
RUN npm run db:generate

COPY api ./api
RUN npm run build

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

USER node

CMD ["npm", "run", "start"]
