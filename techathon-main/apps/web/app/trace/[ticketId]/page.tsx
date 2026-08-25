"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  GitBranch,
  Layers,
  Loader2,
  MessageSquare,
  Network,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { SentimentBadge } from "@/components/sentiment-badge";
import { getDashboardTicket } from "@/lib/api";
import { useRequireRole } from "@/lib/auth";
import type { TicketDashboardDetail, TicketRunRecord } from "@/lib/types";
import {
  AgentReportDetails,
  AuditList,
  DebugPanel,
  InvestigationSummary,
  KindTag,
  LifecycleStepper,
  RunTraceCard,
  StructuredResolutionDetails,
} from "@/components/views";
import { PipelineFlow } from "@/components/flow";

/**
 * Standalone, full-page trace viewer — opened in a new tab from the tickets,
 * escalations, and observability consoles. Shows the whole conversation's
 * pipeline runs end-to-end so the inline dashboards stay lightweight.
 *
 * Two-panel layout for the selected run:
 *   LEFT  — PipelineFlow (animated step graph)
 *   RIGHT — RunDetails (classification → decomposition → agents → investigation → resolution)
 * Below that: RunTraceCard list for all runs.
 */
export default function TracePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
          Loading trace…
        </div>
      }
    >
      <TraceView />
    </Suspense>
  );
}

type Tab = "flow" | "agents" | "audit";

