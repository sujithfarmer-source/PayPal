/**
 * Next.js server startup hook: boots the timeout monitor worker so overdue
 * payments are auto-refunded even when nobody is hitting the API. The worker
 * is idempotent-safe — every tick goes through the atomic refund claim.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startMonitor } = await import("@/lib/payments/monitor");
    startMonitor(1500);
    console.log("[gopay] timeout monitor started (1500ms tick)");
  }
}
