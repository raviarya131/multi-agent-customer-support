"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bot,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Cpu,
  ExternalLink,
  Gauge,
  Layers,
  Loader2,
  Radio,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetBody, SheetHeader } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeader } from "@/components/admin-nav";
import { getRunSession, listRunSessions } from "@/lib/api";
import { SentimentBadge } from "@/components/sentiment-badge";
import { PipelineFlow } from "@/components/flow";
import { useRequireRole } from "@/lib/auth";
import type { RunSessionDetail, RunSessionRow } from "@/lib/types";

type CategoryFilter = "all" | "support" | "greeting" | "out_of_scope" | "faq";
type OutcomeFilter = "all" | "escalated" | "resolved" | "open";

const PAGE_SIZE = 15;

function relativeTime(iso: string) {
  const diff = Date.now() - +new Date(iso);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Color of the left status rail + dot for a session row. */
function railTone(r: RunSessionRow): { rail: string; dot: string; label: string } {
  if (r.escalated || r.guard_flagged)
    return { rail: "bg-destructive", dot: "bg-destructive", label: "escalated" };
  if (r.overall_status === "resolved")
    return { rail: "bg-emerald-500", dot: "bg-emerald-500", label: "resolved" };
  if (r.category === "greeting" || r.category === "out_of_scope" || r.category === "faq")
    return { rail: "bg-muted-foreground/40", dot: "bg-muted-foreground/50", label: r.category };
  return { rail: "bg-amber-500", dot: "bg-amber-500", label: r.overall_status ?? "handled" };
}

function categoryTone(c: string | null) {
  if (c === "greeting") return "border-sky-500/30 bg-sky-500/10 text-sky-300";
  if (c === "out_of_scope") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (c === "faq") return "border-violet-500/30 bg-violet-500/10 text-violet-300";
  if (c === "support") return "border-primary/30 bg-primary/10 text-primary";
  return "border-border bg-secondary/40 text-muted-foreground";
}

export default function ObservabilityPage() {
  const account = useRequireRole("admin");
  const [runs, setRuns] = useState<RunSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [page, setPage] = useState(0);

  const [selected, setSelected] = useState<RunSessionRow | null>(null);
  const [detail, setDetail] = useState<RunSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = async (soft = false) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    const data = await listRunSessions();
    setRuns(data);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    if (account) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    getRunSession(selected.run_id).then((d) => {
      if (alive) {
        setDetail(d);
        setDetailLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return runs.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (outcome === "escalated" && !(r.escalated || r.guard_flagged)) return false;
      if (outcome === "resolved" && r.overall_status !== "resolved") return false;
      if (outcome === "open" && (r.escalated || r.overall_status === "resolved")) return false;
      if (!q) return true;
      return (
        r.message.toLowerCase().includes(q) ||
        r.run_id.toLowerCase().includes(q) ||
        r.display_id.toLowerCase().includes(q) ||
        r.customer_name.toLowerCase().includes(q) ||
        (r.primary_intent ?? "").toLowerCase().includes(q)
      );
    });
  }, [runs, query, category, outcome]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => setPage(0), [query, category, outcome]);

  const stats = useMemo(() => {
    const total = runs.length;
    const escalated = runs.filter((r) => r.escalated || r.guard_flagged).length;
    const multi = runs.filter((r) => r.is_multi_issue).length;
    const llm = runs.reduce((a, r) => a + r.llm_steps, 0);
    const avgSteps = total ? Math.round(runs.reduce((a, r) => a + r.step_count, 0) / total) : 0;
    return { total, escalated, multi, llm, avgSteps };
  }, [runs]);

  if (!account) return null;

  return (
    <div className="flex h-screen flex-col bg-background">
      <AdminHeader
        title="Observability"
        subtitle="Agent run sessions"
        role={account.role}
        onRefresh={() => load(true)}
        refreshing={refreshing}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-6">
          {/* Telemetry stat band */}
          <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            <StatPill icon={Radio} label="Sessions" value={stats.total} tone="text-foreground" />
            <StatPill icon={AlertTriangle} label="Escalated" value={stats.escalated} tone="text-destructive" />
            <StatPill icon={Layers} label="Multi-issue" value={stats.multi} tone="text-amber-400" />
            <StatPill icon={Cpu} label="LLM calls" value={stats.llm} tone="text-primary" />
            <StatPill icon={Gauge} label="Avg steps" value={stats.avgSteps} tone="text-emerald-400" />
          </div>

          {/* Filter bar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search message, intent, session id, customer…"
                className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <Segmented<CategoryFilter>
              value={category}
              onChange={setCategory}
              options={[
                { v: "all", label: "All" },
                { v: "support", label: "Support" },
                { v: "greeting", label: "Greeting" },
                { v: "faq", label: "FAQ" },
                { v: "out_of_scope", label: "Off-topic" },
              ]}
            />
            <Segmented<OutcomeFilter>
              value={outcome}
              onChange={setOutcome}
              options={[
                { v: "all", label: "Any" },
                { v: "escalated", label: "Escalated" },
                { v: "resolved", label: "Resolved" },
                { v: "open", label: "Open" },
              ]}
            />
          </div>

          {/* Sessions console */}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="hidden grid-cols-[14px_minmax(0,1fr)_120px_120px_150px_92px] items-center gap-3 border-b border-border bg-secondary/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
              <span />
              <span>Session</span>
              <span>Category</span>
              <span>Sentiment</span>
              <span>Signals</span>
              <span className="text-right">When</span>
            </div>

            {loading ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-3">
                    <Skeleton className="h-9 w-1 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : pageRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
                <Activity className="size-7 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No sessions match these filters.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {pageRows.map((r) => {
                  const tone = railTone(r);
                  return (
                    <button
                      key={r.run_id}
                      onClick={() => setSelected(r)}
                      className="grid w-full grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-secondary/30 md:grid-cols-[14px_minmax(0,1fr)_120px_120px_150px_92px]"
                    >
                      <span className={"h-9 w-1 shrink-0 rounded-full " + tone.rail} />

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground">{r.display_id}</span>
                          {r.is_multi_issue && (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-300">
                              multi
                            </span>
                          )}
                          {r.primary_intent && (
                            <span className="truncate text-[11px] text-muted-foreground/80">
                              {r.primary_intent}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-sm text-foreground">
                          {r.message || <span className="text-muted-foreground italic">empty message</span>}
                        </p>
                      </div>

                      <div className="hidden md:block">
                        <span
                          className={
                            "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium " +
                            categoryTone(r.category)
                          }
                        >
                          {r.category ?? "—"}
                        </span>
                      </div>

                      <div className="hidden md:block">
                        <SentimentBadge
                          label={r.sentiment}
                          score={r.sentiment_score}
                          frustration={r.frustration}
                          trend={r.sentiment_trend}
                          size="xs"
                        />
                      </div>

                      <div className="hidden items-center gap-1.5 md:flex">
                        <Signal icon={Bot} value={r.agent_count} title="specialist agents" />
                        <Signal icon={Boxes} value={r.step_count} title="pipeline steps" />
                        <Signal icon={Cpu} value={r.llm_steps} title="LLM calls" tone="text-primary" />
                      </div>

                      <div className="ml-auto flex items-center gap-2 md:ml-0 md:justify-end">
                        <span className="hidden text-[11px] text-muted-foreground md:inline">
                          {relativeTime(r.created_at)}
                        </span>
                        <span className={"size-1.5 shrink-0 rounded-full " + tone.dot} title={tone.label} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          {!loading && filtered.length > 0 && (
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length} sessions
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="size-8 p-0"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="tabular-nums">
                  {safePage + 1} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="size-8 p-0"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && (
          <RunDetail row={selected} detail={detail} loading={detailLoading} />
        )}
      </Sheet>
    </div>
  );
}

function StatPill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-secondary/50">
        <Icon className={"size-4 " + tone} />
      </span>
      <div className="leading-tight">
        <div className={"text-lg font-semibold tabular-nums " + tone}>{value}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string }[];
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
            (value === o.v
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Signal({
  icon: Icon,
  value,
  title,
  tone = "text-muted-foreground",
}: {
  icon: typeof Activity;
  value: number;
  title: string;
  tone?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-md bg-secondary/40 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-foreground"
    >
      <Icon className={"size-3 " + tone} />
      {value}
    </span>
  );
}

function RunDetail({
  row,
  detail,
  loading,
}: {
  row: RunSessionRow;
  detail: RunSessionDetail | null;
  loading: boolean;
}) {
  const s = detail?.state;
  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Sparkles className="size-4" />
          </span>
          <div className="leading-tight">
            <h2 className="text-sm font-semibold">Session {row.display_id}</h2>
            <p className="font-mono text-[10px] text-muted-foreground">{row.run_id}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {row.customer_name} · {new Date(row.created_at).toLocaleString()}
        </p>
        <div className="mt-3">
          <Link href={`/trace/${encodeURIComponent(row.ticket_id)}?run=${encodeURIComponent(row.run_id)}`} target="_blank">
            <Button size="sm" className="gap-1.5">
              <ExternalLink className="size-3.5" /> Open full trace in new tab
            </Button>
          </Link>
        </div>
      </SheetHeader>

      <SheetBody>
        {/* Trigger message */}
        <section className="mb-5">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Trigger message
          </p>
          <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2.5 text-sm leading-relaxed">
            {row.message || <span className="italic text-muted-foreground">empty</span>}
          </div>
        </section>

        {/* Signals grid */}
        <section className="mb-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Signals
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field label="Category" value={row.category ?? "—"} />
            <Field label="Intent" value={row.primary_intent ?? "—"} />
            <Field label="Multi-issue" value={row.is_multi_issue ? "yes" : "no"} />
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Customer mood</div>
              <div className="mt-1">
                <SentimentBadge
                  label={s?.sentiment?.label ?? row.sentiment}
                  score={s?.sentiment?.score ?? row.sentiment_score}
                  frustration={s?.sentiment?.frustration ?? row.frustration}
                  trend={s?.sentiment?.trend ?? row.sentiment_trend}
                />
              </div>
              {s?.sentiment?.drivers?.length ? (
                <div className="mt-1.5 text-[11px] text-muted-foreground">{s.sentiment.drivers.join(" · ")}</div>
              ) : null}
            </div>
            <Field label="Severity" value={row.severity ?? "—"} />
            <Field label="Priority" value={row.priority ?? "—"} />
            <Field label="Agents" value={String(row.agent_count)} />
            <Field label="Steps" value={String(row.step_count)} />
            <Field label="LLM calls" value={String(row.llm_steps)} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(row.escalated || row.guard_flagged) && <Badge variant="destructive">escalated</Badge>}
            {row.guard_flagged && <Badge variant="outline">guard flagged</Badge>}
            {row.overall_status && <Badge variant="outline">{row.overall_status}</Badge>}
          </div>
        </section>

        {loading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading run detail…
          </div>
        )}

        {s && (
          <>
            {s.sub_problems && s.sub_problems.length > 0 && (
              <section className="mb-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Decomposed sub-problems ({s.sub_problems.length})
                </p>
                <div className="space-y-1.5">
                  {s.sub_problems.map((sp) => (
                    <div key={sp.id} className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
                      <span className="mr-2 font-mono text-[10px] text-muted-foreground">{sp.domain}</span>
                      {sp.description}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Pipeline flow visualization */}
            <section className="mb-5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pipeline flow
              </p>
              <div className="rounded-xl border border-border bg-card/40">
                <PipelineFlow s={s} />
              </div>
            </section>

            {s.agent_reports && s.agent_reports.length > 0 && (
              <section className="mb-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Agent verdicts
                </p>
                <div className="space-y-1.5">
                  {s.agent_reports.map((a) => (
                    <div
                      key={a.sub_problem_id + a.agent}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs"
                    >
                      <span className="flex items-center gap-1.5">
                        <Bot className="size-3.5 text-primary" />
                        <span className="font-medium capitalize">{a.agent}</span>
                      </span>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Badge variant={a.status === "resolved" ? "success" : a.status === "unresolved" ? "destructive" : "warning"}>
                          {a.status}
                        </Badge>
                        <span className="font-mono tabular-nums">
                          {Math.round((a.confidence ?? 0) * 100)}%
                        </span>
                        {a.duration_ms != null && <span>{a.duration_ms}ms</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {s.resolution?.summary && (
              <section className="mb-2">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Resolution summary
                </p>
                <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-sm leading-relaxed">
                  {s.resolution.summary}
                </div>
              </section>
            )}
          </>
        )}
      </SheetBody>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium capitalize">{value}</div>
    </div>
  );
}
