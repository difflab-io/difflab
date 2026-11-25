# syntax=docker/dockerfile:1

FROM oven/bun:1.4.2-slim AS builder
WORKDIR /workspace

COPY package.json bunfig.toml ./
COPY apps/difflab-web/package.json apps/difflab-web/package.json
COPY apps/difflab-api/package.json apps/difflab-api/package.json
COPY apps/difflab-cli/package.json apps/difflab-cli/package.json
COPY libs/difflab-client-ts/package.json libs/difflab-client-ts/package.json
COPY libs/difflab-config/package.json libs/difflab-config/package.json
COPY libs/difflab-db/package.json libs/difflab-db/package.json
COPY libs/difflab-db-legacy/package.json libs/difflab-db-legacy/package.json
COPY libs/ui/package.json libs/ui/package.json
COPY libs/utils/package.json libs/utils/package.json

RUN bun install

COPY libs/difflab-config libs/difflab-config
COPY libs/difflab-db libs/difflab-db
COPY libs/difflab-db-legacy libs/difflab-db-legacy
COPY libs/ui libs/ui
COPY libs/utils libs/utils
COPY apps/difflab-web apps/difflab-web

RUN bun run --cwd apps/difflab-web build

FROM oven/bun:1.4.2-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=builder /workspace/package.json ./package.json
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/libs/difflab-config ./libs/difflab-config
COPY --from=builder /workspace/libs/difflab-db ./libs/difflab-db
COPY --from=builder /workspace/libs/difflab-db-legacy ./libs/difflab-db-legacy
COPY --from=builder /workspace/libs/utils ./libs/utils
COPY --from=builder /workspace/apps/difflab-web/package.json ./apps/difflab-web/package.json
COPY --from=builder /workspace/apps/difflab-web/build ./apps/difflab-web/build
COPY apps/difflab-web/docker-entrypoint.sh /usr/local/bin/difflab-web-entrypoint
RUN chmod +x /usr/local/bin/difflab-web-entrypoint

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/difflab-web-entrypoint"]
CMD ["web"]
