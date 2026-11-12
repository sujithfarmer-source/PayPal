# Running GoPay in Antigravity

## Prerequisites (one time)

- **Node.js 20+** — https://nodejs.org
- **Docker Desktop** — https://docker.com (used to spin up a local Postgres;
  no account needed). If you already have Postgres running locally at
  `127.0.0.1:5432` with user/password `postgres`/`postgres`, Docker is
  optional.

## Steps

1. Extract `gopay-app.tar.gz` somewhere, e.g.
   `tar -xzf gopay-app.tar.gz -C gopay` (or right-click → Extract on
   macOS/Windows).
2. In Antigravity: **File → Open Folder…** and pick the extracted folder.
3. Open the integrated terminal and run **one command**:

   - macOS / Linux:  `./run.sh`
   - Windows:        `.\run.ps1`

   The script starts Postgres (Docker), installs dependencies, creates the
   tables, and launches the app.
4. Open **http://localhost:3000**.

## Try the headline trick

**New payment → Send.** The simulation always matches your actual connection
(weak 2G / 3G / 4G / offline) — the dialog shows a read-only card with what
was detected and what will happen. On a poor network the payment stalls and
refunds itself after 10s: watch the countdown, the Refunded badge, and the
bell notification.

To simulate a bad network: Chrome DevTools → Network → throttling (e.g. "Slow
3G") — the chip in the header, the banner, and the dialog all react.

## Tests

```bash
npx vitest run
```

24 tests covering the state machine, the 10s timeout sweep, refund
idempotency, the late-completion race (25 randomized races), idempotent
creation, INR formatting, and the network-detection annotation.

## Notes for the agent in Antigravity

- Stack: Next.js 16 (App Router) + React 19, PostgreSQL + Drizzle ORM,
  Tailwind v4, Vitest. Entry point `src/app/page.tsx`; domain logic in
  `src/lib/payments/`; see README.md for the module map.
- Database migrations are push-based: `npx drizzle-kit push --force`.
- Currency is INR; amounts are integer paise (`amount_cents` column).
- The timeout monitor starts with the server via `src/instrumentation.ts`.
