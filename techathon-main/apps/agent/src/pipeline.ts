// Linear pipeline runner. Deterministic fallback that runs the exact same
// nodes as the LangGraph graph, in order. Used directly if the graph executor
// ever fails to load, so the system always works.
import type { PipelineInput, PipelineState } from "./contracts/types";
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

export async function runPipelineLinear(input: PipelineInput): Promise<PipelineState> {
  let state: PipelineState = { ...input, audit_trail: [] };

  const apply = (partial: Partial<PipelineState>) => {
    const { audit_trail, ...rest } = partial;
    state = { ...state, ...rest, audit_trail: [...state.audit_trail, ...(audit_trail || [])] };
  };

  apply(await guardNode(state));
  apply(await classifyNode(state));
  apply(await sentimentNode(state));
  apply(await decomposeNode(state));
  apply(await investigateNode(state));
  apply(await severityNode(state));
  apply(await escalationNode(state));
  apply(await synthesizeNode(state));

  return state;
}
