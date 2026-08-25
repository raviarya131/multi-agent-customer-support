// Shared "customer mood" indicator. Renders a compact colored pill from a
// sentiment label (+ optional score / frustration / trend) so tone is visible
// consistently across the tickets, escalations, and observability surfaces.
import { Flame, Frown, Meh, Smile, TrendingDown, TrendingUp } from "lucide-react";

type Label = string | null | undefined;

function tone(label: Label) {
  switch (label) {
    case "angry":
      return { cls: "border-destructive/40 bg-destructive/10 text-destructive", Icon: Flame, text: "Angry" };
    case "frustrated":
      return { cls: "border-amber-500/40 bg-amber-500/10 text-amber-400", Icon: Frown, text: "Frustrated" };
    case "neutral":
      return { cls: "border-border bg-secondary/50 text-muted-foreground", Icon: Meh, text: "Neutral" };
    default:
      return { cls: "border-border bg-secondary/40 text-muted-foreground", Icon: Smile, text: "—" };
  }
}

export function SentimentBadge({
  label,
  score,
  frustration,
  trend,
  size = "sm",
}: {
  label: Label;
  score?: number | null;
  frustration?: boolean;
  trend?: "rising" | "steady" | "easing" | string | null;
  size?: "sm" | "xs";
}) {
  if (!label) return <span className="text-xs text-muted-foreground">—</span>;
  const { cls, Icon, text } = tone(label);
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  const Trend = trend === "rising" ? TrendingUp : trend === "easing" ? TrendingDown : null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${cls} ${pad}`}
      title={
        `Customer mood: ${text}` +
        (typeof score === "number" ? ` · score ${score}` : "") +
        (frustration ? " · frustration detected" : "") +
        (trend ? ` · ${trend}` : "")
      }
    >
      <Icon className="size-3" />
      {text}
      {typeof score === "number" && size !== "xs" && (
        <span className="tabular-nums opacity-70">{score.toFixed(2)}</span>
      )}
      {Trend && <Trend className="size-3 opacity-80" />}
    </span>
  );
}
