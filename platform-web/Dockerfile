FROM --platform=$BUILDPLATFORM node:22-alpine AS build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --ignore-scripts

# The workout engine still reuses upstream modules internally, but the shipped product is VARANGYM.
COPY api/coach/core/ /app/api/coach/core/
COPY frontend/ ./

# Remove the last user-facing legacy product references that remain in the inherited Settings
# source without touching LICENSE/NOTICE or source attribution files required by the upstream
# license. This only changes product UI / backup names / release links in the compiled build.
RUN sed -i \
  -e 's#https://gitlab.com/DuarteSantos8/opengym/-/releases#https://github.com/snowbhub/varangym/releases#g' \
  -e 's#opengym-backup-#varangym-backup-#g' \
  -e 's#not an openGym backup#not a VARANGYM backup#g' \
  src/views/Settings.jsx

# Staging currently reuses the existing exercise-media host while the app itself and all account
# data run from VARANGYM. Media can be explicitly cached per exercise for offline use by the PWA.
ENV VITE_IMG_BASE=https://kiril-coach-production.up.railway.app/img/
ENV VITE_GIF_BASE=https://kiril-coach-production.up.railway.app/gif/
RUN npm run build

FROM nginx:1.27-alpine

COPY platform-web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/frontend/dist /usr/share/nginx/html

# Role-aware bridge: training stays in the original proven workout UI; only trainer/admin users
# receive a management entry point.
COPY platform-web/athlete-bridge.js /usr/share/nginx/html/varangym-bridge.js
RUN sed -i 's#</body>#<script src="/varangym-bridge.js" defer></script></body>#' /usr/share/nginx/html/index.html

# Coach / Business / Platform Admin management surface. Client accounts are redirected to `/`.
COPY platform-web/public /usr/share/nginx/html/manage

ENV NGINX_PORT=8080
ENV API_BACKEND=https://platform-api-production.up.railway.app
ENV API_HOST=platform-api-production.up.railway.app
EXPOSE 8080