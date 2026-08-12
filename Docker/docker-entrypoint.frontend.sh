#!/bin/sh
set -e

# Ensure /app/storage exists and is owned by runtime user nextjs (1001:65533)
mkdir -p /app/storage
chown -R 1001:65533 /app/storage 2>/dev/null || true
chmod 755 /app/storage 2>/dev/null || true

# Drop root privileges and execute command as user nextjs (UID 1001, GID 65533)
if [ "$(id -u)" = '0' ]; then
  exec su-exec nextjs "$@"
else
  exec "$@"
fi
