# ============================================================================
# MAX — Production Dockerfile
# ============================================================================
# Build context: repo root (so we can access both app/ and idk-codex/)
# Railway config: builder = "DOCKERFILE", dockerfilePath = "Dockerfile"
# ============================================================================

# ============================================================================
# STAGE 1: Install backend dependencies
# ============================================================================
FROM node:22-alpine AS backend-builder

# Install build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy backend package files
COPY idk-codex/package.json idk-codex/package-lock*.json ./

# Install production dependencies
RUN npm ci --only=production && npm cache clean --force

# Install ruflo (non-interactive)
RUN npm install ruflo@3.10.10 --omit=dev || echo "Ruflo install failed, continuing"
RUN RUFLO_AUTO_CONFIRM=true NO_INTERACTIVE=true npx ruflo init --force || echo "Ruflo init skipped"
RUN RUFLO_AUTO_CONFIRM=true NO_INTERACTIVE=true npx ruflo swarm init --topology hierarchical --max-agents 4 --strategy specialized || echo "Ruflo swarm init skipped"

# Cleanup to reduce image size
RUN npm cache clean --force && \
    rm -rf /root/.npm /tmp/* && \
    find /app/node_modules -name "*.map" -delete 2>/dev/null || true && \
    find /app/node_modules -name "*.md" -delete 2>/dev/null || true && \
    find /app/node_modules -name "*.txt" -delete 2>/dev/null || true && \
    find /app/node_modules -name "CHANGELOG*" -delete 2>/dev/null || true && \
    find /app/node_modules -name "README*" -delete 2>/dev/null || true && \
    find /app/node_modules -name "LICENSE*" -delete 2>/dev/null || true && \
    find /app/node_modules -name "test" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -name "tests" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -name "docs" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -name "examples" -type d -exec rm -rf {} + 2>/dev/null || true

# ============================================================================
# STAGE 2: Final production image
# ============================================================================
FROM node:22-alpine

# Runtime essentials
RUN apk add --no-cache git wget && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy production dependencies from builder
COPY --from=backend-builder /app/node_modules ./node_modules

# Copy backend source — EVERY src/ subdirectory must be listed here.
# Missing any one causes ERR_MODULE_NOT_FOUND at runtime.
COPY idk-codex/src/database ./src/database
COPY idk-codex/src/agent ./src/agent
COPY idk-codex/src/api ./src/api
COPY idk-codex/src/bot ./src/bot
COPY idk-codex/src/context ./src/context
COPY idk-codex/src/error-resolution ./src/error-resolution
COPY idk-codex/src/github ./src/github
COPY idk-codex/src/groq ./src/groq
COPY idk-codex/src/interfaces ./src/interfaces
COPY idk-codex/src/llm ./src/llm
COPY idk-codex/src/memory ./src/memory
COPY idk-codex/src/security ./src/security
COPY idk-codex/src/skills ./src/skills
COPY idk-codex/src/ui ./src/ui
COPY idk-codex/src/utils ./src/utils

# Backend root files
COPY idk-codex/server.js ./
COPY idk-codex/package.json ./
COPY idk-codex/ruflo.config.js ./

# Copy the pre-built frontend dist.
# app/dist/ is committed to the repo (force-added past .gitignore).
# web-gateway.js looks for it at path.resolve(__dirname, '..', '..', 'app', 'dist')
# which resolves to /app/app/dist in the container.
COPY app/dist ./app/dist

# Initialize database
RUN node src/database/init-db.js

# Create runtime directories
RUN mkdir -p data logs sessions sandbox-workspace obsidian-vault docs /tmp/volter/sop && \
    chmod -R 755 data logs sessions sandbox-workspace obsidian-vault docs /tmp/volter/sop

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/api/health || exit 1

# Start
CMD ["node", "server.js"]
