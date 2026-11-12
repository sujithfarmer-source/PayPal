import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { payments, type PaymentRow } from "@/db/schema";
import {
  refundForTimeout,
  type RefundResult,
} from "@/lib/payments/refund";
import { isOverdue } from "@/lib/payments/state-machine";

/**
 * Timeout monitor. Every tick it finds payments still in flight past their
 * auto-refund window and hands each to the refund service. The refund service
 * claims atomically, so it is safe for any number of monitors (the interval
 * worker, a manual API tick, or a test) to fire at the same time.
 */

export async function findOverdue(nowMs = Date.now()): Promise<PaymentRow[]> {
  // Volume of in-flight payments is small in this prototype; filtering in JS
  // keeps per-row `createdAt + timeoutMs` arithmetic readable.
  const inFlight = await db
    .select()
    .from(payments)
    .where(inArray(payments.state, ["initiated", "pending"]))
    .orderBy(asc(payments.createdAt));
  return inFlight.filter((p) => isOverdue(p, nowMs));
}

export async function processTimeouts(opts: {
  now?: number;
} = {}): Promise<RefundResult[]> {
  const nowMs = opts.now ?? Date.now();
  const overdue = await findOverdue(nowMs);
  const results: RefundResult[] = [];
  for (const payment of overdue) {
    results.push(
      await refundForTimeout(payment.id, { now: new Date(nowMs) }),
    );
  }
  return results;
}

const globalMonitor = globalThis as typeof globalThis & {
  __gopayMonitor?: NodeJS.Timeout;
};

/** Start the background worker exactly once per server process. */
export function startMonitor(intervalMs = 1500): void {
  if (globalMonitor.__gopayMonitor) return;
  globalMonitor.__gopayMonitor = setInterval(() => {
    processTimeouts().catch((err) =>
      console.error("[monitor] tick failed:", err),
    );
  }, intervalMs);
  // Don't keep the Node process alive just for the monitor.
  globalMonitor.__gopayMonitor.unref?.();
}

export function stopMonitor(): void {
  if (globalMonitor.__gopayMonitor) {
    clearInterval(globalMonitor.__gopayMonitor);
    globalMonitor.__gopayMonitor = undefined;
  }
}
