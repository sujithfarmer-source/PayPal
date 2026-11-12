"use client";

import {
  AlertCircle,
  Loader2,
  Phone,
  Radar,
  Search,
  Signal,
  SignalHigh,
  SignalLow,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  findContactByPhone,
  formatPhone,
  isValidPhone,
  looksLikePhone,
  resolveRecipient,
  searchContacts,
} from "@/lib/contacts";
import { formatMoney, formatMoneyCompact, parseAmountToCents } from "@/lib/format";
import { initialsOf } from "@/lib/format";
import {
  useNetworkStatus,
  type NetworkQuality,
} from "@/lib/network-detect";
import { SCENARIO_META } from "@/lib/scenario-meta";
import type { PaymentDto } from "@/lib/types";

const QUICK_AMOUNTS = [5000, 10000, 50000, 100000]; // ₹50 / ₹100 / ₹500 / ₹1,000

const QUALITY_ICON: Record<NetworkQuality, LucideIcon> = {
  strong: SignalHigh,
  moderate: Signal,
  weak: SignalLow,
  offline: WifiOff,
  unknown: Radar,
};

const QUALITY_BOX: Record<NetworkQuality, string> = {
  strong: "border-emerald-200 bg-emerald-50 text-emerald-800",
  moderate: "border-amber-200 bg-amber-50 text-amber-800",
  weak: "border-amber-200 bg-amber-50 text-amber-800",
  offline: "border-rose-200 bg-rose-50 text-rose-700",
  unknown: "border-gray-200 bg-gray-50 text-gray-500",
};

