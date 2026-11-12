"use client";

import {
  CheckCircle2,
  Clock3,
  Plus,
  ShieldCheck,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NetworkBanner, NetworkChip } from "@/components/network-chip";
import { NewPaymentDialog } from "@/components/new-payment-dialog";
import { NotificationsBell } from "@/components/notifications-bell";
import { PaymentDrawer } from "@/components/payment-drawer";
import { TransactionList } from "@/components/transaction-list";
import { formatMoney } from "@/lib/format";
import type {
  NotificationDto,
  PaymentDto,
  PaymentSummaryDto,
} from "@/lib/types";

const EMPTY_SUMMARY: PaymentSummaryDto = {
  inFlight: 0,
  completed: 0,
  failed: 0,
  refunded: 0,
  refundedCents: 0,
};

function Stat({
  icon: Icon,
  iconClass,
  label,
  value,
  hint,
  live = false,
}: {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  value: string;
  hint: string;
  live?: boolean;
}) {
  return (
    <div className="bg-white px-5 py-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-gray-500 uppercase">
        <Icon className={`size-3.5 ${iconClass}`} />
        {label}
        {live && (
          <span className="relative ml-0.5 flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
          </span>
        )}
      </div>
      <p className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-gray-400">{hint}</p>
    </div>
  );
}

export function Dashboard() {
  const [payments, setPayments] = useState<PaymentDto[]>([]);
  const [summary, setSummary] = useState<PaymentSummaryDto>(EMPTY_SUMMARY);
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [unread, setUnread] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  const refresh = useCallback(async () => {
    try {
      const [pRes, nRes] = await Promise.all([
        fetch("/api/payments", { cache: "no-store" }),
        fetch("/api/notifications", { cache: "no-store" }),
      ]);
      if (pRes.ok) {
        const data = (await pRes.json()) as {
          payments: PaymentDto[];
          summary: PaymentSummaryDto;
        };
        setPayments(data.payments);
        setSummary(data.summary);
      }
      if (nRes.ok) {
        const data = (await nRes.json()) as {
          notifications: NotificationDto[];
          unread: number;
        };
        setNotifications(data.notifications);
        setUnread(data.unread);
      }
    } catch {
      /* transient network failure — the next tick retries */
    } finally {
      setLoaded(true);
    }
  }, []);

  // Poll while the tab is visible; in-flight states change on their own.
  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 1500);
    return () => clearInterval(t);
  }, [refresh]);

  // Separate 1s heartbeat for relative timestamps and countdowns.
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const markAllRead = useCallback(async () => {
    setUnread(0);
    setNotifications((items) => items.map((n) => ({ ...n, read: true })));
    try {
      await fetch("/api/notifications", { method: "POST" });
    } catch {
      /* non-fatal */
    }
  }, []);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-accent text-white">
              <ShieldCheck className="size-4.5" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight text-gray-900">
              Go<span className="text-accent">Pay</span>
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <NetworkChip />
            <NotificationsBell
              items={notifications}
              unread={unread}
              onReadAll={markAllRead}
              onOpenPayment={setSelectedId}
              nowMs={nowMs}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pt-10 pb-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[34px] leading-tight font-semibold tracking-tight text-gray-900">
              Activity
            </h1>
            <p className="mt-1 max-w-md text-[15px] leading-relaxed text-gray-500">
              GoPay watches every transfer end-to-end — and senses your
              connection, so anything that stalls refunds itself before you
              even notice.
            </p>
          </div>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex h-11 items-center gap-2 rounded-full bg-accent px-5 font-display text-[15px] font-semibold text-white transition-all hover:bg-accent-deep active:scale-[0.98]"
          >
            <Plus className="size-4.5" />
            New payment
          </button>
        </div>

        <NetworkBanner />

        <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-200 sm:grid-cols-4">
          <Stat
            icon={Clock3}
            iconClass="text-amber-500"
            label="In flight"
            value={String(summary.inFlight)}
            hint="watched right now"
            live={summary.inFlight > 0}
          />
          <Stat
            icon={CheckCircle2}
            iconClass="text-emerald-500"
            label="Completed"
            value={String(summary.completed)}
            hint="settled successfully"
          />
          <Stat
            icon={Undo2}
            iconClass="text-accent"
            label="Auto-refunded"
            value={String(summary.refunded)}
            hint="stalled past the window"
          />
          <Stat
            icon={ShieldCheck}
            iconClass="text-accent"
            label="Protected"
            value={formatMoney(summary.refundedCents)}
            hint="returned automatically"
          />
        </div>

        <div className="mt-9">
          {loaded ? (
            <TransactionList
              payments={payments}
              selectedId={selectedId}
              onSelect={setSelectedId}
              nowMs={nowMs}
            />
          ) : (
            <div className="h-40 animate-pulse rounded-2xl border border-gray-100 bg-gray-50" />
          )}
        </div>

        <footer className="mt-14 border-t border-gray-100 pt-5 pb-4 text-xs text-gray-400">
          GoPay prototype · simulated provider — no real money moves · network
          behavior auto-detected from this device · timeout monitor sweeps
          every 1.5s
        </footer>
      </main>

      <NewPaymentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => void refresh()}
      />
      <PaymentDrawer
        paymentId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
