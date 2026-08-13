FROM node:22-alpine

WORKDIR /app

COPY api/package*.json ./

RUN npm ci --omit=dev

COPY api/server.js ./

USER node

EXPOSE 3000

CMD ["node", "server.js"]