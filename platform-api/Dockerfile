FROM node:22-alpine

WORKDIR /app
RUN apk upgrade --no-cache

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src ./src
COPY migrations ./migrations

ENV NODE_ENV=production
ENV PORT=3000
ENV TRAINING_PORT=3001
EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --spider -q "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["node", "src/start.js"]
