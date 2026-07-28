FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --include=dev

COPY api/package.json ./api/package.json
RUN npm install --prefix api --include=dev

COPY prisma ./prisma
RUN npm run db:generate

COPY api ./api
COPY spire ./spire

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["npm", "run", "start", "--prefix", "api"]
