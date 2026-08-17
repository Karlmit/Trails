# syntax=docker/dockerfile:1

# AD-13/Stack: Node.js 24 LTS. Debian slim (not Alpine/musl) so argon2's
# native addon and Prisma's query engine binaries use well-supported
# prebuilds, avoiding musl-specific build/runtime surprises.
FROM node:24-bookworm-slim AS base
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- deps: full install (incl. devDependencies) for the build step -------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: compile the Next.js app -------------------------------------
FROM deps AS builder
COPY . .
# prisma.config.ts resolves DATABASE_URL eagerly even for `generate` (which
# does no DB I/O) -- a placeholder is enough at build time; the real value
# comes from docker-compose.yml at container run time.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate
RUN npm run build

# ---- runner: production image ---------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/next.config.ts ./next.config.ts
# Reuse the client generated in `builder` rather than re-running
# `prisma generate` (which would need another DATABASE_URL placeholder) --
# `.prisma/client` is the only generated output; `@prisma/client`'s static
# package contents already came from this stage's own `npm ci`.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
