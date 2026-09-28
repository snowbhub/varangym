FROM --platform=$BUILDPLATFORM node:22-alpine AS build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --ignore-scripts

# The original client imports Coach core with this repository-relative path.
COPY api/coach/core/ /app/api/coach/core/
COPY frontend/ ./

# Staging: reuse the already-running exercise media endpoint. The VARANGYM client itself
# is built from this repository; only the large exercise images/GIFs are referenced there.
ENV VITE_IMG_BASE=https://kiril-coach-production.up.railway.app/img/
ENV VITE_GIF_BASE=https://kiril-coach-production.up.railway.app/gif/
RUN npm run build

FROM nginx:1.27-alpine

COPY platform-web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/frontend/dist /usr/share/nginx/html

# The workout app stays the original openGym build. This role-aware bridge only adds a small
# management entry point for trainer/admin accounts; it does not replace client screens.
COPY platform-web/athlete-bridge.js /usr/share/nginx/html/varangym-bridge.js
RUN sed -i 's#</body>#<script src="/varangym-bridge.js" defer></script></body>#' /usr/share/nginx/html/index.html

# Management is a separate surface. Athletes use the original workout app at /.
COPY platform-web/public /usr/share/nginx/html/manage

ENV NGINX_PORT=8080
ENV API_BACKEND=https://platform-api-production.up.railway.app
ENV API_HOST=platform-api-production.up.railway.app
EXPOSE 8080