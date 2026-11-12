/** Shared display formatting helpers (safe to import from client or server).
 *  Amounts are INR: "cents" throughout the codebase are paise (1/100 rupee),
 *  formatted with Indian digit grouping (₹1,24,500.00). */

const moneyFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});

const moneyCompactFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** paise -> "₹1,024.50" */
export function formatMoney(cents: number): string {
  return moneyFmt.format(cents / 100);
}

/** paise -> "₹1,025" (whole rupees, for chips and compact spots) */
export function formatMoneyCompact(cents: number): string {
  return moneyCompactFmt.format(Math.round(cents / 100));
}

/** "12.34" rupees string -> 1234 paise, or null if invalid.
 *  Accepts ₹ (and $ for convenience) plus lakh-style comma grouping. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.trim().replace(/^[₹$]/, "").replaceAll(",", "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [rupees, fraction = ""] = cleaned.split(".");
  const cents = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return cents;
}

const clockFmt = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatClock(date: Date | string): string {
  return clockFmt.format(new Date(date));
}

export function timeAgo(date: Date | string, nowMs = Date.now()): string {
  const diff = Math.max(0, nowMs - new Date(date).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function formatMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