export function NewPaymentDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (payment: PaymentDto) => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per dialog session: identical retries no-op server-side.
  const [clientKey, setClientKey] = useState("");
  const network = useNetworkStatus();

  useEffect(() => {
    if (open) {
      setClientKey(crypto.randomUUID());
      setError(null);
    } else {
      setRecipient("");
      setShowSuggestions(false);
      setAmount("");
      setNote("");
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, submitting, onClose]);

  if (!open) return null;

  const cents = parseAmountToCents(amount);
  const typedIsPhone = looksLikePhone(recipient);
  const resolved = resolveRecipient(recipient);
  const suggestions = searchContacts(recipient);
  // Show the picker while the field is focused and the text isn't already an
  // exact match for the single remaining contact.
  const suggestionsVisible =
    showSuggestions &&
    suggestions.length > 0 &&
    !(suggestions.length === 1 && suggestions[0].name === recipient.trim());
  // The simulated scenario always rides this device's live connection — no
  // manual override in the UI anymore.
  const resolvedScenario = network.scenario;
  const detectedMeta = SCENARIO_META[network.scenario];
  const NetworkIcon = QUALITY_ICON[network.quality];

  const submit = async () => {
    setError(null);
    if (typedIsPhone && !isValidPhone(recipient)) {
      setError("Enter a valid 10-digit mobile number (starting 6-9).");
      return;
    }
    if (!resolved) {
      setError("Who are you paying? Enter a name or a 10-digit mobile number.");
      return;
    }
    if (cents === null) {
      setError("Enter a valid amount like 24.50.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": clientKey,
        },
        body: JSON.stringify({
          recipient,
          amount,
          note,
          scenario: resolvedScenario,
          // Trace which device connection picked the scenario, so the
          // timeline can explain the choice later.
          networkLabel: network.quality !== "unknown" ? network.label : null,
          clientKey,
        }),
      });
      const data = (await res.json()) as {
        payment?: PaymentDto;
        error?: string;
      };
      if (!res.ok || !data.payment) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      onCreated(data.payment);
      onClose();
    } catch {
      setError("Network error — your payment was NOT sent. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
      <button
        aria-label="Close"
        onClick={() => !submitting && onClose()}
        className="animate-fade-in absolute inset-0 cursor-default bg-gray-900/30"
      />
      <div className="animate-pop-in relative my-4 w-full max-w-xl rounded-3xl border border-gray-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between px-7 pt-6">
          <div>
            <h2 className="font-display text-xl font-semibold text-gray-900">
              New payment
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Watched end-to-end. Stalls refund themselves.
            </p>
          </div>
          <button
            onClick={() => !submitting && onClose()}
            className="grid size-9 place-items-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="space-y-5 px-7 py-6">
          <div>
            <label className="text-[13px] font-medium text-gray-700">
              Recipient
            </label>

            {/* Combobox: accepts a contact name OR a phone number. */}
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-400">
                {typedIsPhone ? (
                  <Phone className="size-4" />
                ) : (
                  <Search className="size-4" />
                )}
              </span>
              <input
                value={recipient}
                onChange={(e) => {
                  setRecipient(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
                placeholder="Name or phone number"
                inputMode={typedIsPhone ? "tel" : "text"}
                autoFocus
                autoComplete="off"
                aria-expanded={suggestionsVisible}
                className="h-11 w-full rounded-xl border border-gray-300 pr-3.5 pl-10 text-[15px] outline-none transition-colors placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/20"
              />

              {suggestionsVisible && (
                <ul className="animate-pop-in absolute top-12 right-0 left-0 z-10 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl shadow-gray-900/5">
                  {suggestions.map((c) => (
                    <li key={c.phone}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setRecipient(c.name);
                          setShowSuggestions(false);
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-50"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/8 font-display text-[11px] font-semibold text-accent">
                          {initialsOf(c.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-gray-900">
                            {c.name}
                          </span>
                          <span className="block text-xs text-gray-500 tabular-nums">
                            {formatPhone(c.phone)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Live feedback: who exactly is getting paid. */}
            {recipient.trim().length > 0 && (
              <p className="mt-1.5 text-xs">
                {typedIsPhone && !isValidPhone(recipient) ? (
                  <span className="text-amber-600">
                    Keep typing — a mobile number is 10 digits starting 6-9.
                  </span>
                ) : resolved ? (
                  <span className="text-gray-500">
                    Paying{" "}
                    <span className="font-medium text-gray-900">
                      {resolved.name}
                    </span>
                    {resolved.phone && (
                      <span className="tabular-nums">
                        {" "}
                        · {formatPhone(resolved.phone)}
                      </span>
                    )}
                    {typedIsPhone && !findContactByPhone(recipient) && (
                      <span className="text-gray-400"> · new number</span>
                    )}
                  </span>
                ) : (
                  <span className="text-gray-400">
                    Enter a name (2+ characters) or a 10-digit number.
                  </span>
                )}
              </p>
            )}
          </div>

          <div>
            <label className="text-[13px] font-medium text-gray-700">
              Amount
            </label>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 font-display text-xl font-semibold text-gray-400">
                ₹
              </span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                className="h-14 w-full rounded-xl border border-gray-300 px-9 font-display text-2xl font-semibold tracking-tight outline-none tabular-nums transition-colors placeholder:text-gray-300 focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_AMOUNTS.map((c) => (
                <button
                  key={c}
                  onClick={() => setAmount((c / 100).toFixed(2))}
                  className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 tabular-nums transition-colors hover:border-gray-300 hover:text-gray-900"
                >
                  {formatMoneyCompact(c)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[13px] font-medium text-gray-700">
              Note <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Dinner, invoice 1042…"
              maxLength={140}
              className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 px-3.5 text-[15px] outline-none transition-colors placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-[13px] font-medium text-gray-700">
                Network simulation
              </label>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
                demo — no real money
              </span>
            </div>

            {/* Read-only: the simulation always matches this device. */}
            <div className="mt-1.5 flex w-full items-center gap-2.5 rounded-xl border border-accent/40 bg-accent/[0.04] p-3 ring-1 ring-accent/40">
              <Radar className="size-4 shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900">
                  Auto — matched to this device&apos;s connection
                </span>
                <span className="mt-0.5 block truncate text-xs text-gray-500 tabular-nums">
                  Detected: {network.label} · {network.detail}
                </span>
              </span>
              {detectedMeta && (
                <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                  → {detectedMeta.label}
                </span>
              )}
            </div>

            <div
              className={`mt-2 flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] leading-snug ${QUALITY_BOX[network.quality]}`}
              role="status"
            >
              <NetworkIcon className="mt-0.5 size-4 shrink-0" />
              {network.message}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}

          <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            Every payment is protected — if it doesn&apos;t settle within 10s,
            it refunds automatically.
          </p>
          <button
            onClick={submit}
            disabled={submitting}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent font-display text-[15px] font-semibold text-white transition-all hover:bg-accent-deep active:scale-[0.99] disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Sending…
              </>
            ) : (
              <>Send{cents !== null ? ` ${formatMoney(cents)}` : ""}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
