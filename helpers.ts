import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  notifications,
  paymentEvents,
  payments,
  refundLedger,
  type NotificationRow,
  type PaymentEventRow,
  type PaymentRow,
} from "@/db/schema";

/** Clean slate between tests. */
export async function resetDb(): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE payments, payment_events, notifications, refund_ledger RESTART IDENTITY CASCADE`,
  );
}

export async function insertPayment(
  overrides: Partial<typeof payments.$inferInsert> = {},
): Promise<PaymentRow> {
  const rows = await db
    .insert(payments)
    .values({
      idempotencyKey: randomUUID(),
      recipient: "Test Recipient",
      amountCents: 2500,
      state: "pending",
      timeoutMs: 5000,
      ...overrides,
    })
    .returning();
  return rows[0];
}

export async function freshPayment(id: string): Promise<PaymentRow> {
  const rows = await db.select().from(payments).where(eq(payments.id, id));
  return rows[0];
}

export async function eventsOf(id: string): Promise<PaymentEventRow[]> {
  return db.select().from(paymentEvents).where(eq(paymentEvents.paymentId, id));
}

export async function ledgerOf(id: string) {
  return db.select().from(refundLedger).where(eq(refundLedger.paymentId, id));
}

export async function notificationsOf(id: string): Promise<NotificationRow[]> {
  return db.select().from(notifications).where(eq(notifications.paymentId, id));
}

export function transitionTargets(events: PaymentEventRow[]): string[] {
  return events
    .filter((e) => e.kind === "transition")
    .map((e) => e.toState ?? "null");
}
