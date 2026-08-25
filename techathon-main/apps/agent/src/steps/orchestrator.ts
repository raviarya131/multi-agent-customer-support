// Step 4b — Orchestrator.
//
// Two halves with two owners (see README build plan):
//   • FAN-OUT  (Component 2 · Parallel Decomposer) — runs the right specialist
//     for each sub-problem IN PARALLEL and is resilient to a single agent
//     failing. Awaits each agent so it works whether agents are sync (base)
//     or async (LLM-backed branch).
//   • MERGE    (Component 4 · Output Combiner) — collapses the reports into one
//     investigation (overall_status + conflicts).
//
// `runOrchestrator` keeps a stable signature so nodes/CLI stay unchanged.
import type { AgentContext } from "../agents/base";
import type { AgentDomain, AgentReport, Investigation, Message, SubProblem } from "../contracts/types";
import { getAgent } from "../agents/registry";

// A single agent is allowed this long before the fan-out gives up on it, so one
// hung/slow specialist (e.g. a stalled LLM call) can never block the others or
// the whole pipeline indefinitely. The timed-out agent yields a `failed` report
// and the orchestrator proceeds with whatever the rest produced.
const AGENT_TIMEOUT_MS = 45_000;

function failedReport(sub: SubProblem, message: string): AgentReport {
  return {
    agent: sub.domain,
    sub_problem_id: sub.id,
    findings: [],
    actions: [],
    reasoning: `Agent failed: ${message}`,
    evidence: [],
    status: "failed",
    confidence: 0,
  };
}

// FAN-OUT (Component 2). True parallel fan-out via Promise.all: every agent is
// launched at once and runs concurrently. Each is independently:
//   • isolated in its own try/catch  → one failure never sinks the others,
//   • bounded by a timeout (Promise.race) → a hung agent can't block the batch,
//   • timed (duration_ms)            → so we can show who finished early/late.
// Promise.all naturally collects the early finishers and waits for the slowest
// before returning, which is exactly the "wait for all to finish" semantics.
export async function fanOut(
  subProblems: SubProblem[],
  ctx: AgentContext,
  onAgentDone?: (domain: AgentDomain, report: AgentReport) => void
): Promise<AgentReport[]> {
  return Promise.all(
    subProblems.map(async (sub) => {
      const startedAt = Date.now();
      let report: AgentReport;
      try {
        report = await Promise.race([
          getAgent(sub.domain).run(sub, ctx),
          new Promise<AgentReport>((resolve) =>
            setTimeout(
              () => resolve(failedReport(sub, `timed out after ${AGENT_TIMEOUT_MS}ms`)),
              AGENT_TIMEOUT_MS
            )
          ),
        ]);
      } catch (err) {
        report = failedReport(sub, (err as Error).message);
      }
      report.duration_ms = Date.now() - startedAt;
      onAgentDone?.(sub.domain, report);
      return report;
    })
  );
}

// MERGE (Component 4 boundary). Kept here so `runOrchestrator` returns a ready
// investigation; the Output Combiner owns the deeper synthesis downstream.
function mergeReports(reports: AgentReport[]): Investigation {
  const conflicts: string[] = [];
  const anyFailed = reports.some((r) => r.status === "failed");
  const anyUnresolved = reports.some((r) => r.status === "unresolved" || r.status === "needs_info");
  const anyResolved = reports.some((r) => r.status === "resolved");
  const allResolved = reports.length > 0 && reports.every((r) => r.status === "resolved");

  if (anyResolved && anyUnresolved) {
    conflicts.push("Mixed agent outcomes — some resolved, some need more info.");
  }

  const overall_status: Investigation["overall_status"] = allResolved
    ? "resolved"
    : anyFailed || (!anyUnresolved && !allResolved)
    ? "unresolved"
    : "partial";

  return { overall_status, conflicts };
}

export interface OrchestratorTiming {
  /** Wall-clock for the whole parallel batch. */
  wallMs: number;
  /** Sum of every agent's own time — exceeds wallMs when they truly ran in parallel. */
  sumMs: number;
}

export async function runOrchestrator(
  subProblems: SubProblem[],
  message: string,
  history: Message[],
  customerId?: string,
  priorContext?: AgentContext["priorContext"],
  onAgentDone?: (domain: AgentDomain, report: AgentReport) => void
): Promise<{ reports: AgentReport[]; investigation: Investigation; timing: OrchestratorTiming }> {
  const ctx: AgentContext = {
    message,
    history,
    ...(customerId ? { customerId } : {}),
    ...(priorContext ? { priorContext } : {}),
  };
  const startedAt = Date.now();
  const reports = await fanOut(subProblems, ctx, onAgentDone);
  const wallMs = Date.now() - startedAt;
  const sumMs = reports.reduce((n, r) => n + (r.duration_ms ?? 0), 0);
  const investigation = mergeReports(reports);
  return { reports, investigation, timing: { wallMs, sumMs } };
}
