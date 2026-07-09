# ============================================================================
# STAGE 1: Build frontend (temporary build stage)
# ============================================================================
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package.json frontend/package-lock.json* ./

# Install frontend dependencies (including dev dependencies for build)
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build frontend (outputs to /app/frontend/dist)
RUN npm run build

# ============================================================================
# STAGE 2: Install backend dependencies (temporary build stage)
# ============================================================================
FROM node:22-alpine AS backend-builder

# Install only essential build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy backend package files
COPY package.json package-lock*.json ./

# Install ONLY production dependencies
RUN npm ci --only=production && npm cache clean --force

# Install ruflo and initialize (non-interactive for Docker)
RUN npm install ruflo@3.10.10 --omit=dev || echo "Ruflo install failed, continuing"

# Initialize ruflo (non-interactive, don't fail build if it errors)
RUN RUFLO_AUTO_CONFIRM=true NO_INTERACTIVE=true npx ruflo init --force || echo "Ruflo init skipped"

# Initialize swarm (non-interactive)
RUN RUFLO_AUTO_CONFIRM=true NO_INTERACTIVE=true npx ruflo swarm init --topology hierarchical --max-agents 4 --strategy specialized || echo "Ruflo swarm init skipped"

# Aggressive cleanup to maintain Docker image size <120MB
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
# STAGE 3: Final production image (minimal runtime)
# ============================================================================
FROM node:22-alpine

# Install only runtime essentials (no build tools)
RUN apk add --no-cache git && \
    rm -rf /var/cache/apk/*

WORKDIR /app

# Copy production dependencies from builder
COPY --from=backend-builder /app/node_modules ./node_modules

# Copy application source (explicit to ensure all directories included)
COPY src/database ./src/database
COPY src/agent ./src/agent
COPY src/api ./src/api
COPY src/bot ./src/bot
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

# Copy built frontend from builder
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Initialize database
RUN node src/database/init-db.js

# Create necessary directories with proper permissions
RUN mkdir -p data logs sessions sandbox-workspace obsidian-vault docs /tmp/volter/sop && \
    chmod -R 755 data logs sessions sandbox-workspace obsidian-vault docs /tmp/volter/sop

# Railway dynamically assigns PORT - no EXPOSE needed
# Application binds to process.env.PORT at runtime

# Health check using wget (simpler and more reliable)
RUN apk add --no-cache wget

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/api/health || exit 1

# Start application
CMD ["node", "server.js"]
