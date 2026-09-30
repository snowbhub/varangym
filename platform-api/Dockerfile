FROM node:22-alpine

WORKDIR /app
RUN apk upgrade --no-cache

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src ./src
COPY migrations ./migrations

# The production PostgreSQL parser has rejected the date-series form that used
# generate_series(date,date,'1 day') in the admin insights service. Keep the source readable
# while normalising that exact query shape in the image so Admin Home/Finance/Stats cannot fail
# on startup/runtime with `syntax error at or near "day"`.
RUN sed -i "s|WITH d AS (SELECT generate_series(current_date-89,current_date,'1 day')::date day)|WITH d AS (SELECT (current_date-gs)::date AS day FROM generate_series(89,0,-1) AS gs)|g" src/insights-server.js

ENV NODE_ENV=production
ENV PORT=3000
ENV TRAINING_PORT=3001
EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --spider -q "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["node", "src/start.js"]
