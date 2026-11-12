import { desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  notifications,
  paymentEvents,
  payments,
  type NotificationRow,
  type PaymentEventRow,
  type PaymentRow,
} from "@/db/schema";
import {
  isValidPhone,
  looksLikePhone,
  resolveRecipient,
} from "@/lib/contacts";
import { parseAmountToCents } from "@/lib/format";
import { simulationLabel } from "@/lib/simulation";
import {
  claimTransition,
  completePayment,
  failPayment,
  recordEvent,
} from "@/lib/payments/lifecycle";
import {
  SCENARIOS,
  simulatedProvider,
  type ProviderScenario,
} from "@/lib/payments/provider";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const MIN_TIMEOUT_MS = 3_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_AMOUNT_CENTS = 10_000_000; // ₹1,00,000 per payment in this prototype

export interface CreatePaymentInput {
  /** A contact name or a phone number — both are accepted. */
  recipient: string;
  amount: string; // rupees, e.g. "249.50"
  note?: string;
  scenario?: string;
  timeoutMs?: number;
  idempotencyKey: string;
  /** Short device-connection label ("Weak 2G") when the scenario was
   *  auto-selected from the sender's detected network. */
  networkLabel?: string;
}

function validateInput(input: CreatePaymentInput) {
  const typed = input.recipient?.trim() ?? "";
  if (typed.length > 80) {
    throw new ValidationError("Recipient must be 80 characters or fewer.");
  }
  // The recipient column accepts a contact name OR a phone number; resolve
  // whichever was typed into a display name + (optional) number.
  if (looksLikePhone(typed) && !isValidPhone(typed)) {
    throw new ValidationError(
      "Enter a valid 10-digit mobile number (starting 6-9).",
    );
  }
  const resolved = resolveRecipient(typed);
  if (!resolved) {
    throw new ValidationError(
      "Enter a recipient name (2+ characters) or a 10-digit mobile number.",
    );
  }
  const recipient = resolved.name;
  const recipientPhone = resolved.phone;
  const amountCents = parseAmountToCents(input.amount ?? "");
  if (amountCents === null || amountCents > MAX_AMOUNT_CENTS) {
    throw new ValidationError("Enter an amount between ₹0.01 and ₹1,00,000.");
  }
  const note = (input.note ?? "").trim().slice(0, 140);
  const scenario = (
    SCENARIOS.includes(input.scenario as ProviderScenario)
      ? input.scenario
      : "auto"
  ) as ProviderScenario;
  const timeoutMs = Math.min(
    MAX_TIMEOUT_MS,
    Math.max(MIN_TIMEOUT_MS, Math.round(input.timeoutMs ?? 10_000)),
  );
  const networkLabel = (input.networkLabel ?? "").trim().slice(0, 80) || null;
  if (!input.idempotencyKey || input.idempotencyKey.length > 100) {
    throw new ValidationError("A valid idempotency key is required.");
  }
  return {
    recipient,
    recipientPhone,
    amountCents,
    note,
    scenario,
    timeoutMs,
    networkLabel,
    idempotencyKey: input.idempotencyKey,
  };
}

export interface CreatePaymentResult {
  payment: PaymentRow;
  /** true when the idempotency key matched an existing payment (no-op). */
  reused: boolean;
}

/**
 * Idempotent payment creation + provider handoff.
 *
 * The unique idempotencyKey makes POSTs safely retryable: a duplicate submit
 * (double click, network retry) returns the original payment instead of
 * charging twice. Only the first writer drives the provider authorization.
 */
