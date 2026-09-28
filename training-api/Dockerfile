FROM node:22-alpine
WORKDIR /app
COPY training-api/package.json ./package.json
RUN npm install --omit=dev && npm cache clean --force
COPY training-api/src ./src
COPY frontend/src/lib/exercises-data.js ./src/exercises-data.js
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget --spider -q "http://127.0.0.1:${PORT}/training/health" || exit 1
CMD ["node", "src/server.js"]
