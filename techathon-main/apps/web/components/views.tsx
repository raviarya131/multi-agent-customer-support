"use client";
import { useState } from "react";
import { Bug, Check, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type {
  AgentReport,
  AuditEvent,
  PipelineState,
  PipelineStepId,
  RunProgress,
  StepKind,
  TicketRunRecord,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";

function statusVariant(status: string) {
  if (status === "resolved") return "success" as const;
  if (status === "failed" || status === "unresolved") return "destructive" as const;
  return "warning" as const;
}

/** Small chip marking whether a step reasoned with the LLM or a rule. */
export function KindTag({ kind }: { kind?: StepKind }) {
  if (!kind) return null;
  const llm = kind === "llm";
  return (
    <span
      className={
        "rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide " +
        (llm ? "bg-foreground text-background" : "border border-border text-muted-foreground")
      }
      title={llm ? "Reasoned with the LLM" : "Deterministic rule (no LLM)"}
    >
      {llm ? "LLM" : "rule"}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-4 last:border-b-0">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[80px_1fr_36px] items-center gap-2">
      <span className="truncate text-xs capitalize text-muted-foreground">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="text-right text-[11px] tabular-nums text-muted-foreground">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

function DetailList({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-xs text-muted-foreground">None reported.</p>;
  return (
    <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">
      {items.map((item, i) => (
        <li key={`${item}-${i}`}>{item}</li>
      ))}
    </ul>
  );
}

export function InvestigationSummary({ s }: { s: PipelineState }) {
  if (!s.investigation) return null;
  const conflicts = s.investigation.conflicts || [];
  return (
    <div className="rounded-md border border-border bg-card/40 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Merged investigation</span>
        <Badge
          variant={
            s.investigation.overall_status === "resolved"
              ? "success"
              : s.investigation.overall_status === "unresolved"
              ? "destructive"
              : "warning"
          }
        >
          {s.investigation.overall_status}
        </Badge>
        <span className="text-muted-foreground">
          {s.agent_reports?.length ?? 0} specialist report{(s.agent_reports?.length ?? 0) === 1 ? "" : "s"} merged
        </span>
      </div>
      {conflicts.length > 0 ? (
        <div className="mt-2 rounded border border-destructive/40 bg-destructive/5 p-2">
          <p className="font-medium text-foreground">Conflicts detected</p>
          <ul className="ml-4 mt-1 list-disc text-muted-foreground">
            {conflicts.map((c, i) => (
              <li key={`${c}-${i}`}>{c}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-muted-foreground">
          No conflicts were detected between specialist findings.
        </p>
      )}
    </div>
  );
}

export function AgentReportDetails({ report }: { report: AgentReport }) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-3 text-xs">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <strong className="capitalize">{report.agent} specialist</strong>
        <Badge variant={report.clarification_needed ? "warning" : statusVariant(report.status)}>
          {report.clarification_needed ? "needs clarification" : report.status}
        </Badge>
        <Badge variant="outline">confidence {Math.round((report.confidence ?? 0) * 100)}%</Badge>
        {report.duration_ms != null && <Badge variant="outline">{report.duration_ms}ms</Badge>}
      </div>

      {report.clarification_needed && report.clarification_question && (
        <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
          <p className="font-medium text-foreground">Clarifying question</p>
          <p className="mt-1 text-muted-foreground">{report.clarification_question}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Findings
          </p>
          <DetailList items={report.findings || []} />
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Actions
          </p>
          <DetailList items={report.actions || []} />
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Reasoning
        </p>
        <p className="rounded-md border border-border bg-background/50 p-2 text-muted-foreground">
          {report.reasoning || "No reasoning provided."}
        </p>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Evidence
        </p>
        {report.evidence?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {report.evidence.map((e, i) => (
              <code key={`${e}-${i}`} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">
                {e}
              </code>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No evidence cited.</p>
        )}
      </div>

      {report.trace?.length ? (
        <div className="mt-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Internal trace
          </p>
          <ol className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border bg-background/50 p-2">
            {report.trace.map((t, i) => (
              <li key={`${t.traceId}-${i}`} className="text-[11px] text-muted-foreground">
                <span className="font-mono">{new Date(t.ts).toLocaleTimeString()}</span>{" "}
                <Badge variant="outline">{t.node}</Badge>{" "}
                <span>{t.message}</span>
                {t.data && (
                  <pre className="mt-1 overflow-x-auto rounded bg-secondary/60 p-1 text-[10px]">
                    {JSON.stringify(t.data, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

export function StructuredResolutionDetails({ s }: { s: PipelineState }) {
  const res = s.resolution;
  if (!res) return null;
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Summary
        </p>
        <p className="text-sm">{res.summary}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Findings
          </p>
          <DetailList items={res.findings || []} />
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Actions
          </p>
          <DetailList items={res.actions || []} />
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Reasoning
        </p>
        <p className="rounded-md border border-border bg-card/40 p-2 text-xs text-muted-foreground">
          {res.reasoning || "No reasoning provided."}
        </p>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Evidence
        </p>
        {res.evidence?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {res.evidence.map((e, i) => (
              <code key={`${e}-${i}`} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">
                {e}
              </code>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No evidence cited.</p>
        )}
      </div>
    </div>
  );
}

/**
 * The analytical breakdown for one run — rendered in the right-hand panel.
 * Deliberately scoped to the "what was decided" views (classification,
 * decomposition, severity, escalation). The step-by-step activity + audit trail
 * live inline in the chat instead (see ChatActivity).
 */
export function RunDetails({ s }: { s: PipelineState }) {
  const c = s.classification;
  const subs = s.sub_problems || [];
  const reports = s.agent_reports || [];
  const sev = s.severity;
  const esc = s.escalation;
  const res = s.resolution;

  return (
    <div className="text-sm">
      <Section title="Snapshot">
        <div className="flex flex-wrap gap-1.5">
          {c && <Badge variant="secondary">{c.primary_intent}</Badge>}
          {c?.is_multi_issue && <Badge variant="outline">multi-issue</Badge>}
          {c?.fallback && <Badge variant="warning">fallback</Badge>}
          {sev && <Badge variant={sev.level === "high" ? "destructive" : "secondary"}>severity {sev.level}</Badge>}
          {sev && <Badge variant="outline">{sev.priority}</Badge>}
          {esc?.escalate && <Badge variant="destructive">escalated</Badge>}
          {s.guard?.force_escalation && <Badge variant="destructive">hard signal</Badge>}
        </div>
      </Section>

      {s.guard?.force_escalation && (
        <Section title="Guard">
          <p className="text-muted-foreground">
            {s.guard.reason}
            {s.guard.matched_phrase ? (
              <>
                {" "}— <code className="rounded bg-secondary px-1.5 py-0.5">{s.guard.matched_phrase}</code>
              </>
            ) : null}
          </p>
        </Section>
      )}

      {c && c.intents.length > 0 && (
        <Section title="Classification">
          {c.fallback && (
            <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
              <p className="font-medium text-foreground">Low confidence fallback</p>
              <p className="mt-1 text-muted-foreground">
                Routed to Policy for review instead of guessing a specialist.
              </p>
            </div>
          )}
          <div className="space-y-2">
            {c.intents.map((i) => (
              <Bar key={i.type} label={i.type} value={i.confidence} />
            ))}
          </div>
        </Section>
      )}

      {subs.length > 0 && (
        <Section title={subs.length > 1 ? `Decomposition · ${subs.length} sub-problems` : "Decomposition"}>
          <div className="space-y-1.5">
            {subs.map((sp) => (
              <div key={sp.id} className="flex gap-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{sp.id}</span>
                <span className="text-muted-foreground">{sp.domain}:</span>
                <span className="flex-1">{sp.description}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {reports.length > 0 && (
        <Section title={reports.length > 1 ? `Specialist Reports · ${reports.length}` : "Specialist Report"}>
          <div className="space-y-3">
            {reports.map((r) => (
              <AgentReportDetails key={r.sub_problem_id + r.agent} report={r} />
            ))}
          </div>
        </Section>
      )}

      {s.investigation && (
        <Section title="Investigation Merge">
          <InvestigationSummary s={s} />
        </Section>
      )}

      {(sev || s.sentiment) && (
        <Section title="Sentiment · Severity · Escalation">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {s.sentiment && <Badge variant="outline">tone: {s.sentiment.label}</Badge>}
            {sev && <Badge variant="outline">severity: {sev.level}</Badge>}
            {sev && <Badge variant="outline">priority: {sev.priority}</Badge>}
          </div>
          {sev && <p className="text-xs text-muted-foreground">{sev.reasoning}</p>}
          {esc?.escalate && (
            <div className="mt-2 rounded-md border border-foreground/40 p-3">
              <div className="text-sm font-medium">
                Escalation → {esc.recommended_team} ({esc.urgency})
              </div>
              {esc.assigned_agent && (
                <p className="mt-1 text-xs">
                  Assigned to <span className="font-medium">{esc.assigned_agent.name}</span> ·{" "}
                  {esc.assigned_agent.title} · {esc.assigned_agent.department}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{esc.reason}</p>
              {esc.internal_actions?.length ? (
                <ul className="ml-4 mt-1.5 list-disc text-xs text-muted-foreground">
                  {esc.internal_actions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </Section>
      )}

      {res && (
        <Section title="Structured Resolution">
          <StructuredResolutionDetails s={s} />
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lifecycle stepper — the vertical "where is this ticket in its journey" path.
// Shown to both users and admins. Derives stages from the latest run state.
// ---------------------------------------------------------------------------

type StageTone = "neutral" | "red" | "green";

export function LifecycleStepper({ s }: { s: PipelineState }) {
  const escalated = !!s.escalation?.escalate;
  const resolved = s.investigation?.overall_status === "resolved" && !escalated;

  const stages: { label: string; done: boolean; hint?: string; tone?: StageTone }[] = [
    { label: "Created", done: true },
    {
      label: "Understood",
      done: !!s.classification,
      hint: s.classification?.primary_intent,
    },
    {
      label: "Investigated",
      done: (s.agent_reports?.length ?? 0) > 0 || !!s.investigation,
      hint: s.investigation?.overall_status,
    },
    {
      label: "Assessed",
      done: !!s.severity,
      hint: s.severity ? `${s.severity.level} · ${s.severity.priority}` : undefined,
    },
    {
      label: escalated ? "Escalated to human" : resolved ? "Resolved" : "Awaiting outcome",
      done: escalated || resolved,
      hint: escalated ? s.escalation?.recommended_team ?? undefined : undefined,
      tone: escalated ? "red" : resolved ? "green" : "neutral",
    },
  ];

  // The "current" stage is the last one that's done.
  let currentIdx = 0;
  stages.forEach((st, i) => {
    if (st.done) currentIdx = i;
  });

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Lifecycle
      </p>
      <div>
        {stages.map((st, idx) => {
          const isCurrent = idx === currentIdx;
          const last = idx === stages.length - 1;
          const toneRing =
            st.tone === "red"
              ? "border-red-500 text-red-600"
              : st.tone === "green"
                ? "border-emerald-500 text-emerald-600"
                : "border-foreground text-foreground";
          return (
            <div key={st.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                {st.done ? (
                  <span
                    className={
                      "flex size-5 items-center justify-center rounded-full " +
                      (isCurrent
                        ? `border-2 ${toneRing} bg-background`
                        : "bg-foreground text-background")
                    }
                  >
                    <Check className="size-3" />
                  </span>
                ) : (
                  <span className="flex size-5 items-center justify-center rounded-full border border-border">
                    <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                  </span>
                )}
                {!last && <span className="w-px flex-1 bg-border" style={{ minHeight: 20 }} />}
              </div>
              <div className={"flex-1 pb-4 " + (st.done ? "" : "opacity-50")}>
                <p
                  className={
                    "text-sm " +
                    (isCurrent ? "font-semibold text-foreground" : "font-medium text-foreground/90")
                  }
                >
                  {st.label}
                  {isCurrent && <span className="ml-2 text-[10px] text-muted-foreground">current</span>}
                </p>
                {st.hint && <p className="mt-0.5 text-xs capitalize text-muted-foreground">{st.hint}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Developer debug — per-step timings + the raw run state JSON.
// ---------------------------------------------------------------------------

export function DebugPanel({ s }: { s: PipelineState }) {
  const [open, setOpen] = useState(false);
  const trail = s.audit_trail || [];
  const t0 = trail.length ? new Date(trail[0].timestamp).getTime() : 0;
  const tEnd = trail.length ? new Date(trail[trail.length - 1].timestamp).getTime() : 0;
  const totalMs = tEnd - t0;

  return (
    <div className="rounded-md border border-dashed border-border bg-card/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Bug className="size-3.5" />
        <span className="font-medium">Developer debug</span>
        {totalMs > 0 && <span className="text-[10px]">· {totalMs}ms total</span>}
        <ChevronRight className={"ml-auto size-3.5 transition-transform " + (open ? "rotate-90" : "")} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {trail.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Step timings
              </p>
              <div className="space-y-1">
                {trail.map((e, i) => {
                  const at = new Date(e.timestamp).getTime();
                  const prev = i > 0 ? new Date(trail[i - 1].timestamp).getTime() : at;
                  const delta = at - prev;
                  return (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-[11px]"
                    >
                      <span className="truncate text-muted-foreground">
                        <span className="font-medium text-foreground">{e.actor}</span> · {e.step}
                      </span>
                      <KindTag kind={e.kind} />
                      <span className="tabular-nums text-muted-foreground">+{delta}ms</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Raw run state
            </p>
            <pre className="max-h-72 overflow-auto rounded bg-background/70 p-2 text-[10px] leading-relaxed text-muted-foreground">
              {JSON.stringify(s, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline (in-chat) activity — the Cursor-style "what the agents did" log.
// ---------------------------------------------------------------------------

export const PIPELINE_STEPS: { id: PipelineStepId; label: string; kind: StepKind }[] = [
  { id: "guard", label: "Screening for hard signals", kind: "heuristic" },
  { id: "classify", label: "Classifying intent", kind: "llm" },
  { id: "sentiment", label: "Reading sentiment", kind: "heuristic" },
  { id: "decompose", label: "Splitting into sub-problems", kind: "llm" },
  { id: "investigate", label: "Specialist agents investigating", kind: "llm" },
  { id: "severity", label: "Assessing severity", kind: "heuristic" },
  { id: "escalation", label: "Checking escalation", kind: "heuristic" },
  { id: "synthesize", label: "Composing your reply", kind: "llm" },
];

function stepStatus(
  id: PipelineStepId,
  progress: RunProgress
): "done" | "running" | "idle" {
  if (progress.completedSteps.includes(id)) return "done";
  if (progress.activeStep === id) return "running";
  return "idle";
}

/** Live stepper driven by real SSE events (not a fake timer). */
export function LiveSteps({ progress }: { progress: RunProgress }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="space-y-1.5">
        {PIPELINE_STEPS.map((step) => {
          const status = stepStatus(step.id, progress);
          const done = status === "done";
          const active = status === "running";
          const agents =
            step.id === "investigate" && progress.agentsDone.length > 0
              ? ` (${progress.agentsDone.join(", ")})`
              : "";
          return (
            <div key={step.id} className="flex items-center gap-2 text-xs">
              <span className="flex size-4 shrink-0 items-center justify-center">
                {done ? (
                  <Check className="size-3.5 text-foreground" />
                ) : active ? (
                  <Loader2 className="size-3.5 animate-spin text-foreground" />
                ) : (
                  <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                )}
              </span>
              <span className={done || active ? "text-foreground" : "text-muted-foreground/50"}>
                {step.label}
                {agents}
              </span>
              {(done || active) && <KindTag kind={step.kind} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Audit trail that grows in real time while the pipeline runs. */
export function LiveAuditTrail({ audit }: { audit: AuditEvent[] }) {
  if (!audit.length) return null;
  return (
    <div className="mt-2 rounded-lg border border-border bg-card/40 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Live trace
      </p>
      <ol className="max-h-48 space-y-2 overflow-y-auto">
        {audit.map((e, i) => (
          <li key={i} className="text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-muted-foreground">
                {new Date(e.timestamp).toLocaleTimeString()}
              </span>
              <KindTag kind={e.kind} />
              <span className="font-medium">{e.actor}</span>
            </div>
            <p className="mt-0.5 text-muted-foreground">{e.summary}</p>
            {e.detail && (
              <p className="mt-0.5 border-l border-border pl-2 italic text-muted-foreground/80">
                {e.detail}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Collapsible trace attached to a reply: which agents ran + the audit trail. */
export function ChatActivity({ s }: { s: PipelineState }) {
  const [open, setOpen] = useState(false);
  const reports = s.agent_reports || [];
  const trail = s.audit_trail || [];
  const agentCount = reports.length;

  return (
    <div className="rounded-lg border border-border bg-card/50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight className={"size-3.5 transition-transform " + (open ? "rotate-90" : "")} />
        <span className="font-medium">
          Worked across {agentCount || "the"} {agentCount === 1 ? "agent" : "agents"} · {trail.length} steps
        </span>
        <span className="ml-auto flex flex-wrap justify-end gap-1">
          {reports.map((r) => (
            <Badge key={r.sub_problem_id + r.agent} variant={statusVariant(r.status)}>
              {r.agent}
            </Badge>
          ))}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {reports.length > 0 && (
            <div className="space-y-2">
              {reports.map((r) => (
                <AgentReportDetails key={r.sub_problem_id + r.agent} report={r} />
              ))}
            </div>
          )}

          {trail.length > 0 && (
            <ol className="space-y-2.5 border-t border-border pt-3">
              {trail.map((e, i) => (
                <li key={i} className="text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-muted-foreground">
                      {new Date(e.timestamp).toLocaleTimeString()}
                    </span>
                    <KindTag kind={e.kind} />
                    <span className="font-medium">{e.actor}</span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">{e.summary}</p>
                  {e.detail && (
                    <p className="mt-0.5 border-l border-border pl-2 italic text-muted-foreground/80">
                      {e.detail}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

/** Flat list of audit events for one run (timestamp · kind · actor · summary). */
export function AuditList({ trail }: { trail: AuditEvent[] }) {
  if (!trail.length) return <p className="text-xs text-muted-foreground">No audit events.</p>;
  return (
    <ol className="space-y-2">
      {trail.map((e, i) => (
        <li key={i} className="rounded-lg border border-border/60 bg-background/50 p-2.5 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-muted-foreground">
              {new Date(e.timestamp).toLocaleTimeString()}
            </span>
            <KindTag kind={e.kind} />
            <span className="font-medium">{e.actor}</span>
          </div>
          <p className="mt-0.5 text-muted-foreground">{e.summary}</p>
          {e.detail && (
            <p className="mt-1 border-l border-border pl-2 italic text-muted-foreground/80">{e.detail}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * Collapsible card for a single pipeline run — agent reports, investigation
 * merge, structured resolution, full audit trace, and raw debug. Shared by the
 * ops dashboard and the escalation case view so a human agent sees everything.
 */
export function RunTraceCard({
  run,
  index,
  defaultOpen,
}: {
  run: TicketRunRecord;
  index: number;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm transition-colors hover:bg-secondary/30"
      >
        <ChevronDown
          className={"size-4 shrink-0 text-muted-foreground transition-transform " + (open ? "" : "-rotate-90")}
        />
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-secondary text-[10px] font-semibold tabular-nums">
          {index}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {run.message.slice(0, 70)}
          {run.message.length > 70 ? "…" : ""}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {new Date(run.created_at).toLocaleTimeString()}
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] text-muted-foreground/60">{run.run_id}</span>
            {run.primary_intent && <Badge variant="outline">{run.primary_intent}</Badge>}
            {run.severity && <Badge variant="outline">severity {run.severity}</Badge>}
            {run.priority && <Badge variant="outline">{run.priority}</Badge>}
            {run.escalated && <Badge variant="destructive">escalated</Badge>}
          </div>

          {run.agent_reports.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Agent reports
              </p>
              <div className="space-y-2">
                {run.agent_reports.map((r) => (
                  <AgentReportDetails key={r.sub_problem_id + r.agent} report={r} />
                ))}
              </div>
            </div>
          )}

          {run.state.investigation && (
            <div className="mb-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Investigation merge
              </p>
              <InvestigationSummary s={run.state} />
            </div>
          )}

          {run.state.resolution && (
            <div className="mb-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Structured resolution
              </p>
              <div className="rounded-lg border border-border bg-card/40 p-3">
                <StructuredResolutionDetails s={run.state} />
              </div>
            </div>
          )}

          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Audit trace ({run.audit_trail.length} steps)
          </p>
          <AuditList trail={run.audit_trail} />

          <div className="mt-3">
            <DebugPanel s={run.state} />
          </div>
        </div>
      )}
    </div>
  );
}
