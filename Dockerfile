# syntax=docker/dockerfile:1

# Multi-stage, pinned to the Node major the app is developed against. Alpine for
# size; the one thing it needs adding is libc6-compat, without which Prisma's
# engine binaries fail to load against musl.
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ---- deps -------------------------------------------------------------------
# Separate stage so a dependency install is only redone when the lockfile
# changes, not on every source edit.
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# `npm ci --ignore-scripts` then an explicit generate: postinstall runs
# `prisma generate`, which would otherwise fire before the schema is guaranteed
# present and fail confusingly.
RUN npm ci --ignore-scripts && npx prisma generate

# ---- builder ----------------------------------------------------------------
# Also the image Compose uses for migrations and seeding: those need the Prisma
# CLI and tsx, which are devDependencies and deliberately absent from the runtime
# image. Running them from the stage that already has them beats bloating the
# runner with tools it uses once.
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ---- runner -----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Non-root. The standalone server needs nothing writable, so there is no reason
# to hand it root.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
# Standalone emits a minimal server plus only the traced dependencies. It
# deliberately does not copy `public` or `.next/static`, so both are copied
# explicitly — omitting them yields an app that boots and renders unstyled.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
