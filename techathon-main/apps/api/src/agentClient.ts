// Calls the Agent System (LangGraph service) to run the pipeline.
import { ENV } from "./env";

export interface RunRequest {
  ticket_id: string;
  run_id: string;
  message: string;
  message_count: number;
  customer_id?: string;
  ticket_status?: {
    has_escalation: boolean;
    escalation_status?: string | null;
    assignee_name?: string | null;
    department?: string | null;
    urgency?: string | null;
  };
  prior_context?: unknown;
  history: { role: string; text: string; timestamp: string }[];
}

export type PipelineProgressEvent = {
  type: "step_start" | "step_done" | "agent_done" | "done" | "error";
  step?: string;
  audit?: unknown[];
  agent?: string;
  message?: string;
  snapshot?: Record<string, unknown>;
  state?: unknown;
};

export interface HelpAnswer {
  answer: string;
  answered: boolean;
  source: "faq" | "kb" | "none";
  sources: { title: string; file: string }[];
  suggestEscalation: boolean;
}

export interface PublicFaq {
  id: string;
  label: string;
  answer: string;
}

/** List enabled, customer-safe FAQs from the agent's Help Center (read-only). */
export async function listAgentFaqs(): Promise<{ faqs: PublicFaq[] }> {
  const res = await fetch(`${ENV.AGENT_URL}/help/faqs`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`agent faqs returned ${res.status}: ${detail}`);
  }
  return res.json();
}

/** Ask the agent's self-service Help Center (read-only; never creates a ticket). */
export async function askAgentHelp(message: string, runId: string): Promise<HelpAnswer> {
  const res = await fetch(`${ENV.AGENT_URL}/help/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, run_id: runId }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`agent help returned ${res.status}: ${detail}`);
  }
  return res.json();
}

export async function runAgentPipeline(req: RunRequest): Promise<any> {
  const res = await fetch(`${ENV.AGENT_URL}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`agent returned ${res.status}: ${detail}`);
  }
  return res.json();
}

/** Stream pipeline progress (SSE) from the agent service. */
export async function* runAgentPipelineStream(
  req: RunRequest
): AsyncGenerator<PipelineProgressEvent> {
  const res = await fetch(`${ENV.AGENT_URL}/run/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`agent stream returned ${res.status}: ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        yield JSON.parse(line.slice(6)) as PipelineProgressEvent;
      } catch {
        // skip malformed chunk
      }
    }
  }
}
