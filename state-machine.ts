/**
 * Payment state machine — pure logic, no I/O.
 *
 * States: initiated -> pending -> completed | failed | refunded
 *
 * `refunded` is reachable from any non-terminal state:
 *  - from initiated/pending via the automatic timeout refund, and
 *  - from completed via a manual-style refund.
 * `failed` and `refunded` are terminal.
 */
export const PAYMENT_STATES = [
  "initiated",
  "pending",
  "completed",
  "failed",
  "refunded",
] as const;

export type PaymentState = (typeof PAYMENT_STATES)[number];

const TRANSITIONS: Record<PaymentState, readonly PaymentState[]> = {
  initiated: ["pending", "completed", "failed", "refunded"],
  pending: ["completed", "failed", "refunded"],
  completed: ["refunded"],
  failed: [],
  refunded: [],
};

export const TERMINAL_STATES: readonly PaymentState[] = ["failed", "refunded"];

/** States in which a payment is still waiting on the provider. */
export const IN_FLIGHT_STATES: readonly PaymentState[] = [
  "initiated",
  "pending",
];

export class IllegalTransitionError extends Error {
  constructor(from: PaymentState, to: PaymentState) {
    super(`Illegal payment transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function canTransition(from: PaymentState, to: PaymentState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: PaymentState, to: PaymentState): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}

export function isTerminal(state: PaymentState): boolean {
  return TERMINAL_STATES.includes(state);
}

/** Deadline after which the timeout monitor considers a payment stalled. */
export function deadlineOf(payment: {
  createdAt: Date;
  timeoutMs: number;
}): number {
  return payment.createdAt.getTime() + payment.timeoutMs;
}

export function isOverdue(
  payment: { state: PaymentState; createdAt: Date; timeoutMs: number },
  nowMs: number,
): boolean {
  if (!IN_FLIGHT_STATES.includes(payment.state)) return false;
  return deadlineOf(payment) <= nowMs;
}

/** Human-friendly titles used for transition events in the timeline. */
export function transitionTitle(to: PaymentState): string {
  switch (to) {
    case "initiated":
      return "Payment initiated";
    case "pending":
      return "With the provider — awaiting settlement";
    case "completed":
      return "Payment completed";
    case "failed":
      return "Payment failed";
    case "refunded":
      return "Refund issued";
  }
}
