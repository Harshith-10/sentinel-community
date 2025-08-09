# --- Executor for C++ ---

# Use the pre-built application image as a builder stage
FROM harshithd/sentinel-app-builder:latest AS builder

# Production Stage
FROM alpine:3.22

# Install Node.js for the executor runtime.
# This command might need to be changed based on the base image's package manager (e.g., apt-get, yum).
RUN apk add --no-cache nodejs npm
RUN apk add --no-cache g++ make

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /usr/src/app/dist ./dist/
COPY --from=builder /usr/src/app/config ./config/

RUN mkdir -p /tmp/code-execution
RUN mkdir -p /tmp/sentinel-cache

# Create a non-root user for security
RUN addgroup -g 1001 -S executor && adduser -S executor -u 1001

RUN chown -R executor:executor /tmp/code-execution /tmp/sentinel-cache

USER executor

CMD ["sh", "-c", "ulimit -u 1000 && npm run start:executor"]