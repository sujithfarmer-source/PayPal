"use client";

import { useEffect, useReducer } from "react";

/**
 * Device network detection.
 *
 * Combines three browser signals, no permission prompts:
 *  1. navigator.onLine + online/offline events (off-grid detection)
 *  2. The Network Information API (connection.effectiveType / rtt / downlink)
 *     where supported (Chrome/Edge/Android)
 *  3. A periodic ping against our own /api/health as a fallback so Safari and
 *     Firefox still get a sensible classification
 *
 * The result chooses the simulated provider scenario for new payments and
 * drives the connection messages shown around the app.
 */

export type NetworkQuality =
  | "offline"
  | "weak"
  | "moderate"
  | "strong"
  | "unknown";

export interface NetworkStatus {
  quality: NetworkQuality;
  /** Compact label, e.g. "Weak 2G", "Strong 4G (84 ms ping e2e)". */
  label: string;
  /** Which simulated provider scenario this connection should ride. */
  scenario: "auto" | "fast" | "slow" | "stall" | "fail" | "race";
  /** One-sentence, user-facing explanation of what this connection implies. */
  message: string;
  /** Raw measurements for tooltips/details. */
  detail: string;
}

interface ConnectionLike {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

type PingState = { kind: "unknown" } | { kind: "ok"; ms: number } | { kind: "fail" };

let ping: PingState = { kind: "unknown" };
const listeners = new Set<() => void>();
let started = false;

function connection(): ConnectionLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: ConnectionLike }).connection;
}

async function probe(): Promise<void> {
  try {
    const t0 = performance.now();
    const res = await fetch("/api/health", { cache: "no-store" });
    ping = res.ok
      ? { kind: "ok", ms: Math.round(performance.now() - t0) }
      : { kind: "fail" };
  } catch {
    ping = { kind: "fail" };
  }
  listeners.forEach((l) => l());
}

function ensureStarted(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const notify = () => listeners.forEach((l) => l());
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  const conn = connection();
  conn?.addEventListener?.("change", notify);
  void probe();
  setInterval(probe, 10_000);
}

export function computeStatus(): NetworkStatus {
  if (typeof navigator === "undefined") {
    return {
      quality: "unknown",
      label: "Checking connection",
      scenario: "auto",
      message: "Checking this device's connection…",
      detail: "server render",
    };
  }

  const conn = connection();
  const reachable = ping.kind === "ok";
  const unreachable = ping.kind === "fail";

  if (!navigator.onLine || unreachable) {
    return {
      quality: "offline",
      label: "Offline",
      scenario: "stall",
      message:
        "This device looks offline — payments can't reach the provider, so this one will stall and GoPay will auto-refund it once its window expires.",
      detail: navigator.onLine
        ? "health endpoint unreachable"
        : "navigator reports offline",
    };
  }

  if (conn?.effectiveType) {
    const stats = [
      `${conn.effectiveType}`,
      conn.downlink != null ? `~${conn.downlink} Mb/s` : null,
      conn.rtt != null ? `${conn.rtt} ms RTT` : null,
      ping.kind === "ok" ? `${ping.ms} ms ping` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    switch (conn.effectiveType) {
      case "slow-2g":
      case "2g":
        return {
          quality: "weak",
          label: "Weak 2G",
          scenario: "slow",
          message:
            "Weak 2G-class connection detected — payments run through the slow lane and will likely miss their window, so expect GoPay to auto-refund this one.",
          detail: stats,
        };
      case "3g":
        return {
          quality: "moderate",
          label: "Moderate 3G",
          scenario: "auto",
          message:
            "Moderate 3G-class connection — realistic simulation: usually settles in a few seconds, occasionally declines.",
          detail: stats,
        };
      default:
        return {
          quality: "strong",
          label: "Strong 4G",
          scenario: "fast",
          message:
            "Strong 4G-class connection — payments should settle near-instantly.",
          detail: stats,
        };
    }
  }

  // No Network Information API: classify from the measured ping.
  if (ping.kind === "ok") {
    if (ping.ms < 250) {
      return {
        quality: "strong",
        label: `Strong (${ping.ms} ms)`,
        scenario: "fast",
        message:
          "Strong connection measured end-to-end — payments should settle near-instantly.",
        detail: `${ping.ms} ms ping`,
      };
    }
    if (ping.ms < 900) {
      return {
        quality: "moderate",
        label: `Moderate (${ping.ms} ms)`,
        scenario: "auto",
        message:
          "Moderate connection measured — realistic simulation: settles in a few seconds, may occasionally decline.",
        detail: `${ping.ms} ms ping`,
      };
    }
    return {
      quality: "weak",
      label: `Weak (${ping.ms} ms)`,
      scenario: "slow",
      message:
        "High-latency connection measured — payments take the slow lane and may miss their window; GoPay auto-refunds them if they do.",
      detail: `${ping.ms} ms ping`,
    };
  }

  return {
    quality: "unknown",
    label: "Checking connection",
    scenario: "auto",
    message:
      "Still measuring this device’s connection — using the realistic default simulation for now.",
    detail: "no measurement yet",
  };
}

/** Shared singleton subscription: one probe loop for the whole app. */
export function useNetworkStatus(): NetworkStatus {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    ensureStarted();
    return () => {
      listeners.delete(force);
    };
  }, []);
  return computeStatus();
}
