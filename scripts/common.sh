#!/usr/bin/env bash
# Shared local-development initialization. Source this file; do not execute it.
set -euo pipefail

RESEARCH_REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RESEARCH_REPO_ROOT"

# Keep package-manager writes inside the checkout's ignored local state. Cloud
# sandboxes may allow reading a home directory without allowing cache writes.
export npm_config_cache="${npm_config_cache:-${NPM_CONFIG_CACHE:-$RESEARCH_REPO_ROOT/.local/npm-cache}}"

# Codex cloud may retain the toolchain outside the checkout. Ordinary local
# Rust installations continue to use their existing PATH and rustup settings.
if ! command -v cargo >/dev/null 2>&1 && [[ -x /workspace/.toolchains/cargo/bin/cargo ]]; then
  export CARGO_HOME="${CARGO_HOME:-/workspace/.toolchains/cargo}"
  export RUSTUP_HOME="${RUSTUP_HOME:-/workspace/.toolchains/rustup}"
  export PATH="$CARGO_HOME/bin:$PATH"
fi

research_require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing prerequisite: %s. See docs/development.md.\n' "$1" >&2
    return 1
  fi
}

research_database_needs_bootstrap() {
  if [[ ! -s "$RESEARCH_DB_PATH" ]]; then
    return 0
  fi
  # A failed first start may already have created the schema. Distinguish that
  # case from an existing account instead of using file size as an account test.
  research_require_command python3
  python3 - "$RESEARCH_DB_PATH" <<'PY'
from pathlib import Path
import sqlite3
import sys

try:
    connection = sqlite3.connect(Path(sys.argv[1]).resolve().as_uri() + "?mode=ro", uri=True)
    with connection:
        count = connection.execute("SELECT count(*) FROM users").fetchone()[0]
    connection.close()
except sqlite3.Error:
    # Never replace or reset state when its contents cannot be inspected.
    raise SystemExit(1)
raise SystemExit(0 if count == 0 else 1)
PY
}

research_initialize_local() {
  umask 077
  mkdir -p "$RESEARCH_REPO_ROOT/.local"
  export RESEARCH_DB_PATH="${RESEARCH_DB_PATH:-$RESEARCH_REPO_ROOT/.local/research.sqlite3}"
  export RESEARCH_ADMIN_ID="${RESEARCH_ADMIN_ID:-admin}"
  export RESEARCH_ADMIN_NAME="${RESEARCH_ADMIN_NAME:-Research administrator}"

  if [[ -z "${RESEARCH_ADMIN_PASSWORD:-}" ]]; then
    if [[ -f "$RESEARCH_REPO_ROOT/.local/admin-password" ]]; then
      export RESEARCH_ADMIN_PASSWORD
      RESEARCH_ADMIN_PASSWORD="$(cat "$RESEARCH_REPO_ROOT/.local/admin-password")"
    elif research_database_needs_bootstrap; then
      research_require_command python3
      python3 - "$RESEARCH_REPO_ROOT/.local/admin-password" <<'PY'
import os
from pathlib import Path
import secrets
import sys

path = Path(sys.argv[1])
fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as stream:
    stream.write(secrets.token_urlsafe(24) + "\n")
PY
      export RESEARCH_ADMIN_PASSWORD
      RESEARCH_ADMIN_PASSWORD="$(cat "$RESEARCH_REPO_ROOT/.local/admin-password")"
      printf 'Created the initial administrator password in %s/.local/admin-password (private file).\n' "$RESEARCH_REPO_ROOT"
    fi
  fi
}
