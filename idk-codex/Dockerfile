# ============================================================================
# MAX — Production Dockerfile (slim build, no ruflo)
# ============================================================================
# Build context: idk-codex/
# ============================================================================

# ============================================================================
# STAGE 1: Install backend dependencies (production only, no ruflo)
# ============================================================================
FROM node:22-alpine AS backend-builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock*.json ./

# Install production dependencies only — no ruflo, no dev deps
RUN npm ci --only=production && npm cache clean --force

# Aggressive cleanup of node_modules to minimize image size
RUN rm -rf /root/.npm /tmp/* && \
    find /app/node_modules -name "*.map" -delete 2>/dev/null || true && \
    find /app/node_modules -name "*.md" -delete 2>/dev/null || true && \
    find /app/node_modules -name "*.txt" -delete 2>/dev/null || true && \
    find /app/node_modules -name "*.markdown" -delete 2>/dev/null || true && \
    find /app/node_modules -name "CHANGELOG*" -delete 2>/dev/null || true && \
    find /app/node_modules -name "README*" -delete 2>/dev/null || true && \
    find /app/node_modules -name "LICENSE*" -delete 2>/dev/null || true && \
    find /app/node_modules -name "*.d.ts" -delete 2>/dev/null || true && \
    find /app/node_modules -name "*.flow" -delete 2>/dev/null || true && \
    find /app/node_modules -name ".eslintignore" -delete 2>/dev/null || true && \
    find /app/node_modules -name ".eslintrc*" -delete 2>/dev/null || true && \
    find /app/node_modules -name ".npmignore" -delete 2>/dev/null || true && \
    find /app/node_modules -name ".travis.yml" -delete 2>/dev/null || true && \
    find /app/node_modules -name "test" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -name "tests" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -name "docs" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -name "examples" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -name "benchmarks" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -name "coverage" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -name "__tests__" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -name ".github" -type d -exec rm -rf {} + 2>/dev/null || true

# ============================================================================
# STAGE 2: Final production image (minimal)
# ============================================================================
FROM node:22-alpine

RUN apk add --no-cache wget && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy cleaned production dependencies
COPY --from=backend-builder /app/node_modules ./node_modules

# Copy backend source — EVERY src/ subdirectory must be listed
COPY src/database ./src/database
COPY src/agent ./src/agent
COPY src/api ./src/api
COPY src/bot ./src/bot
COPY src/context ./src/context
COPY src/error-resolution ./src/error-resolution
COPY src/github ./src/github
COPY src/groq ./src/groq
COPY src/interfaces ./src/interfaces
COPY src/llm ./src/llm
COPY src/memory ./src/memory
COPY src/security ./src/security
COPY src/skills ./src/skills
COPY src/ui ./src/ui
COPY src/utils ./src/utils

COPY server.js ./
COPY package.json ./

# Copy pre-built frontend dist.
# web-gateway.js resolves the frontend path as:
#   path.resolve(path.dirname(__dirname), '..', '..', 'app', 'dist')
# With __dirname = /app/src/interfaces, that resolves to /app/dist.
# So we copy app-dist/ to ./dist (= /app/dist in the container).
COPY app-dist ./dist

# Initialize database
RUN node src/database/init-db.js

# Create runtime directories
RUN mkdir -p data logs sessions sandbox-workspace && chmod 755 data logs sessions sandbox-workspace

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/api/health || exit 1

CMD ["node", "server.js"]
