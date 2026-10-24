#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

research_require_command cargo
research_require_command rustc
research_require_command node
research_require_command npm
research_require_command pdftotext

node -e 'if (Number(process.versions.node.split(".")[0]) < 20) { console.error("Node.js 20 or later is required; Node.js 22 LTS is recommended."); process.exit(1); }'

npm ci --prefix web
npm run build --prefix web
cargo build --locked
printf 'Setup complete. Run ./scripts/start.sh from this checkout.\n'
