# Printer Monitor - Server Docker Image
# Multi-stage build for minimal image size

# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for potential build steps)
RUN npm ci --only=production

# Production stage
FROM node:18-alpine AS production

# Add labels for the image
LABEL maintainer="Printer Monitor Team"
LABEL description="SNMP-based printer monitoring system"
LABEL version="1.2.0"

# Create non-root user for security
RUN addgroup -g 1001 -S printermonitor && \
    adduser -S printermonitor -u 1001 -G printermonitor

WORKDIR /app

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY server.js storage.js ./
COPY *.html ./

# Create data directory with correct permissions
RUN mkdir -p /app/data && chown -R printermonitor:printermonitor /app

# Switch to non-root user
USER printermonitor

# Environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Expose the API port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

# Start the server
CMD ["node", "server.js"]
