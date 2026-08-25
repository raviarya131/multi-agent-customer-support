// Single entry point. Tries the LangGraph graph first and falls back to the
// linear runner if the graph executor throws (lazy import so a construction
// error is caught here instead of crashing the process).
import { randomUUID } from "node:crypto";
import type { Message, PipelineInput, PipelineState, PriorRunContext, TicketStatus } from "./contracts/types";
import { runPipelineLinear } from "./pipeline";

export function buildInput(opts: {
  ticket_id?: string;
  run_id?: string;
  message: string;
  message_count?: number;
  customer_id?: string;
  ticket_status?: TicketStatus;
  prior_context?: PriorRunContext;
  history?: Message[];
}): PipelineInput {
  return {
    ticket_id: opts.ticket_id || `T-${randomUUID().slice(0, 8)}`,
    run_id: opts.run_id || `R-${randomUUID().slice(0, 8)}`,
    message: opts.message,
    message_count: opts.message_count ?? 1,
    ...(opts.customer_id ? { customer_id: opts.customer_id } : {}),
    ...(opts.ticket_status ? { ticket_status: opts.ticket_status } : {}),
    ...(opts.prior_context ? { prior_context: opts.prior_context } : {}),
    history: opts.history ?? [],
  };
}

export async function runPipeline(input: PipelineInput): Promise<PipelineState> {
  try {
    const { runPipelineGraph } = await import("./graph");
    return await runPipelineGraph(input);
  } catch (err) {
    console.error("[agent] graph executor failed, using linear runner:", (err as Error).message);
    return await runPipelineLinear(input);
  }
}
