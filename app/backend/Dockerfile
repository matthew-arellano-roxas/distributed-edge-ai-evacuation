# Stage 1: Build
FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Run
FROM node:22-slim
WORKDIR /app

# Set to production to optimize libraries like Express
ENV NODE_ENV=production

# Only copy the compiled files and production-only dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
RUN npm ci --only=production

# Use a non-root user for security
USER node

EXPOSE 3000
CMD ["node", "dist/server.js"]