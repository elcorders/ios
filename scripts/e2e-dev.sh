#!/usr/bin/env bash
# Runs the ios-dev e2e suite. Local only. The secret key is loaded for the Node-side helpers
# in e2e-dev/ and is stripped from the dev server's environment (see playwright.dev.config.ts).
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE="../ios-admin/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE (DEV_SUPABASE_URL, DEV_PUBLISHABLE_KEY, DEV_SECRET_KEY)" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
exec npx playwright test -c playwright.dev.config.ts "$@"
