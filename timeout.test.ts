import { beforeEach, describe, expect, it } from "vitest";
import { processTimeouts } from "@/lib/payments/monitor";
import {
  eventsOf,
  freshPayment,
  insertPayment,
  ledgerOf,
  notificationsOf,
  resetDb,
  transitionTargets,
} from "./helpers";

describe("timeout monitor", () => {
  beforeEach(resetDb);

  it("auto-refunds a payment that exceeds its window", async () => {
    const p = await insertPayment({
      state: "pending",
      timeoutMs: 5_000,
      createdAt: new Date(Date.now() - 20_000),
    });

    const results = await processTimeouts({ now: Date.now() });
    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe("refunded");

    const after = await freshPayment(p.id);
    expect(after.state).toBe("refunded");
    expect(after.delayedAt).not.toBeNull();
    expect(after.refundedAt).not.toBeNull();

    expect(transitionTargets(await eventsOf(p.id))).toContain("refunded");

    // The delay was annotated, a durable refund record exists, and the
    // user got a notification.
    const annotations = (await eventsOf(p.id)).filter(
      (e) => e.kind === "annotation",
    );
    expect(annotations.some((e) => e.title === "Marked delayed")).toBe(true);

    const ledger = await ledgerOf(p.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amountCents).toBe(p.amountCents);
    expect(ledger[0].providerRefundId).toMatch(/^rf_/);

    const notes = await notificationsOf(p.id);
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toContain("Test Recipient");
  });

  it("leaves payments inside their window untouched", async () => {
    const p = await insertPayment({ state: "pending", timeoutMs: 30_000 });
    const results = await processTimeouts({ now: Date.now() });
    expect(results).toHaveLength(0);
    expect((await freshPayment(p.id)).state).toBe("pending");
    expect(await ledgerOf(p.id)).toHaveLength(0);
  });

  it("ignores settled payments even when they are older than the window", async () => {
    const p = await insertPayment({
      state: "completed",
      timeoutMs: 5_000,
      createdAt: new Date(Date.now() - 60_000),
    });
    const results = await processTimeouts({ now: Date.now() });
    expect(results).toHaveLength(0);
    expect((await freshPayment(p.id)).state).toBe("completed");
  });

  it("is itself idempotent: a second sweep finds nothing to do", async () => {
    const p = await insertPayment({
      state: "pending",
      timeoutMs: 5_000,
      createdAt: new Date(Date.now() - 20_000),
    });
    await processTimeouts({ now: Date.now() });
    const second = await processTimeouts({ now: Date.now() });
    expect(second).toHaveLength(0);
    expect((await freshPayment(p.id)).state).toBe("refunded");
    // Still exactly one refund on record.
    expect(await ledgerOf(p.id)).toHaveLength(1);
  });
});
