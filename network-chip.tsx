"use client";

import { Radar, Signal, SignalHigh, SignalLow, WifiOff, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNetworkStatus, type NetworkQuality } from "@/lib/network-detect";

const QUALITY_ICON: Record<NetworkQuality, LucideIcon> = {
  strong: SignalHigh,
  moderate: Signal,
  weak: SignalLow,
  offline: WifiOff,
  unknown: Radar,
};

const DOT: Record<NetworkQuality, string> = {
  strong: "bg-emerald-500",
  moderate: "bg-amber-500",
  weak: "bg-amber-500",
  offline: "bg-rose-500",
  unknown: "bg-gray-300 animate-pulse",
};

function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Compact live connection indicator for the header. */
export function NetworkChip() {
  const status = useNetworkStatus();
  const mounted = useMounted();
  if (!mounted) {
    // SSR-safe placeholder, no hydration mismatch.
    return (
      <span className="hidden h-9 items-center gap-2 rounded-full border border-gray-200 px-3 text-xs font-medium text-gray-400 sm:inline-flex">
        <span className="size-1.5 animate-pulse rounded-full bg-gray-300" />
        Checking…
      </span>
    );
  }
  return (
    <span
      role="status"
      aria-label={`Connection: ${status.label}. ${status.detail}`}
      title={`${status.label} · ${status.detail}`}
      className="hidden h-9 cursor-default items-center gap-2 rounded-full border border-gray-200 px-3 text-xs font-medium text-gray-600 tabular-nums sm:inline-flex"
    >
      <span className={`size-1.5 rounded-full ${DOT[status.quality]}`} />
      {status.label}
    </span>
  );
}

/** Contextual callout above the activity list when the connection deserves
 *  a mention. Hidden on strong connections to keep the page calm. */
export function NetworkBanner() {
  const status = useNetworkStatus();
  const mounted = useMounted();
  if (!mounted || status.quality === "strong" || status.quality === "unknown") {
    return null;
  }
  const Icon = QUALITY_ICON[status.quality];
  const tone =
    status.quality === "offline"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : status.quality === "moderate"
        ? "border-gray-200 bg-gray-50 text-gray-700"
        : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div
      role="status"
      className={`animate-fade-in mt-6 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${tone}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="leading-snug font-medium">{status.message}</p>
        <p className="mt-0.5 text-xs opacity-70 tabular-nums">{status.detail}</p>
      </div>
    </div>
  );
}
