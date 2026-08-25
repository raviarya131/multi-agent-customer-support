/**
 * shared/core/graph.ts
 *
 * The generic execution loop, now built on a REAL LangGraph StateGraph.
 * It knows nothing about billing — the Policy/Technical agents reuse it as-is.
 *
 * Graph shape:   START -> gather -> reason -> verify --(loop)--> reason
 *                                                    \--(done)--> emit -> END
 *
 * LLM calls inside the nodes go through our own callLLM gateway (via the
 * handler's run()), so the multi-provider "single door" is preserved — we use
 * LangGraph purely for orchestration, not for model access.
 *
 * Public API is unchanged: runGraph(state, handler) -> final AgentState.
 */
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import type { AgentState, UseCaseHandler, Evidence } from "./types.js";
import { log } from "./logger.js";

const MAX_LOOPS = 4;

/**
 * LangGraph state schema. Reducers define how each node's partial update merges
 * into the running state — this is the framework-native version of the manual
 * merge() we had before. Arrays append; scalars overwrite.
 */
const GraphState = Annotation.Root({
  // The full AgentState rides along under one key for simplicity; we keep the
  // existing AgentState contract intact for the rest of the app.
  agent: Annotation<AgentState>({
    reducer: (left: AgentState, right: Partial<AgentState>): AgentState => ({
      ...left,
      ...right,
      scratch: { ...left.scratch, ...(right.scratch ?? {}) },
      evidence: [...left.evidence, ...((right.evidence as Evidence[]) ?? [])],
      reasoning: [...left.reasoning, ...((right.reasoning as string[]) ?? [])],
    }),
    default: () =>
      ({
        ticket: { traceId: "", text: "" },
        scratch: {},
        evidence: [],
        reasoning: [],
        done: false,
      } as AgentState),
  }),
  loops: Annotation<number>({
    reducer: (_l: number, r: number) => r,
    default: () => 0,
  }),
});

type GState = typeof GraphState.State;

/** Build a compiled graph for a specific handler. */
function buildGraph(handler: UseCaseHandler) {
  // gather: first pass at the handler — pull context / run its logic.
  const gather = async (s: GState): Promise<Partial<GState>> => {
    const traceId = s.agent.ticket.traceId;
    log(traceId, "graph:gather", `handler "${handler.id}" gathering`);
    const patch = await handler.run(s.agent);
    return { agent: patch as AgentState };
  };

  // reason: subsequent passes (only reached if the handler wasn't done).
  const reason = async (s: GState): Promise<Partial<GState>> => {
    const traceId = s.agent.ticket.traceId;
    const loops = s.loops + 1;
    log(traceId, "graph:reason", `loop ${loops}`);
    if (s.agent.done) return { loops };
    const patch = await handler.run(s.agent);
    return { agent: patch as AgentState, loops };
  };

  // verify: decide whether to stop. Pure logic, no LLM.
  const verify = async (s: GState): Promise<Partial<GState>> => {
    const traceId = s.agent.ticket.traceId;
    if (s.agent.answer || s.agent.clarificationNeeded) {
      log(traceId, "graph:verify", "handler produced output, stopping");
      return { agent: { done: true } as AgentState };
    }
    if (s.loops >= MAX_LOOPS) {
      log(traceId, "graph:verify", "hit loop cap without an answer; escalating");
      // Don't fabricate an answer — flag it unresolved so the agent surfaces a
      // "needs_escalation" outcome the orchestrator can act on.
      return { agent: { done: true, escalate: true } as AgentState };
    }
    return {};
  };

  // emit: terminal logging.
  const emit = async (s: GState): Promise<Partial<GState>> => {
    const traceId = s.agent.ticket.traceId;
    log(traceId, "graph:emit", "execution complete", {
      hasAnswer: !!s.agent.answer,
      evidenceCount: s.agent.evidence.length,
    });
    return {};
  };

  // Conditional edge out of verify: loop back to reason, or finish at emit.
  const route = (s: GState): "reason" | "emit" =>
    s.agent.done ? "emit" : "reason";

  const graph = new StateGraph(GraphState)
    .addNode("gather", gather)
    .addNode("reason", reason)
    .addNode("verify", verify)
    .addNode("emit", emit)
    .addEdge(START, "gather")
    .addEdge("gather", "verify")
    .addConditionalEdges("verify", route, { reason: "reason", emit: "emit" })
    .addEdge("reason", "verify")
    .addEdge("emit", END);

  return graph.compile();
}

/**
 * Run the compiled LangGraph for one handler. Same signature as before.
 */
export async function runGraph(
  state: AgentState,
  handler: UseCaseHandler
): Promise<AgentState> {
  const app = buildGraph(handler);
  const result = await app.invoke(
    { agent: state, loops: 0 },
    { recursionLimit: 50 }
  );
  return result.agent;
}
