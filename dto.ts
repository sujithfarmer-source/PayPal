import type {
  NotificationRow,
  PaymentEventRow,
  PaymentRow,
} from "@/db/schema";
import { deadlineOf } from "@/lib/payments/state-machine";

/** Wire shapes for the API (dates serialized as ISO strings). */

export function paymentToDto(p: PaymentRow) {
  return {
    id: p.id,
    recipient: p.recipient,
    recipientPhone: p.recipientPhone,
    amountCents: p.amountCents,
    currency: p.currency,
    note: p.note,
    scenario: p.scenario,
    networkLabel: p.networkLabel,
    state: p.state,
    delayedAt: p.delayedAt?.toISOString() ?? null,
    refundedAt: p.refundedAt?.toISOString() ?? null,
    timeoutMs: p.timeoutMs,
    deadlineAt: new Date(deadlineOf(p)).toISOString(),
    providerRef: p.providerRef,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function eventToDto(e: PaymentEventRow) {
  return {
    id: e.id,
    kind: e.kind,
    fromState: e.fromState,
    toState: e.toState,
    title: e.title,
    note: e.note,
    createdAt: e.createdAt.toISOString(),
  };
}

export function notificationToDto(n: NotificationRow) {
  return {
    id: n.id,
    paymentId: n.paymentId,
    kind: n.kind,
    message: n.message,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  };
}
