import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The five states a payment can be in. "Delayed" is deliberately NOT a state:
 * it is an incident marker (payments.delayedAt + an annotation event) applied
 * on top of `pending`/`initiated` right before the auto-refund is claimed.
 */
export const paymentStateEnum = pgEnum("payment_state", [
  "initiated",
  "pending",
  "completed",
  "failed",
  "refunded",
]);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Client-supplied key that makes payment creation idempotent. */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    recipient: text("recipient").notNull(),
    /** Payee's phone number in national form, when paid by/matched to a
     *  number. Null for name-only payees. */
    recipientPhone: text("recipient_phone"),
    /** Stored as integer paise (1/100 INR) to avoid float money bugs. */
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("INR"),
    note: text("note").notNull().default(""),
    /** Which behavior the simulated provider should act out. */
    scenario: text("scenario").notNull().default("auto"),
    /** Short label of the device connection detected at send time, when the
     *  scenario was auto-selected (e.g. "Weak 2G"). Null for manual picks. */
    networkLabel: text("network_label"),
    /** Per-payment auto-refund window. */
    timeoutMs: integer("timeout_ms").notNull().default(8000),
    state: paymentStateEnum("state").notNull().default("initiated"),
    providerRef: text("provider_ref"),
    delayedAt: timestamp("delayed_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("payments_state_idx").on(t.state),
    index("payments_created_idx").on(t.createdAt),
  ],
);

/**
 * Append-only ledger of everything that happened to a payment.
 * kind = "transition": fromState -> toState changed.
 * kind = "annotation": nothing moved, but something notable was recorded
 * (delay detected, race suppressed, duplicate refund ignored...).
 */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("transition"),
    fromState: paymentStateEnum("from_state"),
    toState: paymentStateEnum("to_state"),
    title: text("title").notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("payment_events_payment_idx").on(t.paymentId, t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("refund"),
    message: text("message").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("notifications_created_idx").on(t.createdAt)],
);

/**
 * One row per issued refund, keyed by a deterministic refund key.
 * The unique constraint is the second line of defense against double refunds:
 * even if two refunders get past the state claim, only one can write here and
 * therefore only one ever performs the (simulated) money movement.
 */
export const refundLedger = pgTable("refund_ledger", {
  refundKey: text("refund_key").primaryKey(),
  paymentId: uuid("payment_id")
    .notNull()
    .unique()
    .references(() => payments.id),
  amountCents: integer("amount_cents").notNull(),
  providerRefundId: text("provider_refund_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type PaymentRow = typeof payments.$inferSelect;
export type PaymentEventRow = typeof paymentEvents.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
