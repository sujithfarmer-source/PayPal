import { beforeEach, describe, expect, it } from "vitest";
import { completePayment } from "@/lib/payments/lifecycle";
import { refundForTimeout } from "@/lib/payments/refund";
import {
  eventsOf,
  freshPayment,
  insertPayment,
  ledgerOf,
  notificationsOf,
  resetDb,
  transitionTargets,
} from "./helpers";

const jitter = () =>
  new Promise((r) => setTimeout(r, Math.floor(Math.random() * 4)));

describe("late-completion race (settlement vs. timeout refund)", () => {
  beforeEach(resetDb);

  it("runs 25 head-to-head races; exactly one side ever wins", async () => {
    for (let i = 0; i < 25; i++) {
      await resetDb();
      const p = await insertPayment({ state: "pending", timeoutMs: 5_000 });

      // Fire settlement and timeout refund concurrently, with random
      // sub-4ms jitter and random call order so either can reach
      // Postgres first.
      const settle = async () => {
        await jitter();
        return completePayment(p.id);
      };
      const refund = async () => {
        await jitter();
        return refundForTimeout(p.id);
      };
      let settleP: ReturnType<typeof settle>;
      let refundP: ReturnType<typeof refund>;
      if (Math.random() < 0.5) {
        settleP = settle();
        refundP = refund();
      } else {
        refundP = refund();
        settleP = settle();
      }
      const [settleResult, refundResult] = await Promise.all([settleP, refundP]);

      // Exactly one winner.
      const wins =
        Number(settleResult.applied) + Number(refundResult.outcome === "refunded");
      expect(wins).toBe(1);

      const after = await freshPayment(p.id);
      expect(["completed", "refunded"]).toContain(after.state);

      const targets = transitionTargets(await eventsOf(p.id));
      // Exactly one terminal transition recorded — never both.
      const terminalMoves = targets.filter(
        (t) => t === "completed" || t === "refunded",
      );
      expect(terminalMoves).toHaveLength(1);

      if (after.state === "refunded") {
        // Refund won: settlement was rejected and documented, one refund
        // on the ledger, one notification.
        expect(settleResult.applied).toBe(false);
        expect(settleResult.from).toBe("refunded");
        expect(await ledgerOf(p.id)).toHaveLength(1);
        expect(await notificationsOf(p.id)).toHaveLength(1);
        const titles = (await eventsOf(p.id)).map((e) => e.title);
        expect(titles).toContain("Late settlement voided");
      } else {
        // Settlement won: refund suppressed, no ledger row, no notification.
        expect(after.state).toBe("completed");
        expect(refundResult.outcome).toBe("completed-first");
        expect(await ledgerOf(p.id)).toHaveLength(0);
        expect(await notificationsOf(p.id)).toHaveLength(0);
        const titles = (await eventsOf(p.id)).map((e) => e.title);
        expect(titles).toContain("Refund suppressed");
      }
    }
  });
});
