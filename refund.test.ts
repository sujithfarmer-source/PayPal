import { beforeEach, describe, expect, it } from "vitest";
import { refundForTimeout } from "@/lib/payments/refund";
import {
  eventsOf,
  freshPayment,
  insertPayment,
  ledgerOf,
  notificationsOf,
  resetDb,
} from "./helpers";

describe("refund service idempotency", () => {
  beforeEach(resetDb);

  it("refunds once even when called repeatedly", async () => {
    const p = await insertPayment({ state: "pending" });

    const first = await refundForTimeout(p.id);
    const second = await refundForTimeout(p.id);
    const third = await refundForTimeout(p.id);

    expect(first.outcome).toBe("refunded");
    expect(second.outcome).toBe("already-refunded");
    expect(third.outcome).toBe("already-refunded");

    expect(await ledgerOf(p.id)).toHaveLength(1);
    expect(await notificationsOf(p.id)).toHaveLength(1);
    const refundedTransitions = (await eventsOf(p.id)).filter(
      (e) => e.kind === "transition" && e.toState === "refunded",
    );
    expect(refundedTransitions).toHaveLength(1);
  });

  it("two concurrent refunders produce exactly one refund", async () => {
    const p = await insertPayment({ state: "pending" });
    const [a, b] = await Promise.all([
      refundForTimeout(p.id),
      refundForTimeout(p.id),
    ]);
    const outcomes = [a.outcome, b.outcome].sort();
    expect(outcomes).toEqual(["already-refunded", "refunded"]);
    expect(await ledgerOf(p.id)).toHaveLength(1);
    expect(await notificationsOf(p.id)).toHaveLength(1);
  });

  it("never refunds a completed payment", async () => {
    const p = await insertPayment({ state: "completed" });
    const result = await refundForTimeout(p.id);
    expect(result.outcome).toBe("completed-first");
    expect((await freshPayment(p.id)).state).toBe("completed");
    expect(await ledgerOf(p.id)).toHaveLength(0);
    expect(await notificationsOf(p.id)).toHaveLength(0);
  });

  it("rejects refunds on terminal failed payments", async () => {
    const p = await insertPayment({ state: "failed" });
    const result = await refundForTimeout(p.id);
    expect(result.outcome).toBe("not-refundable");
    expect(await ledgerOf(p.id)).toHaveLength(0);
  });
});
