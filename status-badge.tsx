import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Undo2,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export interface StateVisual {
  icon: LucideIcon;
  label: string;
  pill: string; // pill styling
  dot: string; // timeline dot styling
}

export function stateVisual(state: string, delayed = false): StateVisual {
  if (delayed && (state === "initiated" || state === "pending")) {
    return {
      icon: AlertTriangle,
      label: "Delayed",
      pill: "border-rose-200 bg-rose-50 text-rose-700",
      dot: "border-rose-200 bg-rose-50 text-rose-600",
    };
  }
  switch (state) {
    case "completed":
      return {
        icon: CheckCircle2,
        label: "Completed",
        pill: "border-emerald-200 bg-emerald-50 text-emerald-700",
        dot: "border-emerald-200 bg-emerald-50 text-emerald-600",
      };
    case "refunded":
      return {
        icon: Undo2,
        label: "Refunded",
        pill: "border-accent/25 bg-accent/5 text-accent",
        dot: "border-accent/25 bg-accent/5 text-accent",
      };
    case "failed":
      return {
        icon: XCircle,
        label: "Failed",
        pill: "border-rose-200 bg-rose-50 text-rose-700",
        dot: "border-rose-200 bg-rose-50 text-rose-600",
      };
    case "pending":
      return {
        icon: Clock3,
        label: "Pending",
        pill: "border-amber-200 bg-amber-50 text-amber-700",
        dot: "border-amber-200 bg-amber-50 text-amber-600",
      };
    default:
      return {
        icon: CircleDashed,
        label: "Initiated",
        pill: "border-gray-200 bg-gray-50 text-gray-600",
        dot: "border-gray-200 bg-gray-50 text-gray-500",
      };
  }
}

export function StatusBadge({
  state,
  delayed = false,
}: {
  state: string;
  delayed?: boolean;
}) {
  const visual = stateVisual(state, delayed);
  const Icon = visual.icon;
  const pulsing = visual.label === "Pending" || visual.label === "Delayed";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${visual.pill}`}
    >
      <Icon className={`size-3.5 ${pulsing ? "animate-pulse" : ""}`} />
      {visual.label}
    </span>
  );
}
