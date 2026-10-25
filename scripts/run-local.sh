#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
if ! command -v docker >/dev/null || ! docker info >/dev/null 2>&1; then
  printf 'Install and start Docker Desktop (or Docker Engine with Compose), then run this script again.\n' >&2
  exit 1
fi
docker compose -p research-tool-local -f compose.local.yaml up -d --build
url="http://localhost:${RESEARCH_LOCAL_PORT:-3000}"
printf '\nYour local research portal: %s\nCreate an organization to start. Data stays in the local Docker volume.\n' "$url"
if command -v curl >/dev/null; then
  for attempt in {1..30}; do
    if curl --fail --silent "$url/api/ready" >/dev/null; then
      if command -v xdg-open >/dev/null; then xdg-open "$url" >/dev/null 2>&1 || true
      elif command -v open >/dev/null; then open "$url" || true
      fi
      exit 0
    fi
    sleep 1
  done
  printf 'Server did not become ready. Inspect: docker compose -p research-tool-local -f compose.local.yaml logs app\n' >&2
  exit 1
fi
