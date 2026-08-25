"use client";
import { Check, Loader2 } from "lucide-react";
import type { PipelineState, PipelineStepId, RunProgress } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { KindTag, PIPELINE_STEPS } from "@/components/views";

function statusVariant(status: string) {
  if (status === "resolved") return "success" as const;
  if (status === "failed" || status === "unresolved") return "destructive" as const;
  return "warning" as const;
}

function stepStatus(
  id: PipelineStepId,
  progress: RunProgress | null,
  loading: boolean
): "done" | "running" | "idle" {
  if (!loading && !progress) return "idle";
  if (progress) {
    if (progress.completedSteps.includes(id)) return "done";
    if (progress.activeStep === id) return "running";
    return "idle";
  }
  return "idle";
}

function detailFor(id: PipelineStepId, s?: PipelineState, progress?: RunProgress): string {
  const snap = progress?.snapshot ?? s;
  if (!snap) return "";
  switch (id) {
    case "guard":
      return snap.guard
        ? snap.guard.force_escalation
          ? `forced — "${snap.guard.matched_phrase}"`
          : "no hard signal"
        : "";
    case "classify":
      return snap.classification
        ? `${snap.classification.primary_intent}${snap.classification.fallback ? " (fallback)" : ""}`
        : "";
    case "sentiment":
      return snap.sentiment ? `${snap.sentiment.label} (${snap.sentiment.score})` : "";
    case "decompose": {
      const n = snap.sub_problems?.length ?? 0;
      return n > 1 ? `${n} sub-problems` : n === 1 ? `1 → ${snap.sub_problems![0].domain}` : "";
    }
    case "investigate": {
      const done = progress?.agentsDone.length ?? 0;
      const total = snap.sub_problems?.length ?? snap.agent_reports?.length ?? 0;
      if (done && total && done < total) return `${done}/${total} agents finished…`;
      const n = snap.agent_reports?.length ?? 0;
      return n ? `${n} agent${n === 1 ? "" : "s"} in parallel` : done ? `${done} agent(s)` : "";
    }
    case "severity":
      return snap.severity ? `${snap.severity.level} / ${snap.severity.priority}` : "";
    case "escalation":
      return snap.escalation
        ? snap.escalation.escalate
          ? `→ ${snap.escalation.recommended_team} (${snap.escalation.urgency})`
          : "none needed"
        : "";
    case "synthesize":
      return snap.resolution ? "reply composed" : "";
    default:
      return "";
  }
}

type NodeStatus = "done" | "running" | "idle";

function Circle({ status }: { status: NodeStatus }) {
  if (status === "done")
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-foreground text-background">
        <Check className="size-3" />
      </span>
    );
  if (status === "running")
    return (
      <span className="flex size-5 items-center justify-center rounded-full border border-foreground">
        <Loader2 className="size-3 animate-spin" />
      </span>
    );
  return (
    <span className="flex size-5 items-center justify-center rounded-full border border-border">
      <span className="size-1.5 rounded-full bg-muted-foreground/40" />
    </span>
  );
}

/** n8n-style node graph — advances on real SSE step events, not a timer. */
export function PipelineFlow({
  s,
  loading,
  progress,
}: {
  s?: PipelineState;
  loading?: boolean;
  progress?: RunProgress | null;
}) {
  const merged: PipelineState | undefined = s ?? (progress?.snapshot as PipelineState | undefined);

  return (
    <div className="px-4 py-4">
      {!merged && !loading && (
        <p className="mb-3 text-xs text-muted-foreground">
          The pipeline graph. Send a message to watch each node run.
        </p>
      )}
      <div>
        {PIPELINE_STEPS.map((n, idx) => {
          const status = stepStatus(n.id, progress ?? null, !!loading);
          const detail = detailFor(n.id, merged, progress ?? undefined);
          const last = idx === PIPELINE_STEPS.length - 1;
          const dim = status === "idle" && loading;
          const stepDef = PIPELINE_STEPS.find((p) => p.id === n.id)!;
          return (
            <div key={n.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <Circle status={status} />
                {!last && <span className="w-px flex-1 bg-border" style={{ minHeight: 16 }} />}
              </div>

              <div className="flex-1 pb-4">
                <div
                  className={
                    "rounded-md border p-2.5 transition-opacity " +
                    (status === "running" ? "border-foreground/50 bg-card" : "border-border bg-card/50") +
                    (dim ? " opacity-50" : "")
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{stepDef.label}</span>
                    <KindTag kind={stepDef.kind} />
                  </div>
                  {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}

                  {n.id === "investigate" && progress?.agentsDone && progress.agentsDone.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
                      {progress.agentsDone.map((agent) => (
                        <Badge key={agent} variant="secondary">
                          {agent} ✓
                        </Badge>
                      ))}
                    </div>
                  )}

                  {n.id === "investigate" && merged?.agent_reports && merged.agent_reports.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
                      {merged.agent_reports.map((r) => (
                        <Badge key={r.sub_problem_id + r.agent} variant={statusVariant(r.status)}>
                          {r.agent} · {Math.round(r.confidence * 100)}%
                          {r.duration_ms != null ? ` · ${r.duration_ms}ms` : ""}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