function TraceView() {
  const account = useRequireRole("admin", "agent");
  const params = useParams<{ ticketId: string }>();
  const search = useSearchParams();
  const ticketId = decodeURIComponent(String(params?.ticketId ?? ""));
  const focusRun = search.get("run");

  const [detail, setDetail] = useState<TicketDashboardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("flow");

  useEffect(() => {
    if (!account || !ticketId) return;
    let alive = true;
    setLoading(true);
    getDashboardTicket(ticketId).then((d) => {
      if (alive) {
        setDetail(d);
        setLoading(false);
      }
    });
    return () => { alive = false; };
  }, [account, ticketId]);

  const focusIdx = useMemo(() => {
    if (!detail) return -1;
    if (focusRun) {
      const i = detail.runs.findIndex((r) => r.run_id === focusRun);
      if (i >= 0) return i;
    }
    return detail.runs.length - 1;
  }, [detail, focusRun]);

  const focusedRun: TicketRunRecord | null = detail?.runs?.[focusIdx] ?? null;
  const latest = focusedRun?.state ?? null;

  if (!account) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md">
        <Link href="/observability">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="size-4" /> Back
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Workflow className="size-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight">Pipeline trace</span>
        </div>
        {detail && (
          <span className="font-mono text-[11px] text-muted-foreground">{detail.ticket.display_id}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/?ticket=${ticketId}`} target="_blank">
            <Button variant="outline" size="sm" className="gap-1.5">
              <MessageSquare className="size-3.5" /> Conversation
            </Button>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading trace…
          </div>
        ) : !detail ? (
          <div className="py-24 text-center text-sm text-muted-foreground">
            Trace not found or you don&apos;t have access.
          </div>
        ) : (
          <>
            {/* Ticket summary band */}
            <div className="mb-6 rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <GitBranch className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h1 className="text-base font-semibold leading-tight">{detail.ticket.title}</h1>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {detail.ticket.customer_name}
                    {detail.ticket.customer_id ? ` (${detail.ticket.customer_id})` : " (guest)"} ·{" "}
                    {detail.ticket.message_count} msg · {detail.runs.length} run
                    {detail.runs.length === 1 ? "" : "s"} ·{" "}
                    {new Date(detail.ticket.created_at).toLocaleString()}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {detail.ticket.primary_intent && (
                      <Badge variant="outline">intent: {detail.ticket.primary_intent}</Badge>
                    )}
                    {detail.ticket.severity && (
                      <Badge variant="outline">severity: {detail.ticket.severity}</Badge>
                    )}
                    {detail.ticket.priority && <Badge variant="outline">{detail.ticket.priority}</Badge>}
                    {detail.ticket.sentiment && (
                      <SentimentBadge
                        label={detail.ticket.sentiment}
                        score={detail.ticket.sentiment_score}
                        frustration={detail.ticket.frustration}
                        size="xs"
                      />
                    )}
                    {detail.escalation && (
                      <Badge variant="destructive">escalated → {detail.escalation.assignee_name}</Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Lifecycle stepper */}
            {latest && (
              <section className="mb-6 rounded-2xl border border-border bg-card p-5">
                <LifecycleStepper s={latest} />
              </section>
            )}

            {/* ===== FOCUSED RUN VISUAL BREAKDOWN ===== */}
            {focusedRun && (
              <section className="mb-6 rounded-2xl border border-border bg-card">
                {/* Run selector + tab bar */}
                <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Network className="size-4 text-primary" />
                    <span className="text-sm font-semibold">
                      Run {focusIdx + 1} — Agent Collaboration Flow
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">{focusedRun.run_id}</span>
                  </div>

                  {/* Run picker */}
                  {detail.runs.length > 1 && (
                    <div className="flex gap-1 rounded-lg border border-border bg-secondary/40 p-0.5">
                      {detail.runs.map((r, i) => (
                        <Link
                          key={r.run_id}
                          href={`/trace/${encodeURIComponent(ticketId)}?run=${encodeURIComponent(r.run_id)}`}
                          className={
                            "rounded-md px-2 py-0.5 text-xs transition-colors " +
                            (i === focusIdx
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground")
                          }
                        >
                          #{i + 1}
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* Tab bar */}
                  <div className="ml-auto flex gap-1 rounded-lg border border-border bg-secondary/40 p-0.5">
                    {(["flow", "agents", "audit"] as Tab[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={
                          "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors " +
                          (tab === t
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground")
                        }
                      >
                        {t === "flow" ? "Pipeline Flow" : t === "agents" ? "Agents" : "Audit"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* TAB: FLOW — the visual pipeline graph + classification/decomp/severity breakdown */}
                {tab === "flow" && (
                  <div className="grid gap-0 md:grid-cols-[280px_1fr]">
                    {/* Left: pipeline step graph */}
                    <div className="border-b border-border md:border-b-0 md:border-r">
                      <div className="border-b border-border/60 px-4 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Pipeline steps
                        </p>
                      </div>
                      <PipelineFlow s={focusedRun.state} />
                    </div>

                    {/* Right: structured breakdown */}
                    <div className="overflow-auto p-5">
                      <RunVisualBreakdown run={focusedRun} />
                    </div>
                  </div>
                )}

                {/* TAB: AGENTS — full per-agent report cards */}
                {tab === "agents" && (
                  <div className="p-5">
                    {focusedRun.state.agent_reports && focusedRun.state.agent_reports.length > 0 ? (
                      <>
                        <p className="mb-3 text-xs text-muted-foreground">
                          {focusedRun.state.agent_reports.length} specialist agent
                          {focusedRun.state.agent_reports.length > 1 ? "s" : ""} ran in
                          parallel and contributed to this resolution.
                        </p>
                        {/* Fan-out + merge diagram */}
                        <FanOutDiagram run={focusedRun} />
                        <div className="mt-5 space-y-3">
                          {focusedRun.state.agent_reports.map((r) => (
                            <AgentReportDetails key={r.sub_problem_id + r.agent} report={r} />
                          ))}
                        </div>
                        {focusedRun.state.investigation && (
                          <div className="mt-4">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Merge result
                            </p>
                            <InvestigationSummary s={focusedRun.state} />
                          </div>
                        )}
                        {focusedRun.state.resolution && (
                          <div className="mt-4">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Unified resolution
                            </p>
                            <div className="rounded-lg border border-border bg-card/40 p-3">
                              <StructuredResolutionDetails s={focusedRun.state} />
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No agent reports for this run (greeting / FAQ / out-of-scope classification, no specialist needed).
                      </p>
                    )}
                  </div>
                )}

                {/* TAB: AUDIT — full audit trail + debug */}
                {tab === "audit" && (
                  <div className="p-5">
                    <p className="mb-3 text-xs text-muted-foreground">
                      Every decision the engine made, in order — which agent ran, what LLM returned, and how
                      long each step took. LLM tag = model was called; rule = deterministic heuristic.
                    </p>
                    <AuditList trail={focusedRun.audit_trail} />
                    <div className="mt-4">
                      <DebugPanel s={focusedRun.state} />
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* All runs list (collapsible) */}
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Layers className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">
                  All pipeline runs{" "}
                  <span className="text-xs font-normal text-muted-foreground">({detail.runs.length})</span>
                </h2>
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                Each customer message triggers one run. Expand any card to inspect agent investigations and the
                full audit trace. Click a run number above to open its visual flow.
              </p>
              <div className="space-y-3">
                {detail.runs.length === 0 && (
                  <p className="text-sm text-muted-foreground">No pipeline runs recorded.</p>
                )}
                {detail.runs.map((run, idx) => (
                  <RunTraceCard
                    key={run.run_id}
                    run={run}
                    index={idx + 1}
                    defaultOpen={idx === focusIdx}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

/** Structured breakdown panel (right side of the Flow tab). */
function RunVisualBreakdown({ run }: { run: TicketRunRecord }) {
  const s = run.state;
  const c = s.classification;
  const subs = s.sub_problems ?? [];
  const reports = s.agent_reports ?? [];
  const sev = s.severity;
  const esc = s.escalation;

  return (
    <div className="space-y-5 text-sm">
      {/* Classification */}
      {c && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Classification
          </p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            <Badge variant="secondary">{c.primary_intent}</Badge>
            {c.is_multi_issue && <Badge variant="outline">multi-issue</Badge>}
            {c.fallback && <Badge variant="warning">low-confidence fallback</Badge>}
            {c.category && c.category !== "support" && <Badge variant="outline">{c.category}</Badge>}
          </div>
          {c.intents.length > 0 && (
            <div className="space-y-1.5">
              {c.intents.map((i) => (
                <div key={i.type} className="grid grid-cols-[80px_1fr_36px] items-center gap-2">
                  <span className="truncate text-xs capitalize text-muted-foreground">{i.type}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-foreground/70"
                      style={{ width: `${Math.round(i.confidence * 100)}%` }}
                    />
                  </div>
                  <span className="text-right text-[11px] tabular-nums text-muted-foreground">
                    {Math.round(i.confidence * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Decomposition */}
      {subs.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Decomposition — {subs.length} sub-problem{subs.length > 1 ? "s" : ""}
          </p>
          <div className="space-y-1.5">
            {subs.map((sp) => (
              <div
                key={sp.id}
                className="flex items-center gap-2 rounded-md border border-border bg-card/50 px-2.5 py-2 text-xs"
              >
                <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px]">{sp.id}</span>
                <span className="text-muted-foreground">{sp.domain}</span>
                <span className="text-foreground/80">→</span>
                <span className="flex-1">{sp.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent summary */}
      {reports.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Specialist results
          </p>
          <div className="space-y-1.5">
            {reports.map((r) => (
              <div
                key={r.sub_problem_id + r.agent}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/50 px-2.5 py-2 text-xs"
              >
                <span className="font-medium capitalize">{r.agent}</span>
                <div className="flex items-center gap-1.5">
                  <Badge variant={r.status === "resolved" ? "success" : r.status === "unresolved" ? "destructive" : "warning"}>
                    {r.status}
                  </Badge>
                  <span className="text-muted-foreground">{Math.round((r.confidence ?? 0) * 100)}% conf.</span>
                  {r.duration_ms != null && (
                    <span className="text-muted-foreground">{r.duration_ms}ms</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sentiment + severity */}
      {(s.sentiment || sev) && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Tone · Severity · Priority
          </p>
          <div className="flex flex-wrap gap-1.5">
            {s.sentiment && <Badge variant="outline">mood: {s.sentiment.label}</Badge>}
            {s.sentiment?.frustration && <Badge variant="warning">frustrated</Badge>}
            {sev && <Badge variant={sev.level === "high" ? "destructive" : "secondary"}>severity: {sev.level}</Badge>}
            {sev && <Badge variant="outline">{sev.priority}</Badge>}
          </div>
          {sev && <p className="mt-1.5 text-xs text-muted-foreground">{sev.reasoning}</p>}
        </div>
      )}

      {/* Escalation */}
      {esc?.escalate && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-destructive/70">
            Escalated
          </p>
          <p className="text-sm font-medium">
            → {esc.recommended_team}
            {esc.urgency ? ` (${esc.urgency})` : ""}
          </p>
          {esc.assigned_agent && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Assigned to {esc.assigned_agent.name} · {esc.assigned_agent.title}
            </p>
          )}
          {esc.reason && <p className="mt-1 text-xs text-muted-foreground">{esc.reason}</p>}
        </div>
      )}
    </div>
  );
}

/** Visual fan-out → merge diagram for multi-agent runs. */
function FanOutDiagram({ run }: { run: TicketRunRecord }) {
  const reports = run.state.agent_reports ?? [];
  const subs = run.state.sub_problems ?? [];
  if (reports.length <= 1) return null;

  return (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Parallel fan-out → merge
      </p>
      <div className="flex items-stretch gap-3">
        {/* Input node */}
        <div className="flex shrink-0 items-center">
          <div className="rounded-lg border border-border bg-card px-3 py-2 text-center text-xs">
            <div className="font-mono text-[10px] text-muted-foreground">ticket</div>
            <div className="mt-0.5 max-w-[120px] truncate font-medium">{run.message.slice(0, 40)}</div>
          </div>
        </div>

        {/* Arrow + sub-problem labels */}
        <div className="flex flex-col items-center justify-center gap-1">
          {subs.length > 0
            ? subs.map((sp) => (
                <div key={sp.id} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="h-px w-6 bg-border" />
                  <span className="rounded bg-secondary px-1 py-px font-mono">{sp.domain}</span>
                </div>
              ))
            : reports.map((r) => (
                <div key={r.agent} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="h-px w-6 bg-border" />
                  <span className="capitalize">{r.agent}</span>
                </div>
              ))}
        </div>

        {/* Agent nodes */}
        <div className="flex flex-col gap-2">
          {reports.map((r) => (
            <div
              key={r.agent}
              className={
                "rounded-lg border px-3 py-1.5 text-xs " +
                (r.status === "resolved"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : r.status === "unresolved"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-400")
              }
            >
              <span className="font-medium capitalize">{r.agent}</span>
              <span className="ml-1.5 text-[10px] opacity-80">{Math.round((r.confidence ?? 0) * 100)}%</span>
              {r.duration_ms != null && (
                <span className="ml-1 text-[10px] opacity-60">{r.duration_ms}ms</span>
              )}
            </div>
          ))}
        </div>

        {/* Merge arrow */}
        <div className="flex items-center">
          <div className="flex flex-col items-center gap-0.5">
            {reports.map((_, i) => (
              <div key={i} className="h-px w-6 bg-border" />
            ))}
          </div>
        </div>

        {/* Merge node */}
        <div className="flex shrink-0 items-center">
          <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-center text-xs text-primary">
            <div className="text-[10px] opacity-70">merged</div>
            <div className="mt-0.5 font-medium">
              {run.state.investigation?.overall_status ?? "—"}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        All {reports.length} agents ran concurrently via{" "}
        <code className="rounded bg-secondary px-1">Promise.all</code>. Results merged by the
        Orchestrator before the Synthesizer composes the final reply.
      </p>
    </div>
  );
}
