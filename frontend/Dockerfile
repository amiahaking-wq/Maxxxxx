# ============================================================================
# MAX Frontend — Standalone Railway Service
# ============================================================================
# Builds the Vite React app and serves via nginx.
# Proxies /api and /socket.io to the backend Railway service.
# ============================================================================

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock*.json ./
RUN npm install --no-audit --no-fund

COPY . .

# Build (VITE_API_URL not needed — nginx proxies same-origin)
RUN npm run build

# Stage 2: Serve via nginx
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy startup script
COPY docker/start.sh /start.sh
RUN chmod +x /start.sh

# Remove default nginx config (we write our own at startup)
RUN rm -f /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["/start.sh"]
