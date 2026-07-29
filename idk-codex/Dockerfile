# ============================================================================
# MAX 2.0 — Production Dockerfile
# ============================================================================
# Build context: idk-codex/
# Keeps all dependencies (they're all imported) but aggressively cleans
# unnecessary files from node_modules to reduce image size.
# ============================================================================

# ============================================================================
# STAGE 1: Install all production dependencies
# ============================================================================
FROM node:22-alpine AS backend-builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock*.json ./

RUN npm install --omit=dev && npm cache clean --force

# Aggressive file-level cleanup (keeps all packages, removes junk files)
RUN find /app/node_modules -name "*.md" -delete 2>/dev/null; \
    find /app/node_modules -name "*.map" -delete 2>/dev/null; \
    find /app/node_modules -name "*.markdown" -delete 2>/dev/null; \
    find /app/node_modules -name "*.txt" -delete 2>/dev/null; \
    find /app/node_modules -name "CHANGELOG*" -delete 2>/dev/null; \
    find /app/node_modules -name "README*" -delete 2>/dev/null; \
    find /app/node_modules -name "LICENSE*" -delete 2>/dev/null; \
    find /app/node_modules -name "*.d.ts" -delete 2>/dev/null; \
    find /app/node_modules -name "*.flow" -delete 2>/dev/null; \
    find /app/node_modules -name ".eslintignore" -delete 2>/dev/null; \
    find /app/node_modules -name ".eslintrc*" -delete 2>/dev/null; \
    find /app/node_modules -name ".npmignore" -delete 2>/dev/null; \
    find /app/node_modules -name ".travis.yml" -delete 2>/dev/null; \
    find /app/node_modules -name "test" -type d -exec rm -rf {} + 2>/dev/null; \
    find /app/node_modules -name "tests" -type d -exec rm -rf {} + 2>/dev/null; \
    find /app/node_modules -name "docs" -type d -exec rm -rf {} + 2>/dev/null; \
    find /app/node_modules -name "examples" -type d -exec rm -rf {} + 2>/dev/null; \
    find /app/node_modules -name "benchmarks" -type d -exec rm -rf {} + 2>/dev/null; \
    find /app/node_modules -name "coverage" -type d -exec rm -rf {} + 2>/dev/null; \
    find /app/node_modules -name "__tests__" -type d -exec rm -rf {} + 2>/dev/null; \
    find /app/node_modules -name ".github" -type d -exec rm -rf {} + 2>/dev/null; \
    rm -rf /root/.npm /tmp/*; true

# ============================================================================
# STAGE 2: Final production image
# ============================================================================
FROM node:22-alpine

RUN apk add --no-cache git wget python3 py3-pip chromium nss freetype harfbuzz ca-certificates ttf-freefont && rm -rf /var/cache/apk/*

WORKDIR /app

COPY --from=backend-builder /app/node_modules ./node_modules

# Copy source — every src/ subdirectory
COPY src/database ./src/database
COPY src/agent ./src/agent
COPY src/api ./src/api
COPY src/auth ./src/auth
COPY src/bot ./src/bot
COPY src/context ./src/context
COPY src/error-resolution ./src/error-resolution
COPY src/github ./src/github
COPY src/groq ./src/groq
COPY src/interfaces ./src/interfaces
COPY src/llm ./src/llm
COPY src/memory ./src/memory
COPY src/middleware ./src/middleware
COPY src/scheduler ./src/scheduler
COPY src/security ./src/security
COPY src/skills ./src/skills
COPY src/ui ./src/ui
COPY src/utils ./src/utils
COPY src/watchdog ./src/watchdog
COPY src/rag ./src/rag
COPY src/modes ./src/modes
COPY sql ./sql

COPY server.js ./
COPY package.json ./

# NOTE: Frontend is deployed as a SEPARATE Railway service (Next.js).
# Do NOT copy app-dist here — backend runs in API-only mode and returns
# JSON { service: 'MAX API', status: 'running' } for non-API routes.

# Init database
RUN node src/database/init-db.js

# Create runtime dirs
RUN mkdir -p data logs sessions sandbox-workspace && chmod 755 data logs sessions sandbox-workspace

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/api/health || exit 1

CMD ["node", "server.js"]
