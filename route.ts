import { NextRequest } from "next/server";
import { paymentToDto } from "@/lib/payments/dto";
import { processTimeouts } from "@/lib/payments/monitor";
import {
  createPayment,
  listPayments,
  summarize,
  ValidationError,
} from "@/lib/payments/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const [payments, summary] = await Promise.all([listPayments(), summarize()]);
  return Response.json({
    payments: payments.map(paymentToDto),
    summary,
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const raw = (body ?? {}) as Record<string, unknown>;

  try {
    const { payment, reused } = await createPayment({
      recipient: String(raw.recipient ?? ""),
      amount: String(raw.amount ?? ""),
      note: raw.note == null ? "" : String(raw.note),
      scenario: raw.scenario == null ? undefined : String(raw.scenario),
      networkLabel:
        raw.networkLabel == null ? undefined : String(raw.networkLabel),
      timeoutMs:
        raw.timeoutMs == null ? undefined : Number(raw.timeoutMs) || undefined,
      // Header wins; fall back to a body key so the flow stays idempotent
      // even without custom-header support.
      idempotencyKey:
        req.headers.get("idempotency-key") ??
        (raw.clientKey ? String(raw.clientKey) : crypto.randomUUID()),
    });
    // Nudge the worker so very short windows resolve promptly.
    void processTimeouts().catch(() => {});
    return Response.json(
      { payment: paymentToDto(payment), reused },
      { status: reused ? 200 : 201 },
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    console.error("[api] create payment failed:", err);
    return Response.json({ error: "Failed to create payment" }, { status: 500 });
  }
}
