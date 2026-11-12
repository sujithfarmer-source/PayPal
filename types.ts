/** API wire types shared by the client components. */

export type PaymentState =
  | "initiated"
  | "pending"
  | "completed"
  | "failed"
  | "refunded";

export interface PaymentDto {
  id: string;
  recipient: string;
  recipientPhone: string | null;
  amountCents: number;
  currency: string;
  note: string;
  scenario: string;
  networkLabel: string | null;
  state: PaymentState;
  delayedAt: string | null;
  refundedAt: string | null;
  timeoutMs: number;
  deadlineAt: string;
  providerRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentSummaryDto {
  inFlight: number;
  completed: number;
  failed: number;
  refunded: number;
  refundedCents: number;
}

export interface PaymentEventDto {
  id: string;
  kind: "transition" | "annotation" | string;
  fromState: PaymentState | null;
  toState: PaymentState | null;
  title: string;
  note: string;
  createdAt: string;
}

export interface NotificationDto {
  id: string;
  paymentId: string;
  kind: string;
  message: string;
  read: boolean;
  createdAt: string;
}
