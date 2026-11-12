"use client";

import { ChevronRight, Inbox } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { formatPhone } from "@/lib/contacts";
import { formatMoney, initialsOf, timeAgo } from "@/lib/format";
import { scenarioLabel } from "@/lib/scenario-meta";
import type { PaymentDto } from "@/lib/types";

type FilterKey = "all" | "inflight" | "completed" | "refunded" | "failed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "inflight", label: "In flight" },
  { key: "completed", label: "Completed" },
  { key: "refunded", label: "Refunded" },
  { key: "failed", label: "Failed" },
];

function matches(p: PaymentDto, filter: FilterKey): boolean {
  switch (filter) {
    case "all":
      return true;
    case "inflight":
      return p.state === "initiated" || p.state === "pending";
    case "completed":
      return p.state === "completed";
    case "refunded":
      return p.state === "refunded";
    case "failed":
      return p.state === "failed";
  }
}

export function TransactionList({
  payments,
  selectedId,
  onSelect,
  nowMs,
}: {
  payments: PaymentDto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  nowMs: number;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const visible = useMemo(
    () => payments.filter((p) => matches(p, filter)),
    [payments, filter],
  );

  return (
    <section>
      <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200">
        {FILTERS.map((f) => {
          const count = payments.filter((p) => matches(p, f.key)).length;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-1 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                active
                  ? "border-accent text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              {f.label}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  active ? "bg-accent/10 text-accent" : "bg-gray-100 text-gray-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-gray-100 text-gray-400">
            <Inbox className="size-6" />
          </span>
          <div>
            <p className="font-display font-semibold text-gray-900">
              Nothing here yet
            </p>
            <p className="mt-1 max-w-xs text-sm text-gray-500">
              Send a payment and GoPay will watch it until it settles — or
              refund it if it stalls.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <ul className="divide-y divide-gray-100">
            {visible.map((p) => {
              // Prefer the payee's number, then the note, then the scenario.
              const base = p.recipientPhone
                ? formatPhone(p.recipientPhone)
                : p.note
                  ? p.note
                  : p.networkLabel
                    ? `${p.networkLabel} → ${scenarioLabel(p.scenario)}`
                    : scenarioLabel(p.scenario);
              const sub = `${base} · ${timeAgo(p.createdAt, nowMs)}`;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => onSelect(p.id)}
                    className={`flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50 ${
                      selectedId === p.id ? "bg-accent/[0.04]" : ""
                    }`}
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent/8 font-display text-sm font-semibold text-accent">
                      {initialsOf(p.recipient)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-gray-900">
                        {p.recipient}
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-gray-500">
                        {sub}
                      </span>
                    </span>
                    <StatusBadge
                      state={p.state}
                      delayed={p.delayedAt !== null}
                    />
                    <span className="hidden w-24 shrink-0 text-right sm:block">
                      <span className="block text-[15px] font-semibold text-gray-900 tabular-nums">
                        −{formatMoney(p.amountCents)}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-gray-400 uppercase">
                        {p.currency}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-gray-300" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
