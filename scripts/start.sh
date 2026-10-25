#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

if [[ ! -x target/debug/research-tool || ! -f dist/index.html ]]; then
  printf 'Application build is missing. Run ./scripts/setup.sh first.\n' >&2
  exit 1
fi
research_require_command pdftotext
research_initialize_local
printf 'Starting Research-Tool. Existing database accounts are preserved.\n'
if [[ -f "$RESEARCH_REPO_ROOT/.local/admin-password" ]]; then
  printf 'Initial administrator ID: %s. Initial password file: .local/admin-password\n' "$RESEARCH_ADMIN_ID"
fi
exec "$RESEARCH_REPO_ROOT/target/debug/research-tool"
