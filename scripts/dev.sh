#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

research_require_command cargo
research_require_command node
research_require_command pdftotext
if [[ ! -d web/node_modules ]]; then
  printf 'Frontend dependencies are missing. Run ./scripts/setup.sh first.\n' >&2
  exit 1
fi
research_initialize_local

# Build before starting; launch the actual binaries so stopping this terminal
# cannot leave an npm/Cargo wrapper's server subprocess behind.
cargo build --locked
"$RESEARCH_REPO_ROOT/target/debug/research-tool" &
research_api_pid=$!
(
  cd "$RESEARCH_REPO_ROOT/web"
  exec node node_modules/vite/bin/vite.js --host 127.0.0.1
) &
research_web_pid=$!
research_stop_children() {
  trap - EXIT INT TERM
  kill "$research_api_pid" "$research_web_pid" 2>/dev/null || true
  wait "$research_api_pid" "$research_web_pid" 2>/dev/null || true
}
trap research_stop_children EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
wait -n "$research_api_pid" "$research_web_pid"
