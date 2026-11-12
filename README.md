# GoPay — payments that never get stuck

A working prototype of a smart payment-monitoring system, in the spirit of
Google Pay / PayPal: every transfer is watched, and if it stays pending past a
configurable time limit the system marks it **delayed** and automatically
issues a refund — so money is never stuck in limbo and users never have to
file a ticket.

No real money moves: a simulated payment provider (PSP) acts out network
behavior so the full lifecycle can be demoed and tested offline.

**Connection-aware simulation.** The site sniffs the device's own network
(`navigator.onLine` + the Network Information API, with a `/api/health` ping
probe as fallback) and **auto-selects the matching simulation scenario** —
strong 4G maps to near-instant settlement, weak 2G to the slow lane, offline
to a full stall — and prints contextual messages about it: a live connection
chip in the header, a callout banner on the dashboard, a detection note inside
the send dialog, and a "Device network detected" entry on each payment's
timeline. A manual override picker remains for demoing specific scenarios.

## Stack

- **Next.js 16** (App Router) + React 19 — UI and API routes
- **PostgreSQL** + **Drizzle ORM** — payments, event ledger, notifications, refund ledger
- **Tailwind CSS v4** + lucide-react — PayPal-inspired, white-first UI with a single violet accent
- **Vitest** — unit + integration tests (integration tests run against the real Postgres)

## Run it

```bash
npm install                 # once
npx drizzle-kit push        # create tables in the local Postgres
npm run dev                 # http://localhost:3000
```

The timeout monitor worker starts automatically with the server
(`src/instrumentation.ts`) and sweeps for overdue payments every 1.5s.

## Run the tests

```bash
npx drizzle-kit push        # tables must exist
npx vitest run              # full suite (state machine, timeout, refund, race, idempotency, network detection)
```

## Architecture — separated modules

```
src/lib/payments/
├── state-machine.ts   # pure 5-state machine (initiated/pending/completed/failed/refunded),
│                      # transition guards, overdue detection. Zero I/O.
├── provider.ts        # simulated PSP: authorizations that settle / decline / stall
│                      # on timers, idempotent refund credits keyed by refund key.
├── lifecycle.ts       # atomic state claims + settlement/failure handling.
│                      # claimTransition() does a read-then-conditional-UPDATE
│                      # (WHERE state = <seen>): exactly one racer ever wins a row.
├── refund.ts          # refund service. refundForTimeout() marks delayed, claims the
│                      # refund atomically (in-flight states only), voids the pending
│                      # settlement, then writes one ledger row + one idempotent
│                      # provider credit + a user notification.
├── monitor.ts         # timeout monitor: finds in-flight payments past
│                      # createdAt + timeoutMs and hands them to the refund service.
└── service.ts         # orchestration: idempotent payment creation, provider
                       # handoff, API read models, device-network annotations.

src/lib/network-detect.ts   # client: onLine + Network Information API + health-ping
                            # probe -> quality (offline/weak/moderate/strong) ->
                            # scenario + user-facing message. Singleton subscription.
src/lib/simulation.ts       # scenario labels shared by server + client.

src/app/api/           # /api/payments (list/create), /api/payments/[id] (timeline),
                       # /api/notifications, /api/monitor/tick (manual sweep)
src/components/        # dashboard, transaction list, detail drawer, new-payment
                       # dialog, notifications bell, network chip/banner, status badges
tests/                 # state-machine, timeout, refund, race, idempotency suites
```

## Where the guarantees come from

**Idempotent refunds (never refunded twice).** Three stacked guards:
1. `claimTransition` — conditional `UPDATE ... WHERE state = <in-flight>`;
   only the first claimer affects a row.
2. `refund_ledger.refundKey = payment:<id>:refund` with a **unique/primary key**
   — even a hypothetical double-claimer can't write a second refund record.
3. The provider's `credit()` dedupes on the same key, so the money movement
   itself can't repeat.

**Late-completion race safety.** Settlement and timeout-refund use the *same*
atomic claim primitive, and the auto-refund may only claim **in-flight**
payments (refunding a settled payment would wrongly debit the recipient). If
the provider settles the instant the timeout fires:
- Refund claimed first → the late settlement's claim matches zero rows, it
  re-reads, sees `refunded`, and the state machine forbids
  `refunded → completed`. The settlement is voided; timeline: "Late settlement
  voided".
- Settlement claimed first → the refund claim finds `completed`, backs off
  (`completed-first`), no refund is issued; timeline: "Refund suppressed".

`tests/race.test.ts` runs 25 randomized head-to-head races against a real
database to prove exactly one side ever wins.

**Idempotent creation.** Clients send an `Idempotency-Key`
(`onConflictDoNothing` on a unique column): double-clicks and network retries
return the original payment instead of charging twice.

## Network auto-detection mapping

| Detected connection                     | Scenario picked | Expected UX                                  |
| --------------------------------------- | --------------- | -------------------------------------------- |
| Offline / health endpoint unreachable   | Stalled         | Never settles → auto-refunded at the window  |
| Weak 2G / slow-2G (or ping > 900 ms)    | Slow network    | Settles after the window → refunded first    |
| Moderate 3G (or ping 250–900 ms)        | Realistic mix   | Settles in 1–4s, occasional decline          |
| Strong 4G (or ping < 250 ms)            | Near-instant    | Settles in under a second                     |
| Unmeasurable                            | Realistic mix   | Safe default                                  |

Every detection is printed where it matters: header chip, dashboard banner
(on weak/offline connections), a read-only detection card in the send dialog,
the payment row sub-line, a "Device network detected" timeline entry, and a
"Device network" fact in the detail drawer. There is deliberately **no manual
scenario picker** — the simulation always reflects the device's real
connection state. (The API still accepts an explicit `scenario` for the test
suite and automation.)

Tip: to see the detection change, use your browser devtools' network
throttling (e.g. Chrome DevTools → Network → "Slow 3G") and watch the chip,
banner and dialog messages adapt, then send a payment.
