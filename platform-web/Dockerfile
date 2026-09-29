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

# Product branding is applied to every customer-facing source module before compilation. Internal
# storage/schema compatibility is left untouched; only names, public links and exported filenames
# shown to a user are changed.
RUN find src -type f \( -name '*.js' -o -name '*.jsx' \) -print0 | xargs -0 sed -i \
  -e 's|https://gitlab.com/DuarteSantos8/opengym/-/releases|https://github.com/snowbhub/varangym/releases|g' \
  -e 's|https://gitlab.com/DuarteSantos8/opengym|https://github.com/snowbhub/varangym|g' \
  -e 's|https://opengym.duarte-santos.ch/#download|https://github.com/snowbhub/varangym/releases|g' \
  -e 's|opengym.duarte-santos.ch|github.com/snowbhub/varangym/releases|g' \
  -e 's|opengym-backup-|varangym-backup-|g' \
  -e 's|openGym|VARANGYM|g'

# Runtime exercise media is served by this VARANGYM deployment itself. The dataset is fetched once
# while the Docker image is built, then copied into nginx below; clients never depend on another
# Railway service just to render an exercise.
ENV VITE_IMG_BASE=/img/
ENV VITE_GIF_BASE=/gif/
RUN npm run build

FROM nginx:1.27-alpine

COPY platform-web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY --from=exercise-media /tmp/exercises/images/ /usr/share/nginx/html/img/
COPY --from=exercise-media /tmp/exercises/videos/ /usr/share/nginx/html/gif/

# Trainer, business and platform-admin screens are React routes inside the same compiled application.
# There is deliberately no injected bridge, iframe or second static management site: one shell,
# one Passkey session and one navigation model are shipped to web/PWA/native wrappers.

ENV NGINX_PORT=8080
ENV API_BACKEND=https://platform-api-production.up.railway.app
ENV API_HOST=platform-api-production.up.railway.app
EXPOSE 8080
