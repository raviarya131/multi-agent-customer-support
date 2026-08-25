/**
 * help/answer.ts — the self-service Help Center answerer (read-only, no ticket).
 *
 * Funnel:
 *   1. Instant FAQ (admin canned answers) — zero latency, zero tokens.
 *   2. Semantic Help Center search — retrieve relevant article sections.
 *   3. Grounded LLM answer over ONLY those sections; if the snippets don't cover
 *      the question, we say so and suggest talking to support.
 *
 * This never runs tools, looks up accounts, or creates a ticket. It's pure
 * deflection: answer what we safely can, and hand off everything else.
 */
import { callLLM, availableProviders } from "../gateway/index.js";
import { matchFaq } from "../policies/faq.js";
import { retrieveHelp } from "./retrieve.js";
import { log } from "../core/logger.js";

// Minimum relevance for a section to count as "on-topic" for the question.
const VECTOR_MIN = 0.32;
const KEYWORD_MIN = 0.34;

export interface HelpSource {
  title: string;
  file: string;
}

export interface HelpAnswer {
  answer: string;
  /** Did we confidently answer from FAQ/KB? When false, suggest support. */
  answered: boolean;
  source: "faq" | "kb" | "none";
  sources: HelpSource[];
  /** UI hint: offer the "Talk to support" handoff. */
  suggestEscalation: boolean;
}

const CANT_ANSWER =
  "I couldn't find a confident answer to that in our help articles. Would you like to talk to our support team?";

function buildSystem(snippets: string): string {
  return [
    "You are a friendly self-service help assistant for an online store's customers.",
    "Answer the customer's question using ONLY the HELP ARTICLES below.",
    "Never invent policies, timeframes, fees, or steps that aren't in the articles.",
    "If the articles don't clearly cover the question, set answered=false and leave answer empty.",
    "Keep answers short, warm, and specific. Do not mention that you are using snippets.",
    "Respond as strict JSON: {\"answered\": boolean, \"answer\": string}.",
    "",
    "HELP ARTICLES:",
    snippets,
  ].join("\n");
}

export async function helpAnswer(
  message: string,
  traceId = "help"
): Promise<HelpAnswer> {
  // 1) Instant FAQ short-circuit.
  const faq = matchFaq(message);
  if (faq) {
    return {
      answer: faq.answer,
      answered: true,
      source: "faq",
      sources: [{ title: faq.label, file: "faq" }],
      suggestEscalation: false,
    };
  }

  // 2) Semantic retrieval over the customer-facing Help Center.
  const { hits, method } = await retrieveHelp(message, 4, traceId);
  const min = method === "vector" ? VECTOR_MIN : KEYWORD_MIN;
  const relevant = hits.filter((h) => h.score >= min);

  if (relevant.length === 0) {
    return { answer: CANT_ANSWER, answered: false, source: "none", sources: [], suggestEscalation: true };
  }

  const sources: HelpSource[] = [];
  for (const h of relevant) {
    if (!sources.some((s) => s.file === h.file)) sources.push({ title: h.title, file: h.file });
  }

  // No LLM available → return the most relevant snippet text directly (still grounded).
  if (availableProviders().length === 0) {
    const top = relevant[0];
    const body = top.text.split("\n").slice(1).join("\n").trim();
    return { answer: body || top.text, answered: true, source: "kb", sources, suggestEscalation: false };
  }

  // 3) Grounded LLM answer over the retrieved sections only.
  const snippets = relevant.map((h, i) => `[${i + 1}] ${h.text}`).join("\n\n");
  try {
    const out = await callLLM<{ answered: boolean; answer: string }>({
      system: buildSystem(snippets),
      user: message,
      json: true,
      traceId,
      options: { temperature: 0.2, maxTokens: 500 },
    });
    if (out.answered && out.answer.trim()) {
      return { answer: out.answer.trim(), answered: true, source: "kb", sources, suggestEscalation: false };
    }
    return { answer: CANT_ANSWER, answered: false, source: "none", sources: [], suggestEscalation: true };
  } catch (err) {
    log(traceId, "help", "grounded answer failed", { error: String(err) });
    // Degrade gracefully to the top snippet rather than erroring out.
    const top = relevant[0];
    const body = top.text.split("\n").slice(1).join("\n").trim();
    return { answer: body || top.text, answered: true, source: "kb", sources, suggestEscalation: false };
  }
}
