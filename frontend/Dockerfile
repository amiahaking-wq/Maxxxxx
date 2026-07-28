# ============================================================================
# MAX Frontend — Standalone Railway Service
# ============================================================================
# Simple nginx serving static files. No proxy.
# Frontend calls backend directly using VITE_API_URL env var.
# ============================================================================

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock*.json ./
RUN npm install --no-audit --no-fund

COPY . .

# VITE_API_URL must be set at BUILD TIME (Vite bakes it into the JS bundle)
# Default to the backend's Railway URL
ARG VITE_API_URL="https://maxxxxx-production.up.railway.app"
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Stage 2: Serve static files with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# Simple nginx config — just serve static files, no proxy
RUN echo 'server { \
    listen 80; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    gzip on; \
    gzip_types text/plain text/css application/json application/javascript; \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
