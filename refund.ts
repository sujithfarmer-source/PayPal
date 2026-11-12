import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { payments, refundLedger } from "@/db/schema";
import { formatMoney } from "@/lib/format";
import {
  annotate,
  claimTransition,
  createNotification,
  getPayment,
} from "@/lib/payments/lifecycle";
import { simulatedProvider as defaultProvider } from "@/lib/payments/provider";
import { IN_FLIGHT_STATES } from "@/lib/payments/state-machine";

export type RefundOutcome =
  | "refunded" // this call issued the refund
  | "already-refunded" // idempotent: refund existed, nothing happened
  | "completed-first" // settlement won the race; refund suppressed
  | "not-refundable"; // terminal state that can't be refunded (e.g. failed)

export interface RefundResult {
  outcome: RefundOutcome;
  refundKey: string;
}

/**
 * Deterministic key: one payment can only ever have one refund. This is the
 * backbone of refund idempotency at both the DB and provider levels.
 */
export function refundKeyFor(paymentId: string): string {
  return `payment:${paymentId}:refund`;
}

/**
 * Idempotent auto-refund for a payment that blew its timeout.
 *
 * Safety comes from three stacked guards:
 *  1. claimTransition — atomic `UPDATE ... WHERE state = <in-flight>`; only
 *     one of {refund, completion, failure} can claim the payment.
 *  2. refund_ledger unique refundKey — even if two refunders somehow both
 *     proceed, only the first ledger insert succeeds.
 *  3. provider.credit — dedupes on the same refundKey, so the money movement
 *     itself can never happen twice.
 */
export async function refundForTimeout(
  paymentId: string,
  opts: { now?: Date; provider?: typeof defaultProvider } = {},
): Promise<RefundResult> {
  const provider = opts.provider ?? defaultProvider;
  const now = opts.now ?? new Date();
  const refundKey = refundKeyFor(paymentId);

  const payment = await getPayment(paymentId);
  if (!payment) throw new Error(`Payment ${paymentId} not found`);

  if (payment.state === "refunded") {
    return { outcome: "already-refunded", refundKey };
  }
  if (!IN_FLIGHT_STATES.includes(payment.state)) {
    if (payment.state === "completed") {
      // Settlement committed before the refund could even attempt its claim.
      await annotate(
        paymentId,
        "Refund suppressed",
        "The provider settled first — completion won the race, so no refund was issued.",
      );
      return { outcome: "completed-first", refundKey };
    }
    return { outcome: "not-refundable", refundKey };
  }

  // Step 0: record that the payment was detected as delayed (first writer
  // only, so repeated monitor ticks don't spam the timeline).
  const marked = await db
    .update(payments)
    .set({ delayedAt: now, updatedAt: now })
    .where(
      and(
        eq(payments.id, paymentId),
        isNull(payments.delayedAt),
        inArray(payments.state, ["initiated", "pending"]),
      ),
    )
    .returning({ id: payments.id });
  if (marked.length === 1) {
    await annotate(
      paymentId,
      "Marked delayed",
      `No settlement after ${Math.round(payment.timeoutMs / 1000)}s — triggering the automatic refund.`,
    );
  }

  // Step 1: atomic claim — only from in-flight states. If the provider
  // settled at the same instant, claim.from === "completed" and the refund
  // is suppressed: auto-refunding a settled payment would debit the
  // recipient, which is what this guard exists to prevent.
  const claim = await claimTransition(
    paymentId,
    "refunded",
    { refundedAt: now },
    { allowedFrom: IN_FLIGHT_STATES },
  );
  if (!claim.applied) {
    if (claim.from === "completed") {
      await annotate(
        paymentId,
        "Refund suppressed",
        "The provider settled at the deadline — completion won the race, so no refund was issued.",
      );
      return { outcome: "completed-first", refundKey };
    }
    if (claim.from === "refunded") {
      return { outcome: "already-refunded", refundKey };
    }
    return { outcome: "not-refundable", refundKey };
  }

  // We won the claim: retract any pending settlement *before* moving money.
  provider.voidAuthorization(paymentId);

  // Step 2+3: durable refund record, then idempotent provider credit.
  const ledgerRows = await db
    .insert(refundLedger)
    .values({ refundKey, paymentId, amountCents: payment.amountCents })
    .onConflictDoNothing({ target: refundLedger.refundKey })
    .returning();
  const firstWriter = ledgerRows.length === 1;

  if (firstWriter) {
    const { providerRefundId } = provider.credit(refundKey, payment.amountCents);
    await db
      .update(refundLedger)
      .set({ providerRefundId })
      .where(eq(refundLedger.refundKey, refundKey));

    await createNotification({
      paymentId,
      kind: "refund",
      message: `GoPay auto-refund: ${formatMoney(
        payment.amountCents,
      )} to ${payment.recipient} was returned after the payment stalled past its ${Math.round(
        payment.timeoutMs / 1000,
      )}s limit.`,
    });
  }

  return { outcome: "refunded", refundKey };
}
