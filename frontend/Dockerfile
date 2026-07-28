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

# Build with VITE_API_URL (defaults to same-origin, nginx proxies to backend)
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: Serve via nginx
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config template
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template

# nginx will substitute ${BACKEND_URL} and ${VITE_API_URL} at startup
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
