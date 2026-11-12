/** Pure, dependency-free simulation scenario labels (safe on server + client). */

export const SIMULATION_LABELS: Record<string, string> = {
  auto: "Realistic mix",
  fast: "Near-instant",
  slow: "Slow network",
  stall: "Stalled",
  race: "Deadline race",
  fail: "Declined",
};

export function simulationLabel(id: string): string {
  return SIMULATION_LABELS[id] ?? id;
}
