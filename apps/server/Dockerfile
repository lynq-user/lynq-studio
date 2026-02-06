# ──────────────────────────────────────────────
# Lynq Studio — Ingestion Server Dockerfile
# ──────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Sadece dependency dosyalarını kopyala (cache layer)
COPY apps/server/package.json apps/server/package-lock.json* ./apps/server/
RUN cd apps/server && npm install --production

# Tracker build çıktısını kopyala
COPY packages/tracker/dist/ ./packages/tracker/dist/

# Server kaynak kodunu kopyala
COPY apps/server/src/ ./apps/server/src/

# Environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

WORKDIR /app/apps/server
CMD ["node", "src/index.js"]
