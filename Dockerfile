# UFMS API - Production Dockerfile (for Railway / Fly.io / VPS)
# Build: docker build -t ufms-api .
# Run: docker run -p 3000:3000 --env-file .env ufms-api

FROM node:20-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# 1. Install deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json 2>/dev/null || true
RUN npm install --ignore-scripts

# 2. Copy source
COPY . .

# 3. Generate Prisma Client + Build API
RUN npx prisma generate --schema packages/database/prisma/schema.prisma
RUN npm --workspace apps/api run build

# 4. Runtime
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/packages ./packages
COPY --from=base /app/apps/api/dist ./apps/api/dist
COPY --from=base /app/apps/api/package.json ./apps/api/package.json
COPY --from=base /app/prisma ./prisma 2>/dev/null || true
COPY --from=base /app/packages/database/prisma ./packages/database/prisma

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy --schema packages/database/prisma/schema.prisma && node apps/api/dist/main.js"]
