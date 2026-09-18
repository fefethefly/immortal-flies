FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY server ./server
COPY public/contract/life ./public/contract/life
COPY public/data/malecns-circuit ./public/data/malecns-circuit
COPY public/data/malecns-full ./public/data/malecns-full
ENV IFF_GRAPH_DIR=/app/public/data/malecns-full
ENV IFF_DATA_DIR=/app/server/data/runner
ENV IFF_CHAIN_ID=97
ENV NODE_OPTIONS=--max-old-space-size=1536
EXPOSE 8788
CMD ["node", "server/src/runner/index.mjs"]
