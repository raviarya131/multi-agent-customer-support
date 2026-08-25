// Agent System HTTP service. The Application API calls POST /run with the
// pipeline-entry JSON and gets the full pipeline state back.
import express from "express";
import cors from "cors";
import { ENV } from "./env";
import { buildInput, runPipeline } from "./run";
import { runPipelineLinearWithProgress } from "./pipeline-events";
import { adminRouter } from "./admin";
import { helpAnswer } from "./shared/help/answer";
import { listPublicFaqs } from "./shared/policies/faq";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "agent" }));

// Live config store (KB / use cases / HTTP tools) — secret-gated, API-only.
app.use("/admin", adminRouter);

// Self-service Help Center answer (read-only, no ticket). Called by the API on
// behalf of a signed-in customer; deflects common questions before escalation.
app.post("/help/ask", async (req, res) => {
  try {
    const message = String((req.body ?? {}).message ?? "").trim();
    if (!message) return res.status(400).json({ error: "message is required" });
    const result = await helpAnswer(message, String((req.body ?? {}).run_id ?? "help"));
    res.json(result);
  } catch (err) {
    console.error("[agent] /help/ask failed:", err);
    res.status(500).json({ error: "help failed", detail: (err as Error).message });
  }
});

// Browsable, customer-safe FAQ list (enabled entries only). Read-only; the API
// proxies this for signed-in customers so they can scan answers before asking.
app.get("/help/faqs", (_req, res) => {
  try {
    res.json({ faqs: listPublicFaqs() });
  } catch (err) {
    console.error("[agent] /help/faqs failed:", err);
    res.status(500).json({ error: "faqs failed", detail: (err as Error).message });
  }
});

function parseRunBody(body: Record<string, unknown> | null | undefined) {
  const { ticket_id, run_id, message, message_count, customer_id, ticket_status, prior_context, history } = body || {};
  if (!message || typeof message !== "string" || !message.trim()) {
    return { error: "message is required" as const };
  }
  return {
    input: buildInput({
      ticket_id: ticket_id as string | undefined,
      run_id: run_id as string | undefined,
      message,
      message_count: message_count as number | undefined,
      customer_id: customer_id as string | undefined,
      ticket_status: ticket_status as Parameters<typeof buildInput>[0]["ticket_status"],
      prior_context: prior_context as Parameters<typeof buildInput>[0]["prior_context"],
      history: (history as Parameters<typeof buildInput>[0]["history"]) ?? [],
    }),
  };
}

app.post("/run", async (req, res) => {
  try {
    const parsed = parseRunBody(req.body);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    const result = await runPipeline(parsed.input);
    res.json(result);
  } catch (err) {
    console.error("[agent] /run failed:", err);
    res.status(500).json({ error: "pipeline failed", detail: (err as Error).message });
  }
});

/** SSE stream — emits real step_start / step_done / agent_done events as the pipeline runs. */
app.post("/run/stream", async (req, res) => {
  const parsed = parseRunBody(req.body);
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await runPipelineLinearWithProgress(parsed.input, (evt) => send(evt));
    send({ type: "done", state: result });
  } catch (err) {
    console.error("[agent] /run/stream failed:", err);
    send({ type: "error", message: (err as Error).message });
  }
  res.end();
});

app.listen(ENV.AGENT_PORT, () => {
  console.log(`[agent] listening on http://localhost:${ENV.AGENT_PORT}`);
});
