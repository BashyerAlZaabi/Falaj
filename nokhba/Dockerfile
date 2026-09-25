# syntax=docker/dockerfile:1.7
# Multi-stage build for the Nokhba platform (Next.js standalone output).
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time placeholders; real values are injected at runtime.
ENV DATABASE_URL="postgresql://postgres:postgres@db:5432/nokhba?schema=public" \
    AUTH_SECRET="build-time-placeholder" \
    AUTH_URL="http://localhost:3000"
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN apk add --no-cache openssl && addgroup -S nokhba && adduser -S nokhba -G nokhba
COPY --from=build --chown=nokhba:nokhba /app/.next/standalone ./
COPY --from=build --chown=nokhba:nokhba /app/.next/static ./.next/static
COPY --from=build --chown=nokhba:nokhba /app/public ./public
COPY --from=build --chown=nokhba:nokhba /app/messages ./messages
COPY --from=build --chown=nokhba:nokhba /app/prisma ./prisma
COPY --from=build --chown=nokhba:nokhba /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=nokhba:nokhba /app/node_modules/prisma ./node_modules/prisma
COPY --from=build --chown=nokhba:nokhba /app/node_modules/@prisma ./node_modules/@prisma
RUN mkdir -p storage && chown nokhba:nokhba storage
USER nokhba
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
