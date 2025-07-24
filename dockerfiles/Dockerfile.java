# --- Executor for Java ---

# Builder Stage
FROM node:22-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci
COPY src/ ./src/
COPY config/ ./config/
RUN npm run build

# Production Stage
FROM eclipse-temurin:21-alpine

# Install Node.js for the executor runtime.
# This command might need to be changed based on the base image's package manager (e.g., apt-get, yum).
RUN if command -v apk &> /dev/null; then apk add --no-cache nodejs npm; \
    elif command -v apt-get &> /dev/null; then apt-get update && apt-get install -y nodejs npm; \
    elif command -v yum &> /dev/null; then yum install -y nodejs npm; \
    else echo "Warning: Could not detect package manager. Node.js may need to be installed manually." >&2; fi

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /usr/src/app/dist ./dist/
COPY --from=builder /usr/src/app/config ./config/

RUN mkdir -p /tmp/code-execution

# Create a non-root user for security
RUN addgroup -g 1001 -S executor && adduser -S executor -u 1001

RUN chown -R executor:executor /tmp/code-execution

USER executor

CMD ["npm", "run", "start:executor"]