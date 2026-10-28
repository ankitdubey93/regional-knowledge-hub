#!/usr/bin/env bash
# Development start-up: Postgres in Docker, then the API (server/) and the web app (client/) on the host.
#
#   ./dev.sh            start everything (Ctrl+C stops the API and the web app; the database keeps running)
#   ./dev.sh --no-seed  skip the knowledge-base seeds
#   ./dev.sh down       stop the database container
#
# Ports: web http://localhost:5190, API http://localhost:5191, Postgres localhost:5437.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\033[1;36m[dev]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[dev]\033[0m %s\n' "$*" >&2; exit 1; }

if [[ "${1:-}" == "down" ]]; then
  docker compose stop
  exit 0
fi
SEED=1
[[ "${1:-}" == "--no-seed" ]] && SEED=0

command -v docker >/dev/null || die "docker is not installed"
docker info >/dev/null 2>&1 || die "docker is not running"
command -v node >/dev/null || die "node is not installed (needs 22 or later)"
(( $(node -p 'process.versions.node.split(".")[0]') >= 22 )) || die "node $(node -v) is too old (needs 22 or later)"

for port in 5190 5191; do
  if (echo >"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    die "port $port is already in use (another dev server running?)"
  fi
done

# A fresh checkout gets a .env with its two secrets generated. Secrets are never printed.
if [[ ! -f .env ]]; then
  command -v openssl >/dev/null || die "openssl is needed to generate secrets in .env"
  cp .env.example .env
  for name in BETTER_AUTH_SECRET DATA_ENCRYPTION_KEY; do
    sed -i.bak "s|^${name}=\$|${name}=$(openssl rand -base64 32)|" .env
  done
  rm -f .env.bak
  say "created .env from .env.example with generated secrets (AI keys are empty, so chat is off)"
fi

if [[ ! -d node_modules || package-lock.json -nt node_modules/.package-lock.json ]]; then
  say "installing dependencies"
  npm install
fi

say "starting Postgres (docker compose)"
docker compose up -d --wait db

say "applying migrations"
npm run --silent db:migrate -w server

if (( SEED )); then
  say "seeding facts and curriculum (unchanged rows are skipped)"
  npm run --silent kb:seed-facts -w server
  npm run --silent kb:seed-curriculum -w server
fi

# Both dev servers run in this process group, so one kill stops them together.
trap 'trap - EXIT INT TERM; say "stopping API and web"; kill 0 2>/dev/null; wait 2>/dev/null' EXIT INT TERM

say "API http://localhost:5191  ·  web http://localhost:5190  ·  Ctrl+C to stop"
npm run --silent dev -w server 2>&1 | sed -u 's/^/[api] /' &
npm run --silent dev -w client 2>&1 | sed -u 's/^/[web] /' &

# If either one exits, stop the other.
wait -n
