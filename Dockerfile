# Multi-stage Dockerfile para Schimidt Brain (monorepo)
# Stage 1: Build de todos os pacotes + API
FROM node:22-slim AS builder

WORKDIR /app

# Copiar todos os package.json e lock files
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/adapters/package.json packages/adapters/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/package-lock.json apps/api/

# Instalar dependências de cada pacote (ordem de dependência)
RUN cd packages/contracts && npm install
RUN cd packages/core && npm install
RUN cd packages/adapters && npm install
RUN cd packages/db && npm install
RUN cd apps/api && npm install

# Copiar todo o código fonte
COPY packages/ packages/
COPY apps/api/ apps/api/

# Build na ordem correta de dependência
RUN cd packages/contracts && npm run build
RUN cd packages/core && npm run build
RUN cd packages/adapters && npm run build
RUN cd packages/db && npm run build
RUN cd apps/api && npm run build

# Stage 2: Runtime
FROM node:22-slim

WORKDIR /app

# Copiar package files
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/adapters/package.json packages/adapters/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/package-lock.json apps/api/

# Instalar apenas dependências de produção
RUN cd packages/contracts && npm install --omit=dev
RUN cd packages/core && npm install --omit=dev
RUN cd packages/adapters && npm install --omit=dev
RUN cd packages/db && npm install --omit=dev
RUN cd apps/api && npm install --omit=dev

# Copiar builds
COPY --from=builder /app/packages/contracts/dist packages/contracts/dist
COPY --from=builder /app/packages/core/dist packages/core/dist
COPY --from=builder /app/packages/adapters/dist packages/adapters/dist
COPY --from=builder /app/packages/db/dist packages/db/dist
COPY --from=builder /app/packages/db/src/migrations packages/db/src/migrations
COPY --from=builder /app/apps/api/dist apps/api/dist

# Expor porta
EXPOSE 3000

# Variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_OPTIONS="--max-old-space-size=450 --expose-gc"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start
CMD ["node", "apps/api/dist/server.js"]
