FROM node:22-bookworm-slim

WORKDIR /app

# Install the root Prisma/runtime dependencies first for cacheable builds.
COPY package.json ./
RUN npm install --include=dev

# Install API dependencies separately.
COPY api/package.json ./api/package.json
RUN npm install --prefix api --include=dev

# Generate the Prisma client before copying the application source.
COPY prisma ./prisma
RUN npm run db:generate

COPY api ./api

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["npm", "run", "start", "--prefix", "api"]
