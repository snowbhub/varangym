FROM nginx:1.27-alpine

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY public /usr/share/nginx/html

ENV NGINX_PORT=8080
ENV API_BACKEND=http://platform-api.railway.internal:3000
ENV TRAINING_BACKEND=http://platform-api.railway.internal:3001
EXPOSE 8080
