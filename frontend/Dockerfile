# Frontend Dockerfile - Nginx 托管
FROM node:18-slim AS builder

WORKDIR /build

COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_API_BASE_URL=http://localhost:8000
ARG VITE_AMAP_WEB_JS_KEY=""
ARG VITE_AMAP_WEB_JS_SECURITY_KEY=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_AMAP_WEB_JS_KEY=$VITE_AMAP_WEB_JS_KEY
ENV VITE_AMAP_WEB_JS_SECURITY_KEY=$VITE_AMAP_WEB_JS_SECURITY_KEY

RUN npm run build

FROM nginx:alpine
COPY --from=builder /build/dist /usr/share/nginx/html

# Nginx SPA 配置
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location /api { \
        proxy_pass http://backend:8000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
    } \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
