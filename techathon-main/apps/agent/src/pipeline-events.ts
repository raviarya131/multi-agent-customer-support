// Progress events emitted while the linear pipeline runs — consumed by SSE so
// the UI can advance steps in sync with real work (not a fake timer).
import type { AuditEvent, PipelineInput, PipelineState } from "./contracts/types";
import {
  guardNode,
  classifyNode,
  sentimentNode,
  decomposeNode,
  investigateNode,
  severityNode,
  escalationNode,
  synthesizeNode,
} from "./nodes";

export type PipelineStepId =
  | "guard"
  | "classify"
  | "sentiment"
  | "decompose"
  | "investigate"
  | "severity"
  | "escalation"
  | "synthesize";

export interface PipelineProgressEvent {
  type: "step_start" | "step_done" | "agent_done" | "done" | "error";
  step?: PipelineStepId;
  /** Audit rows produced by this step (thoughts + LLM/rule tags). */
  audit?: AuditEvent[];
  /** Specialist agent domain when type === agent_done. */
  agent?: string;
  message?: string;
  /** Partial pipeline snapshot after a step completes. */
  snapshot?: Partial<PipelineState>;
}

export type ProgressCallback = (evt: PipelineProgressEvent) => void;

const STEPS: {
  id: PipelineStepId;
  run: (s: PipelineState, onAgentDone?: (agent: string, audit: AuditEvent[]) => void) => Promise<Partial<PipelineState>>;
}[] = [
  { id: "guard", run: guardNode },
  { id: "classify", run: classifyNode },
  { id: "sentiment", run: sentimentNode },
  { id: "decompose", run: decomposeNode },
  {
    id: "investigate",
    run: (s, onAgentDone) =>
      investigateNode(s, (agent, audit) => onAgentDone?.(agent, audit)),
  },
  { id: "severity", run: severityNode },
  { id: "escalation", run: escalationNode },
  { id: "synthesize", run: synthesizeNode },
];

/** Linear runner that emits real progress after each pipeline step. */
export async function runPipelineLinearWithProgress(
  input: PipelineInput,
  onProgress?: ProgressCallback
): Promise<PipelineState> {
  let state: PipelineState = { ...input, audit_trail: [] };

  const apply = (partial: Partial<PipelineState>) => {
    const { audit_trail, ...rest } = partial;
    state = { ...state, ...rest, audit_trail: [...state.audit_trail, ...(audit_trail || [])] };
  };

  for (const { id, run } of STEPS) {
    onProgress?.({ type: "step_start", step: id });
    const auditBefore = state.audit_trail.length;

    if (id === "investigate") {
      const partial = await run(state, (agent, audit) => {
        onProgress?.({ type: "agent_done", step: "investigate", agent, audit });
      });
      apply(partial);
    } else {
      apply(await run(state));
    }

    const stepAudit = state.audit_trail.slice(auditBefore);
    onProgress?.({
      type: "step_done",
      step: id,
      audit: stepAudit,
      snapshot: {
        guard: state.guard,
        classification: state.classification,
        sentiment: state.sentiment,
        sub_problems: state.sub_problems,
        agent_reports: state.agent_reports,
        investigation: state.investigation,
        severity: state.severity,
        escalation: state.escalation,
        resolution: state.resolution,
      },
    });
  }

  onProgress?.({ type: "done", snapshot: state });
  return state;
}
