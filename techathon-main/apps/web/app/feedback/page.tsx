"use client";
// Feedback dashboard — every thumbs up/down a customer left on an AI reply.
// Read-only review surface: KPIs, search, rating filter, and a detail table.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AdminHeader } from "@/components/admin-nav";
import { listFeedback } from "@/lib/api";
import { useRequireRole } from "@/lib/auth";
import type { FeedbackRow } from "@/lib/types";
import { SearchSelect } from "../platform/ui";

type RatingFilter = "all" | "up" | "down";

export default function FeedbackPage() {
  const account = useRequireRole("admin");
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RatingFilter>("all");
  const [deptFilter, setDeptFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await listFeedback());
    setLoading(false);
  }, []);
  useEffect(() => {
    if (account) void load();
  }, [account, load]);

  const stats = useMemo(() => {
    const up = rows.filter((r) => r.rating === "up").length;
    const down = rows.length - up;
    const pct = rows.length ? Math.round((up / rows.length) * 100) : 0;
    return { total: rows.length, up, down, pct };
  }, [rows]);

  const departments = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.department) s.add(r.department);
    return [...s].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.rating !== filter) return false;
      if (deptFilter !== "all" && r.department !== deptFilter) return false;
      if (!q) return true;
      return (
        r.customer_name?.toLowerCase().includes(q) ||
        r.display_id?.toLowerCase().includes(q) ||
        r.question?.toLowerCase().includes(q) ||
        r.answer?.toLowerCase().includes(q) ||
        r.comment?.toLowerCase().includes(q)
      );
    });
  }, [rows, query, filter, deptFilter]);

  if (!account) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdminHeader
        title="Feedback"
        subtitle="Thumbs up/down customers left on AI replies"
        role="admin"
        onRefresh={() => void load()}
        refreshing={loading}
      />

      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* KPIs — the first three pills double as rating filters. */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatPill label="Total ratings" value={stats.total} active={filter === "all"} onClick={() => setFilter("all")} />
          <StatPill label="Helpful" value={stats.up} tone="up" active={filter === "up"} onClick={() => setFilter("up")} />
          <StatPill label="Not helpful" value={stats.down} tone="down" active={filter === "down"} onClick={() => setFilter("down")} />
          <div className="flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2">
            <SatisfactionGauge pct={stats.pct} />
          </div>
        </div>

        {/* Controls */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by customer, ticket, question, answer…"
            className="input max-w-sm flex-1"
          />
          <div className="w-56">
            <SearchSelect
              options={[{ value: "all", label: "All departments" }, ...departments.map((d) => ({ value: d, label: d }))]}
              value={deptFilter}
              onSelect={(v) => setDeptFilter(v)}
              placeholder="All departments"
              searchPlaceholder="Search departments…"
              emptyText="No departments"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-medium">Rating</th>
                <th className="px-3 py-2 font-medium">Ticket</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Department</th>
                <th className="px-3 py-2 font-medium">Question</th>
                <th className="px-3 py-2 font-medium">AI answer</th>
                <th className="px-3 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/60 align-top last:border-0 hover:bg-secondary/20">
                  <td className="px-3 py-3">
                    {r.rating === "up" ? (
                      <span className="inline-flex items-center gap-1 text-emerald-500">
                        <ThumbsUp className="size-3.5" /> Helpful
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <ThumbsDown className="size-3.5" /> Not helpful
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant="outline">{r.display_id || "—"}</Badge>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{r.customer_name}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {r.department ? <Badge variant="outline">{r.department}</Badge> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="max-w-[260px] px-3 py-3 text-muted-foreground">
                    <p className="line-clamp-3">{r.question || "—"}</p>
                  </td>
                  <td className="max-w-[320px] px-3 py-3 text-muted-foreground">
                    <p className="line-clamp-3">{r.answer || "—"}</p>
                    {r.comment && (
                      <p className="mt-1 line-clamp-2 text-xs italic text-foreground/70">“{r.comment}”</p>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    No feedback yet. Ratings appear here as customers thumb replies up or down.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: string | number;
  tone?: "up" | "down";
  active?: boolean;
  onClick?: () => void;
}) {
  const color =
    tone === "up" ? "text-emerald-500" : tone === "down" ? "text-destructive" : "text-foreground";
  const ring = active ? "border-ring/70 ring-1 ring-ring/30" : "border-border hover:border-foreground/30";
  const body = (
    <>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={"mt-1 text-2xl font-semibold tabular-nums " + color}>{value}</p>
    </>
  );
  if (!onClick) {
    return <div className="rounded-xl border border-border bg-card px-4 py-3">{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={"rounded-xl border bg-card px-4 py-3 text-left transition-colors " + ring}
    >
      {body}
    </button>
  );
}

// Half-wheel gauge with a needle ("hand") pointing to the satisfaction %.
// 0% sits at the left, 100% at the right; the arc and needle are colored by score.
function SatisfactionGauge({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const cx = 100;
  const cy = 100;
  const r = 78;
  const color = clamped >= 75 ? "#10b981" : clamped >= 50 ? "#f59e0b" : "#ef4444";
  // Angle: 180° (left) at 0% → 0° (right) at 100%.
  const deg = 180 - (clamped / 100) * 180;
  const rad = (deg * Math.PI) / 180;
  const pt = (radius: number) => ({
    x: cx + radius * Math.cos(rad),
    y: cy - radius * Math.sin(rad),
  });
  const arcEnd = pt(r);
  const needle = pt(r * 0.74);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 116" className="w-full max-w-[170px]" role="img" aria-label={`Satisfaction ${clamped}%`}>
        {/* Track */}
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="currentColor" className="text-secondary" strokeWidth={12} strokeLinecap="round" />
        {/* Value arc */}
        {clamped > 0 && (
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${arcEnd.x.toFixed(2)} ${arcEnd.y.toFixed(2)}`} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" />
        )}
        {/* Needle */}
        <line x1={cx} y1={cy} x2={needle.x.toFixed(2)} y2={needle.y.toFixed(2)} stroke={color} strokeWidth={3} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={6} fill={color} />
        {/* Value */}
        <text x={cx} y={cy - 16} textAnchor="middle" className="fill-foreground" fontSize="26" fontWeight={700}>{clamped}%</text>
      </svg>
      <p className="-mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">Satisfaction</p>
    </div>
  );
}
