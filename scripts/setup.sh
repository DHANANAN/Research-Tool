#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

research_require_command cargo
research_require_command rustc
research_require_command node
research_require_command npm
research_require_command pdftotext

node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Use Node.js 22 LTS or newer; deployments are pinned to Node.js 22."); process.exit(1); }'

npm ci --include=dev
npm run build
cargo build --locked
printf 'Setup complete. Run ./scripts/start.sh from this checkout.\n'
