import {
  Ban,
  Gauge,
  Hourglass,
  Timer,
  WifiOff,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { SIMULATION_LABELS, simulationLabel } from "@/lib/simulation";

/** Presentation metadata (icons + taglines) for each simulated scenario.
 *  Labels come from src/lib/simulation.ts so server annotations and the UI
 *  always name a scenario identically. */

export interface ScenarioMeta {
  id: string;
  label: string;
  tagline: string;
  icon: LucideIcon;
}

const TAGLINES: Record<string, string> = {
  fast: "Settles in under a second.",
  auto: "Settles in 1–4s — occasionally declines.",
  slow: "Settles only after the refund window — gets refunded first.",
  race: "Settles right at the deadline — a coin flip with the timeout.",
  fail: "The issuing bank declines within a second.",
  stall: "Never responds — the auto-refund does the cleanup.",
};

export const SCENARIO_META: Record<string, ScenarioMeta> = {
  fast: { id: "fast", label: SIMULATION_LABELS.fast, tagline: TAGLINES.fast, icon: Zap },
  auto: { id: "auto", label: SIMULATION_LABELS.auto, tagline: TAGLINES.auto, icon: Timer },
  slow: { id: "slow", label: SIMULATION_LABELS.slow, tagline: TAGLINES.slow, icon: Hourglass },
  stall: { id: "stall", label: SIMULATION_LABELS.stall, tagline: TAGLINES.stall, icon: WifiOff },
  race: { id: "race", label: SIMULATION_LABELS.race, tagline: TAGLINES.race, icon: Gauge },
  fail: { id: "fail", label: SIMULATION_LABELS.fail, tagline: TAGLINES.fail, icon: Ban },
};

export { simulationLabel as scenarioLabel };
