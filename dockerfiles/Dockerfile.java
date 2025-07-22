FROM node:22-alpine AS builder

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY src/ ./src/
COPY config/ ./config/

# Build the application
RUN npm run build

# Production stage
FROM openjdk:17-alpine

# Install Node.js for the executor
RUN apk add --no-cache nodejs npm

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
RUN addgroup -g 1001 -S executor
RUN adduser -S executor -u 1001

# Change ownership of temp directory
RUN chown -R executor:executor /tmp/code-execution

# Switch to non-root user
USER executor

# Start the executor worker
CMD ["npm", "run", "start:executor"]
