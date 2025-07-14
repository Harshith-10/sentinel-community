FROM node:18-alpine AS builder

# Install required languages and tools
RUN apk add --no-cache \
    python3 \
    py3-pip \
    openjdk11 \
    g++ \
    gcc \
    go \
    make

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including dev dependencies for building)
RUN npm ci

# Copy application code
COPY src/ ./src/
COPY config/ ./config/

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine

# Install required languages and tools
RUN apk add --no-cache \
    python3 \
    py3-pip \
    openjdk11 \
    g++ \
    gcc \
    go \
    make

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built application from builder stage
COPY --from=builder /usr/src/app/dist ./dist/
COPY config/ ./config/

# Create temp directory for code execution
RUN mkdir -p /tmp/code-execution

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of temp directory
RUN chown -R nodejs:nodejs /tmp/code-execution

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8910

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8910/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"]