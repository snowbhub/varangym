FROM alpine:3.20 AS exercise-media
RUN apk add --no-cache git
RUN git clone --depth 1 https://github.com/hasaneyldrm/exercises-dataset /tmp/exercises

FROM --platform=$BUILDPLATFORM node:22-alpine AS build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --ignore-scripts

# The workout engine still reuses upstream modules internally, but the shipped product is VARANGYM.
COPY api/coach/core/ /app/api/coach/core/
COPY frontend/ ./

# Remove inherited product links/names from the compiled customer UI. License and NOTICE files are
# deliberately not touched; this only changes visible branding, backup names and update targets.
RUN sed -i \
  -e 's|https://gitlab.com/DuarteSantos8/opengym/-/releases|https://github.com/snowbhub/varangym/releases|g' \
  -e 's|https://gitlab.com/DuarteSantos8/opengym|https://github.com/snowbhub/varangym|g' \
  -e 's|https://opengym.duarte-santos.ch/#download|https://github.com/snowbhub/varangym/releases|g' \
  -e 's|opengym.duarte-santos.ch|github.com/snowbhub/varangym/releases|g' \
  -e 's|opengym-backup-|varangym-backup-|g' \
  -e 's|not an openGym backup|not a VARANGYM backup|g' \
  -e 's|openGym v{__APP_VERSION__}|VARANGYM v{__APP_VERSION__}|g' \
  src/views/Settings.jsx

# Runtime exercise media is served by this VARANGYM deployment itself. The dataset is fetched once
# while the Docker image is built, then copied into nginx below; clients never depend on the old
# Kiril/openGym Railway service just to render an exercise.
ENV VITE_IMG_BASE=/img/
ENV VITE_GIF_BASE=/gif/
RUN npm run build

FROM nginx:1.27-alpine

COPY platform-web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY --from=exercise-media /tmp/exercises/images/ /usr/share/nginx/html/img/
COPY --from=exercise-media /tmp/exercises/videos/ /usr/share/nginx/html/gif/

# Role-aware bridge: training stays in the proven workout UI while VARANGYM management is being
# folded into the same product shell. Only trainer/admin users receive the management entry point.
COPY platform-web/athlete-bridge.js /usr/share/nginx/html/varangym-bridge.js
RUN sed -i 's|</body>|<script src="/varangym-bridge.js" defer></script></body>|' /usr/share/nginx/html/index.html

# Coach / Business / Platform Admin management surface. Client accounts are redirected to `/`.
COPY platform-web/public /usr/share/nginx/html/manage
# When management opens the dedicated plan editor with ?mode=coach, land straight in the trainer
# workspace instead of briefly showing the athlete tab first.
RUN sed -i "s|let mode = 'client';|let mode = new URLSearchParams(location.search).get('mode') === 'coach' ? 'coach' : 'client';|" /usr/share/nginx/html/manage/training.js

ENV NGINX_PORT=8080
ENV API_BACKEND=https://platform-api-production.up.railway.app
ENV API_HOST=platform-api-production.up.railway.app
EXPOSE 8080
