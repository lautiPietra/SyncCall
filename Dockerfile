# syntax=docker/dockerfile:1

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build -w server && npm run build -w client

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

EXPOSE 5000
CMD ["node", "server/dist/server.js"]
