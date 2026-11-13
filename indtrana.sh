#!/usr/bin/env sh
# IndTrana one-step control for macOS and Linux: a thin wrapper around aegis.sh (same commands and options).
exec "$(dirname "$0")/aegis.sh" "$@"
