FROM node:22-slim AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY migrations ./migrations
COPY knexfile.ts ./knexfile.ts

EXPOSE 3001
CMD ["sh", "-c", "npx tsx node_modules/.bin/knex migrate:latest --knexfile knexfile.ts && npx tsx dist/index.js"]