export async function createPayment(
  raw: CreatePaymentInput,
): Promise<CreatePaymentResult> {
  const input = validateInput(raw);
  const now = new Date();

  const inserted = await db
    .insert(payments)
    .values({
      idempotencyKey: input.idempotencyKey,
      recipient: input.recipient,
      recipientPhone: input.recipientPhone,
      amountCents: input.amountCents,
      note: input.note,
      scenario: input.scenario,
      networkLabel: input.networkLabel,
      timeoutMs: input.timeoutMs,
      state: "initiated",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: payments.idempotencyKey })
    .returning();

  if (inserted.length === 0) {
    const existing = await db
      .select()
      .from(payments)
      .where(eq(payments.idempotencyKey, input.idempotencyKey));
    const payment = existing[0];
    if (!payment) throw new Error("Idempotency conflict resolution failed");
    return { payment, reused: true };
  }

  const payment = inserted[0];
  await recordEvent({
    paymentId: payment.id,
    fromState: null,
    toState: "initiated",
    title: "Payment initiated",
    note: `Created with a ${Math.round(input.timeoutMs / 1000)}s auto-refund window.`,
    at: now,
  });

  // When the scenario was auto-selected from the sender's connectivity, leave
  // a trace of that decision in the timeline.
  if (input.networkLabel) {
    await recordEvent({
      paymentId: payment.id,
      kind: "annotation",
      title: "Device network detected",
      note: `${input.networkLabel} — auto-selected the "${simulationLabel(
        input.scenario,
      )}" simulation.`,
      at: now,
    });
  }

  let providerRef: string;
  try {
    ({ providerRef } = simulatedProvider.authorize(
      {
        paymentId: payment.id,
        amountCents: payment.amountCents,
        timeoutMs: payment.timeoutMs,
        scenario: payment.scenario as ProviderScenario,
      },
      {
        onSettle: (id) =>
          completePayment(id).catch((e) =>
            console.error("[provider] settle failed:", e),
          ),
        onReject: (id, reason) =>
          failPayment(id, reason).catch((e) =>
            console.error("[provider] reject failed:", e),
          ),
      },
    ));
  } catch (err) {
    await failPayment(payment.id, String(err));
    throw err;
  }

  // The provider accepted the payment (synchronously, like an ack); move to
  // pending and persist its reference. A timeout refund can legally win
  // before this claims — in that case the claim simply no-ops.
  await claimTransition(payment.id, "pending", { providerRef });

  const freshRows = await db
    .select()
    .from(payments)
    .where(eq(payments.id, payment.id));
  return { payment: freshRows[0], reused: false };
}

export async function listPayments(limit = 100): Promise<PaymentRow[]> {
  return db
    .select()
    .from(payments)
    .orderBy(desc(payments.createdAt))
    .limit(limit);
}

export interface PaymentSummary {
  inFlight: number;
  completed: number;
  failed: number;
  refunded: number;
  refundedCents: number;
}

export async function summarize(): Promise<PaymentSummary> {
  const rows = await db
    .select({ state: payments.state, amountCents: payments.amountCents })
    .from(payments);
  const summary: PaymentSummary = {
    inFlight: 0,
    completed: 0,
    failed: 0,
    refunded: 0,
    refundedCents: 0,
  };
  for (const row of rows) {
    if (row.state === "initiated" || row.state === "pending")
      summary.inFlight++;
    else if (row.state === "completed") summary.completed++;
    else if (row.state === "failed") summary.failed++;
    else if (row.state === "refunded") {
      summary.refunded++;
      summary.refundedCents += row.amountCents;
    }
  }
  return summary;
}

export async function paymentDetail(id: string): Promise<{
  payment: PaymentRow;
  events: PaymentEventRow[];
} | null> {
  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.id, id));
  const payment = paymentRows[0];
  if (!payment) return null;
  const events = await db
    .select()
    .from(paymentEvents)
    .where(eq(paymentEvents.paymentId, id))
    .orderBy(paymentEvents.createdAt);
  return { payment, events };
}

export async function listNotifications(limit = 25): Promise<{
  items: NotificationRow[];
  unread: number;
}> {
  const items = await db
    .select()
    .from(notifications)
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  const unreadRows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(isNull(notifications.readAt));
  return { items, unread: unreadRows.length };
}

export async function markAllNotificationsRead(): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(isNull(notifications.readAt))
    .returning({ id: notifications.id });
  return rows.length;
}
