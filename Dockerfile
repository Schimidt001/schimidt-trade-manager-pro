# Use Alpine for smaller image size and faster downloads
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm@latest

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy all packages and apps
COPY apps ./apps
COPY packages ./packages

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Build API
RUN pnpm -C apps/api build

# Production stage
FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm@latest

WORKDIR /app

# Copy everything from builder
COPY --from=builder /app ./

# Expose port
EXPOSE 3000

# Start API
CMD ["pnpm", "-C", "apps/api", "start"]
