# Developer Journal MCP Server - Docker Image
# Exposes journal tools via HTTP API for Docker deployment

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps
WORKDIR /app

# Install dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files from root
COPY package.json package-lock.json ./

# Install all dependencies
RUN npm ci

# ============================================
# Stage 2: Builder
# ============================================
FROM node:20-alpine AS builder
WORKDIR /app

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# ============================================
# Stage 3: Runner (Production)
# ============================================
FROM node:20-alpine AS runner
WORKDIR /app

# Install runtime deps for better-sqlite3
RUN apk add --no-cache python3 make g++

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 mcpuser
RUN adduser --system --uid 1001 mcpuser

# Copy built server and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy HTTP server wrapper
COPY mcp-server/http-server.js ./http-server.js

# Create data directory
RUN mkdir -p /app/data && chown -R mcpuser:mcpuser /app

USER mcpuser

# Default port for HTTP API
EXPOSE 3333

ENV PORT=3333
ENV JOURNAL_DB_PATH=/app/data/journal.db

CMD ["node", "http-server.js"]
