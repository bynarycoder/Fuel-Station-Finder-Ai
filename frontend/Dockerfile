# Stage 1: Build Stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (leverage Docker layer caching)
COPY package*.json ./
RUN npm ci

# Copy application files and build
COPY . .
# Skip telemetry collection during build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 2: Runtime Stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Copy built assets and dependencies from builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

# Start Next.js production server
CMD ["npm", "start"]
