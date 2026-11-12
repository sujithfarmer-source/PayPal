#!/usr/bin/env bash
# GoPay — one-command local setup (macOS / Linux / Git Bash on Windows).
# Brings up Postgres, installs deps, creates the tables, starts the app.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> GoPay setup"

# --- 1. Node.js -------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js not found. Install Node 20+ from https://nodejs.org and re-run."
  exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERROR: Node $(node -v) found, but GoPay needs Node 20+."
  exit 1
fi
echo "    Node $(node -v) ✓"

# --- 2. PostgreSQL ----------------------------------------------------------
# Fast path: Docker. Fallback: an already-installed local Postgres.
if command -v docker >/dev/null 2>&1; then
  if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker is installed but not running. Start Docker Desktop and re-run."
    exit 1
  fi
  if [ "$(docker ps -q -f name=gopay-pg)" = "" ]; then
    if [ "$(docker ps -aq -f name=gopay-pg)" != "" ]; then
      echo "    Starting existing Postgres container (gopay-pg)…"
      docker start gopay-pg >/dev/null
    else
      echo "    Pulling & starting Postgres 16 in Docker (gopay-pg)…"
      docker run -d --name gopay-pg \
        -e POSTGRES_USER=postgres \
        -e POSTGRES_PASSWORD=postgres \
        -e POSTGRES_DB=app_db \
        -p 5432:5432 postgres:16 >/dev/null
    fi
  fi
  echo -n "    Waiting for Postgres"
  until docker exec gopay-pg pg_isready -U postgres >/dev/null 2>&1; do
    echo -n "."; sleep 1
  done
  echo " ready ✓"
elif command -v pg_isready >/dev/null 2>&1 && pg_isready -d postgres -h 127.0.0.1 -q; then
  echo "    Local Postgres detected ✓"
  if command -v psql >/dev/null 2>&1; then
    psql postgresql://postgres:postgres@127.0.0.1:5432/postgres \
      -tc "SELECT 1 FROM pg_database WHERE datname='app_db'" 2>/dev/null \
      | grep -q 1 \
      || psql postgresql://postgres:postgres@127.0.0.1:5432/postgres \
        -c "CREATE DATABASE app_db" >/dev/null
  fi
else
  echo "ERROR: no Docker and no local Postgres found."
  echo "       Install Docker Desktop (https://docker.com) or Postgres, or export"
  echo "       your own DATABASE_URL in .env, then re-run."
  exit 1
fi

# --- 3. Env + deps + schema --------------------------------------------------
[ -f .env ] || cp .env.example .env
echo "    .env ✓"

echo "    Installing dependencies…"
npm install --no-audit --no-fund

echo "    Creating database tables…"
npx drizzle-kit push --force

# --- 4. Run ------------------------------------------------------------------
echo ""
echo "==> Starting GoPay at http://localhost:3000"
echo "    (Ctrl+C to stop)"
npm run dev
