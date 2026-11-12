import { randomUUID } from "crypto";

/**
 * Simulated payment provider (a fake "PSP").
 *
 * No real money and no network: `authorize` schedules a settlement outcome on
 * a timer, `voidAuthorization` retracts a pending settlement after a refund
 * was issued, and `credit` performs the refund money movement. Debit/credit
 * ledgers keep the provider itself idempotent, like a real PSP that dedupes
 * on an idempotency key.
 */

export type ProviderScenario =
  | "auto" // realistic: settles in 1-4s, occasionally declines
  | "fast" // settles in well under a second
  | "slow" // settles, but only after the refund window has passed
  | "stall" // never responds -> guaranteed timeout + auto-refund
  | "fail" // declines quickly
  | "race"; // settles right around the deadline — races the monitor

export const SCENARIOS: readonly ProviderScenario[] = [
  "auto",
  "fast",
  "slow",
  "stall",
  "fail",
  "race",
];

export interface AuthorizeRequest {
  paymentId: string;
  amountCents: number;
  timeoutMs: number;
  scenario: ProviderScenario;
}

export interface AuthorizationHandlers {
  onSettle: (paymentId: string) => unknown;
  onReject: (paymentId: string, reason: string) => unknown;
}

interface GlobalProviderState {
  timers: Map<string, NodeJS.Timeout>;
  credits: Map<string, string>; // refundKey -> providerRefundId
  debits: Set<string>; // paymentIds ever authorized
}

const globalProvider = globalThis as typeof globalThis & {
  __gopayProvider?: GlobalProviderState;
};

const state: GlobalProviderState =
  globalProvider.__gopayProvider ??
  {
    timers: new Map(),
    credits: new Map(),
    debits: new Set(),
  };

if (process.env.NODE_ENV !== "production") {
  globalProvider.__gopayProvider = state;
}

const jitter = (min: number, max: number) =>
  min + Math.random() * (max - min);

export const simulatedProvider = {
  /** Accept a payment and schedule its (simulated) network outcome. */
  authorize(
    req: AuthorizeRequest,
    handlers: AuthorizationHandlers,
  ): { providerRef: string } {
    state.debits.add(req.paymentId);
    const providerRef = `psp_${randomUUID().replaceAll("-", "").slice(0, 16)}`;

    const settle = () => void handlers.onSettle(req.paymentId);
    const reject = (reason: string) =>
      void handlers.onReject(req.paymentId, reason);

    let delay: number | null;
    switch (req.scenario) {
      case "fast":
        delay = jitter(400, 900);
        break;
      case "slow":
        delay = req.timeoutMs + 2500;
        break;
      case "race":
        // Deliberately lands within +/-200ms of the deadline so either the
        // settlement or the timeout refund can win on any given run.
        delay = req.timeoutMs + jitter(-200, 200);
        break;
      case "fail": {
        const t = setTimeout(
          () => reject("Declined by issuing bank (simulated)"),
          650,
        );
        state.timers.set(req.paymentId, t);
        return { providerRef };
      }
      case "stall":
        return { providerRef }; // the network ate this one — no timer at all
      case "auto":
      default:
        if (Math.random() < 0.08) {
          const t = setTimeout(
            () => reject("Network error while settling (simulated)"),
            jitter(900, 2000),
          );
          state.timers.set(req.paymentId, t);
          return { providerRef };
        }
        delay = jitter(1200, 4200);
    }

    const timer = setTimeout(settle, Math.max(50, delay));
    state.timers.set(req.paymentId, timer);
    return { providerRef };
  },

  /**
   * Retract a pending authorization after a refund was issued, so a stalled
   * payment can no longer settle into the recipient. Returns true if there
   * was genuinely something pending to void (useful in tests).
   */
  voidAuthorization(paymentId: string): boolean {
    const timer = state.timers.get(paymentId);
    if (timer) clearTimeout(timer);
    state.timers.delete(paymentId);
    return timer !== undefined;
  },

  /**
   * Idempotent refund money-movement. Same refundKey in -> same result out,
   * no second credit. Returns the provider-side refund id.
   */
  credit(refundKey: string, amountCents: number): { providerRefundId: string } {
    void amountCents;
    const existing = state.credits.get(refundKey);
    if (existing) return { providerRefundId: existing };
    const providerRefundId = `rf_${randomUUID()
      .replaceAll("-", "")
      .slice(0, 12)}`;
    state.credits.set(refundKey, providerRefundId);
    return { providerRefundId };
  },
};
