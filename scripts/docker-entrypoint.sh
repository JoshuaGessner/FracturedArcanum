#!/bin/sh
set -eu

APP_DATA_DIR="${DATA_DIR:-/app/data}"

mkdir -p "$APP_DATA_DIR"

if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$APP_DATA_DIR" 2>/dev/null || true
  chmod 775 "$APP_DATA_DIR" 2>/dev/null || true

  if command -v su-exec >/dev/null 2>&1; then
    exec su-exec node "$@"
  fi
fi

exec "$@"
