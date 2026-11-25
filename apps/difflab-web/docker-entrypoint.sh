#!/usr/bin/env sh
set -eu

case "${1:-web}" in
  migrate)
    exec bun run --cwd /app/libs/difflab-db migrate
    ;;
  web)
    bun -e "import { DifflabDb } from '/app/libs/difflab-db/src/index.ts'; const db = await DifflabDb.open({ mode: 'cloud' }); await db.close();"
    exec bun /app/apps/difflab-web/build/index.js
    ;;
  *)
    exec "$@"
    ;;
esac
