# ============================================================================
# MAX 2.0 — Slim Production Dockerfile (target: <150MB)
# ============================================================================
# Build context: idk-codex/
# ============================================================================

# ============================================================================
# STAGE 1: Install only essential production dependencies
# ============================================================================
FROM node:22-alpine AS backend-builder

RUN apk add --no-cache python3 make g++ clang

WORKDIR /app

COPY package.json package-lock*.json ./

# Install only production deps, skip optional/native where possible
RUN npm ci --only=production --no-optional && npm cache clean --force

# Remove heavy unused packages to shrink node_modules
RUN rm -rf /app/node_modules/@babel && \
    rm -rf /app/node_modules/recast && \
    rm -rf /app/node_modules/ast-types && \
    rm -rf /app/node_modules/@octokit && \
    rm -rf /app/node_modules/simple-git && \
    rm -rf /app/node_modules/@anthropic-ai && \
    rm -rf /app/node_modules/@google && \
    rm -rf /app/node_modules/groq-sdk && \
    rm -rf /app/node_modules/jsonwebtoken && \
    rm -rf /app/node_modules/chalk && \
    rm -rf /app/node_modules/fs-safe

# Aggressive cleanup
RUN find /app/node_modules -name "*.md" -delete 2>/dev/null; \
    find /app/node_modules -name "*.map" -delete 2>/dev/null; \
    find /app/node_modules -name "*.txt" -delete 2>/dev/null; \
    find /app/node_modules -name "LICENSE*" -delete 2>/dev/null; \
    find /app/node_modules -name "CHANGELOG*" -delete 2>/dev/null; \
    find /app/node_modules -name "README*" -delete 2>/dev/null; \
    find /app/node_modules -name "test" -type d -exec rm -rf {} + 2>/dev/null; \
    find /app/node_modules -name "tests" -type d -exec rm -rf {} + 2>/dev/null; \
    find /app/node_modules -name "docs" -type d -exec rm -rf {} + 2>/dev/null; \
    find /app/node_modules -name "examples" -type d -exec rm -rf {} + 2>/dev/null; \
    find /app/node_modules -name "*.d.ts" -delete 2>/dev/null; \
    find /app/node_modules -name "*.flow" -delete 2>/dev/null; \
    rm -rf /root/.npm /tmp/*; true

# ============================================================================
# STAGE 2: Final production image (minimal)
# ============================================================================
FROM node:22-alpine

RUN apk add --no-cache git wget && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy slimmed node_modules
COPY --from=backend-builder /app/node_modules ./node_modules

# Copy source — every src/ subdirectory
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

# Copy pre-built frontend
COPY app-dist ./dist

# Init database
RUN node src/database/init-db.js

# Create runtime dirs
RUN mkdir -p data logs sessions sandbox-workspace && chmod 755 data logs sessions sandbox-workspace

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/api/health || exit 1

CMD ["node", "server.js"]
