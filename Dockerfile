# ============================================================================
# MAX — Production Dockerfile
# ============================================================================
# Build context must be the repo root (so we can access both app/ and idk-codex/).
# Railway config: builder = "DOCKERFILE", dockerfilePath = "Dockerfile"
# ============================================================================

# ============================================================================
# STAGE 1: Build the frontend (app/ — React 19 + Vite)
# ============================================================================
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY app/package.json app/package-lock.json* ./

# Install frontend dependencies (including dev dependencies for build)
RUN npm ci

# Copy frontend source
COPY app/ ./

# Build frontend (outputs to /app/frontend/dist)
RUN npm run build

# ============================================================================
# STAGE 2: Install backend dependencies
# ============================================================================
FROM node:22-alpine AS backend-builder

# Install only essential build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy backend package files
COPY idk-codex/package.json idk-codex/package-lock*.json ./

# Install ONLY production dependencies
RUN npm ci --only=production && npm cache clean --force

# Install ruflo and initialize (non-interactive for Docker)
RUN npm install ruflo@3.10.10 --omit=dev || echo "Ruflo install failed, continuing"

# Initialize ruflo (non-interactive, don't fail build if it errors)
RUN RUFLO_AUTO_CONFIRM=true NO_INTERACTIVE=true npx ruflo init --force || echo "Ruflo init skipped"

# Initialize swarm (non-interactive)
RUN RUFLO_AUTO_CONFIRM=true NO_INTERACTIVE=true npx ruflo swarm init --topology hierarchical --max-agents 4 --strategy specialized || echo "Ruflo swarm init skipped"

# Aggressive cleanup to maintain Docker image size
RUN npm cache clean --force && \
    rm -rf /root/.npm && \
    rm -rf /tmp/* && \
    find /app/node_modules -name "*.map" -delete && \
    find /app/node_modules -name "*.md" -delete && \
    find /app/node_modules -name "*.txt" -delete && \
    find /app/node_modules -name "CHANGELOG*" -delete && \
    find /app/node_modules -name "README*" -delete && \
    find /app/node_modules -name "LICENSE*" -delete && \
    find /app/node_modules -name "test" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -name "tests" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -name "docs" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -name "examples" -type d -exec rm -rf {} + 2>/dev/null || true

# ============================================================================
# STAGE 3: Final production image
# ============================================================================
FROM node:22-alpine

# Install only runtime essentials
RUN apk add --no-cache git wget && \
    rm -rf /var/cache/apk/*

WORKDIR /app

# Copy production dependencies from builder
COPY --from=backend-builder /app/node_modules ./node_modules

# Copy backend application source from idk-codex/src/
# IMPORTANT: copy EVERY subdirectory under src/ — missing any one of them
# causes ERR_MODULE_NOT_FOUND at runtime (the bug that caused the 7/9 deploy
# failure was src/context/ being missing from this list).
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

# Copy backend root files
COPY idk-codex/server.js ./
COPY idk-codex/package.json ./
COPY idk-codex/ruflo.config.js ./

# Copy built frontend.
# web-gateway.js looks for the frontend at:
#   path.resolve(path.dirname(__dirname), '..', '..', 'app', 'dist')
# which resolves to /app/app/dist in the container (since __dirname is
# /app/src/interfaces at runtime). We copy the built dist there.
COPY --from=frontend-builder /app/frontend/dist ./app/dist

# Initialize database
RUN node src/database/init-db.js

# Create necessary directories with proper permissions
RUN mkdir -p data logs sessions sandbox-workspace obsidian-vault docs /tmp/volter/sop && \
    chmod -R 755 data logs sessions sandbox-workspace obsidian-vault docs /tmp/volter/sop

# Health check using wget
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/api/health || exit 1

# Start application
CMD ["node", "server.js"]
