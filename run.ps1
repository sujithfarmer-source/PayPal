# GoPay — one-command local setup for Windows (PowerShell).
# In Antigravity's terminal:  .\run.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "==> GoPay setup"

# --- 1. Node.js ------------------------------------------------------------
try { $nodeVersion = (node -v) } catch {
  Write-Host "ERROR: Node.js not found. Install Node 20+ from https://nodejs.org and re-run." -ForegroundColor Red
  exit 1
}
if ([int]($nodeVersion.TrimStart("v").Split(".")[0]) -lt 20) {
  Write-Host "ERROR: Node $nodeVersion found, but GoPay needs Node 20+." -ForegroundColor Red
  exit 1
}
Write-Host "    Node $nodeVersion OK"

# --- 2. PostgreSQL (via Docker) ---------------------------------------------
try { docker info | Out-Null } catch {
  Write-Host "ERROR: Docker Desktop is not running (or not installed)." -ForegroundColor Red
  Write-Host "       Start Docker Desktop, or install Postgres and set DATABASE_URL in .env." -ForegroundColor Red
  exit 1
}
$running = docker ps -q -f name=gopay-pg
if (-not $running) {
  $existing = docker ps -aq -f name=gopay-pg
  if ($existing) {
    Write-Host "    Starting existing Postgres container (gopay-pg)..."
    docker start gopay-pg | Out-Null
  } else {
    Write-Host "    Pulling & starting Postgres 16 in Docker (gopay-pg)..."
    docker run -d --name gopay-pg `
      -e POSTGRES_USER=postgres `
      -e POSTGRES_PASSWORD=postgres `
      -e POSTGRES_DB=app_db `
      -p 5432:5432 postgres:16 | Out-Null
  }
}
Write-Host -NoNewline "    Waiting for Postgres"
do { Start-Sleep -Seconds 1; Write-Host -NoNewline "." }
until (docker exec gopay-pg pg_isready -U postgres | Select-String "accepting connections")
Write-Host " ready"

# --- 3. Env + deps + schema --------------------------------------------------
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
Write-Host "    .env OK"

Write-Host "    Installing dependencies..."
npm install --no-audit --no-fund

Write-Host "    Creating database tables..."
npx drizzle-kit push --force

# --- 4. Run ------------------------------------------------------------------
Write-Host ""
Write-Host "==> Starting GoPay at http://localhost:3000 (Ctrl+C to stop)"
npm run dev
