// LangGraph StateGraph wiring of the agent pipeline.
// guard → classify → sentiment → decompose → investigate → severity →
//   escalation → synthesize → END
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
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

const StateAnnotation = Annotation.Root({
  ticket_id: Annotation<string>,
  run_id: Annotation<string>,
  message: Annotation<string>,
  message_count: Annotation<number>,
  customer_id: Annotation<PipelineState["customer_id"]>,
  ticket_status: Annotation<PipelineState["ticket_status"]>,
  prior_context: Annotation<PipelineState["prior_context"]>,
  history: Annotation<PipelineState["history"]>,
  guard: Annotation<PipelineState["guard"]>,
  classification: Annotation<PipelineState["classification"]>,
  continuity: Annotation<PipelineState["continuity"]>,
  sentiment: Annotation<PipelineState["sentiment"]>,
  sub_problems: Annotation<PipelineState["sub_problems"]>,
  agent_reports: Annotation<PipelineState["agent_reports"]>,
  investigation: Annotation<PipelineState["investigation"]>,
  severity: Annotation<PipelineState["severity"]>,
  escalation: Annotation<PipelineState["escalation"]>,
  resolution: Annotation<PipelineState["resolution"]>,
  audit_trail: Annotation<AuditEvent[]>({
    reducer: (a, b) => (a || []).concat(b || []),
    default: () => [],
  }),
});

// Node names are suffixed so they never collide with a state channel name
// (e.g. the `guard`/`sentiment`/`severity`/`escalation` channels). LangGraph 1.x
// rejects a node whose name matches a channel; 0.x allowed it.
const builder = new StateGraph(StateAnnotation)
  .addNode("guard_step", guardNode)
  .addNode("classify_step", classifyNode)
  .addNode("sentiment_step", sentimentNode)
  .addNode("decompose_step", decomposeNode)
  .addNode("investigate_step", (s) => investigateNode(s))
  .addNode("severity_step", severityNode)
  .addNode("escalation_step", escalationNode)
  .addNode("synthesize_step", synthesizeNode)
  .addEdge(START, "guard_step")
  .addEdge("guard_step", "classify_step")
  .addEdge("classify_step", "sentiment_step")
  .addEdge("sentiment_step", "decompose_step")
  .addEdge("decompose_step", "investigate_step")
  .addEdge("investigate_step", "severity_step")
  .addEdge("severity_step", "escalation_step")
  .addEdge("escalation_step", "synthesize_step")
  .addEdge("synthesize_step", END);

const compiled = builder.compile();

export async function runPipelineGraph(input: PipelineInput): Promise<PipelineState> {
  const result = await compiled.invoke({ ...input });
  return result as unknown as PipelineState;
}
