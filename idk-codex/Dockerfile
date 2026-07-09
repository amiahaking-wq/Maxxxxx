# ============================================================================
# MAX — Production Dockerfile
# ============================================================================
# Build context: idk-codex/ (Railway service Root Directory = idk-codex/)
# The frontend dist is pre-copied to ./app-dist/ so it's within the context.
# ============================================================================

# ============================================================================
# STAGE 1: Install backend dependencies
# ============================================================================
FROM node:22-alpine AS backend-builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock*.json ./

RUN npm ci --only=production && npm cache clean --force

RUN npm install ruflo@3.10.10 --omit=dev || echo "Ruflo install failed, continuing"
RUN RUFLO_AUTO_CONFIRM=true NO_INTERACTIVE=true npx ruflo init --force || echo "Ruflo init skipped"
RUN RUFLO_AUTO_CONFIRM=true NO_INTERACTIVE=true npx ruflo swarm init --topology hierarchical --max-agents 4 --strategy specialized || echo "Ruflo swarm init skipped"

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

RUN apk add --no-cache git wget && rm -rf /var/cache/apk/*

WORKDIR /app

COPY --from=backend-builder /app/node_modules ./node_modules

# Copy EVERY src/ subdirectory. Missing any one causes ERR_MODULE_NOT_FOUND.
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
COPY ruflo.config.js ./

# Copy the pre-built frontend dist.
# web-gateway.js looks for it at path.resolve(__dirname, '..', '..', 'app', 'dist')
# which resolves to /app/app/dist at runtime. We copy app-dist/ there.
COPY app-dist ./app/dist

RUN node src/database/init-db.js

RUN mkdir -p data logs sessions sandbox-workspace obsidian-vault docs /tmp/volter/sop && \
    chmod -R 755 data logs sessions sandbox-workspace obsidian-vault docs /tmp/volter/sop

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/api/health || exit 1

CMD ["node", "server.js"]
