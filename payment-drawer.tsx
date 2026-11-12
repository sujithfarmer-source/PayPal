"use client";

import {
  AlertTriangle,
  CirclePlus,
  Info,
  Loader2,
  Phone,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge, stateVisual } from "@/components/status-badge";
import { formatPhone } from "@/lib/contacts";
import {
  formatClock,
  formatMMSS,
  formatMoney,
  initialsOf,
  timeAgo,
} from "@/lib/format";
import { scenarioLabel } from "@/lib/scenario-meta";
import type { PaymentDto, PaymentEventDto } from "@/lib/types";

function useNow(enabled: boolean, everyMs = 500) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [enabled, everyMs]);
  return now;
}

function RefundCountdown({ payment, nowMs }: { payment: PaymentDto; nowMs: number }) {
  const start = new Date(payment.createdAt).getTime();
  const deadline = new Date(payment.deadlineAt).getTime();
  const pct = Math.min(1, Math.max(0, (nowMs - start) / (deadline - start)));
  const remaining = (deadline - nowMs) / 1000;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-amber-800">
          {remaining > 0
            ? `Auto-refund in ${formatMMSS(remaining)} if unsettled`
            : "Past the window — refund is being issued"}
        </span>
        <span className="text-xs text-amber-600 tabular-nums">
          {Math.round(payment.timeoutMs / 1000)}s limit
        </span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-amber-100">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            pct >= 1 ? "bg-rose-500" : pct > 0.8 ? "bg-amber-500" : "bg-accent"
          }`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

function EventIcon({ event }: { event: PaymentEventDto }) {
  if (event.kind === "annotation") {
    const lower = event.title.toLowerCase();
    const Icon =
      lower.includes("delayed") ? AlertTriangle
      : lower.includes("voided") || lower.includes("suppressed") ? ShieldCheck
      : Info;
    return (
      <span className="grid size-8 place-items-center rounded-full border border-gray-200 bg-white text-gray-500">
        <Icon className="size-3.5" />
      </span>
    );
  }
  const to = event.toState ?? "initiated";
  if (to === "initiated") {
    return (
      <span className="grid size-8 place-items-center rounded-full border border-gray-200 bg-gray-50 text-gray-500">
        <CirclePlus className="size-3.5" />
      </span>
    );
  }
  const visual = stateVisual(to);
  const Icon = visual.icon;
  return (
    <span
      className={`grid size-8 place-items-center rounded-full border bg-white ${visual.dot}`}
    >
      <Icon className="size-3.5" />
    </span>
  );
}

export function PaymentDrawer({
  paymentId,
  onClose,
}: {
  paymentId: string | null;
  onClose: () => void;
}) {
  const [payment, setPayment] = useState<PaymentDto | null>(null);
  const [events, setEvents] = useState<PaymentEventDto[]>([]);
  const inFlight =
    payment !== null &&
    (payment.state === "initiated" || payment.state === "pending");
  const nowMs = useNow(true, inFlight ? 250 : 1000);

  useEffect(() => {
    if (!paymentId) return;
    setPayment(null);
    setEvents([]);
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/payments/${paymentId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          payment: PaymentDto;
          events: PaymentEventDto[];
        };
        if (cancelled) return;
        setPayment(data.payment);
        setEvents(data.events);
      } catch {
        /* transient fetch errors are fine — next poll retries */
      }
    };
    void load();
    const t = setInterval(load, 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [paymentId]);

  useEffect(() => {
    if (!paymentId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paymentId, onClose]);

  const situation = useMemo(() => {
    if (!payment) return "";
    switch (payment.state) {
      case "completed":
        return `Settled in ${formatClock(payment.updatedAt)} — funds are with ${payment.recipient}.`;
      case "refunded":
        return `GoPay returned the money after the transfer stalled.`;
      case "failed":
        return "The provider declined this payment. No money left your account.";
      default:
        return `Being watched. If it does not settle by ${formatClock(
          payment.deadlineAt,
        )}, it refunds itself.`;
    }
  }, [payment]);

  if (!paymentId) return null;

  return (
    <div className="fixed inset-0 z-40">
      <button
        aria-label="Close details"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 cursor-default bg-gray-900/25"
      />
      <aside className="animate-slide-in-right absolute top-0 right-0 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <p className="font-display text-sm font-semibold tracking-wide text-gray-500 uppercase">
            Payment details
          </p>
          <button
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </header>

        {!payment ? (
          <div className="grid flex-1 place-items-center text-gray-400">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : (
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent/8 font-display text-base font-semibold text-accent">
                {initialsOf(payment.recipient)}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-xl font-semibold text-gray-900">
                  {payment.recipient}
                </h2>
                {payment.recipientPhone && (
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500 tabular-nums">
                    <Phone className="size-3.5" />
                    {formatPhone(payment.recipientPhone)}
                  </p>
                )}
                <p className="mt-0.5 text-sm text-gray-500">
                  Sent {timeAgo(payment.createdAt, nowMs)}
                </p>
              </div>
              <StatusBadge state={payment.state} delayed={payment.delayedAt !== null} />
            </div>

            <p className="font-display text-4xl font-semibold tracking-tight text-gray-900 tabular-nums">
              −{formatMoney(payment.amountCents)}
              <span className="ml-2 text-base font-medium text-gray-400">
                {payment.currency}
              </span>
            </p>

            <p className="text-sm leading-relaxed text-gray-600">{situation}</p>

            {inFlight && <RefundCountdown payment={payment} nowMs={nowMs} />}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-gray-200 p-4 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Refund window</dt>
                <dd className="mt-0.5 font-medium text-gray-900 tabular-nums">
                  {Math.round(payment.timeoutMs / 1000)}s
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Deadline</dt>
                <dd className="mt-0.5 font-medium text-gray-900 tabular-nums">
                  {formatClock(payment.deadlineAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Provider mode</dt>
                <dd className="mt-0.5 font-medium text-gray-900">
                  {scenarioLabel(payment.scenario)}
                  <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                    simulated
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Delayed at</dt>
                <dd className="mt-0.5 font-medium text-gray-900 tabular-nums">
                  {payment.delayedAt ? formatClock(payment.delayedAt) : "—"}
                </dd>
              </div>
              {payment.networkLabel && (
                <div>
                  <dt className="text-xs text-gray-500">Device network</dt>
                  <dd className="mt-0.5 font-medium text-gray-900">
                    {payment.networkLabel}
                  </dd>
                </div>
              )}
              {payment.providerRef && (
                <div className="col-span-2">
                  <dt className="text-xs text-gray-500">Provider reference</dt>
                  <dd className="mt-0.5 font-mono text-xs text-gray-700">
                    {payment.providerRef}
                  </dd>
                </div>
              )}
              <div className="col-span-2">
                <dt className="text-xs text-gray-500">Payment ID</dt>
                <dd className="mt-0.5 font-mono text-xs break-all text-gray-700">
                  {payment.id}
                </dd>
              </div>
            </dl>

            <div>
              <h3 className="font-display text-sm font-semibold tracking-wide text-gray-500 uppercase">
                Timeline
              </h3>
              <ol className="mt-3">
                {events.map((event, i) => (
                  <li key={event.id} className="relative flex gap-3 pb-5">
                    {i < events.length - 1 && (
                      <span className="absolute top-8 bottom-0 left-[15px] w-px bg-gray-200" />
                    )}
                    <EventIcon event={event} />
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-medium text-gray-900">
                          {event.title}
                        </p>
                        <time className="shrink-0 text-xs text-gray-400 tabular-nums">
                          {formatClock(event.createdAt)}
                        </time>
                      </div>
                      {event.note && (
                        <p className="mt-0.5 text-[13px] leading-snug text-gray-500">
                          {event.note}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
