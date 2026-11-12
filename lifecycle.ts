import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  paymentEvents,
  payments,
  notifications,
  type PaymentEventRow,
  type PaymentRow,
} from "@/db/schema";
import {
  canTransition,
  transitionTitle,
  type PaymentState,
} from "@/lib/payments/state-machine";

export async function getPayment(id: string): Promise<PaymentRow | null> {
  const rows = await db.select().from(payments).where(eq(payments.id, id));
  return rows[0] ?? null;
}

export async function recordEvent(args: {
  paymentId: string;
  kind?: "transition" | "annotation";
  fromState?: PaymentState | null;
  toState?: PaymentState | null;
  title: string;
  note?: string;
  at?: Date;
}): Promise<PaymentEventRow> {
  const rows = await db
    .insert(paymentEvents)
    .values({
      paymentId: args.paymentId,
      kind: args.kind ?? "transition",
      fromState: args.fromState ?? null,
      toState: args.toState ?? null,
      title: args.title,
      note: args.note ?? "",
      ...(args.at ? { createdAt: args.at } : {}),
    })
    .returning();
  return rows[0];
}

export async function annotate(
  paymentId: string,
  title: string,
  note = "",
): Promise<void> {
  await recordEvent({ paymentId, kind: "annotation", title, note });
}

export async function createNotification(args: {
  paymentId: string;
  kind: string;
  message: string;
}): Promise<void> {
  await db.insert(notifications).values({
    paymentId: args.paymentId,
    kind: args.kind,
    message: args.message,
  });
}

export type ClaimResult =
  | { applied: true; from: PaymentState }
  | { applied: false; from: PaymentState };

/**
 * Atomically move a payment into `to`.
 *
 * Read-then-conditional-UPDATE: the UPDATE only matches while the row is
 * still in the state we read (`WHERE state = <seen>`). If two actors race
 * (e.g. the provider settling vs. the refund service), exactly one UPDATE
 * affects a row; the loser re-reads, observes the new state, and — because
 * the state machine forbids e.g. refunded -> completed — backs off instead
 * of overwriting. This is what makes refund/completion races safe.
 */
export async function claimTransition(
  paymentId: string,
  to: PaymentState,
  extraSet: Partial<{
    delayedAt: Date;
    refundedAt: Date;
    providerRef: string;
  }> = {},
  opts: { allowedFrom?: readonly PaymentState[] } = {},
): Promise<ClaimResult> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await getPayment(paymentId);
    if (!current) throw new Error(`Payment ${paymentId} not found`);
    // allowedFrom lets a caller narrow the machine's transition table: e.g.
    // the AUTO-refund may only claim in-flight payments — refunding a payment
    // that just settled would debit the recipient, which is exactly the
    // timeout race this system must prevent.
    if (
      !canTransition(current.state, to) ||
      (opts.allowedFrom && !opts.allowedFrom.includes(current.state))
    ) {
      return { applied: false, from: current.state };
    }
    const now = new Date();
    const rows = await db
      .update(payments)
      .set({ state: to, updatedAt: now, ...extraSet })
      .where(and(eq(payments.id, paymentId), eq(payments.state, current.state)))
      .returning({ id: payments.id });
    if (rows.length === 1) {
      await recordEvent({
        paymentId,
        fromState: current.state,
        toState: to,
        title: transitionTitle(to),
        at: now,
      });
      return { applied: true, from: current.state };
    }
    // Lost the race to a concurrent writer on this row: loop and re-read.
  }
  const last = await getPayment(paymentId);
  return { applied: false, from: last?.state ?? "failed" };
}

/** Provider reported success — settle the payment, unless it was refunded. */
export async function completePayment(
  paymentId: string,
  note = "Provider settled the funds",
): Promise<ClaimResult> {
  const claim = await claimTransition(paymentId, "completed");
  if (claim.applied) return claim;
  if (claim.from === "refunded") {
    // The money was already returned to the sender; the provider voids this
    // late settlement instead of double-routing funds.
    await annotate(
      paymentId,
      "Late settlement voided",
      "The provider settled after the auto-refund, so the credit was voided. Race handled safely.",
    );
  }
  return claim;
}

/** Provider reported failure (insufficient funds, network error, ...). */
export async function failPayment(
  paymentId: string,
  reason: string,
): Promise<ClaimResult> {
  const claim = await claimTransition(paymentId, "failed");
  if (claim.applied) {
    await annotate(paymentId, "Failure reason", reason);
  }
  return claim;
}
