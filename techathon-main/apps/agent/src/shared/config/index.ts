/**
 * config/index.ts
 *
 * One place that reads environment variables. Everything else imports `config`.
 * Loads the monorepo root .env by walking up the tree, so keys resolve the same
 * whether we're started from the HTTP server (cwd = apps/agent) or the CLI.
 */
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

(() => {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) return loadEnv({ path: candidate });
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  loadEnv();
})();

export const config = {
  /**
   * Which provider callLLM uses when none is specified per-call.
   * Preference: an explicit LLM_PROVIDER → the custom OpenAI-compatible endpoint
   * (LLM_ENDPOINT, the common case here) → native Azure → standard OpenAI.
   */
  defaultProvider:
    process.env.LLM_PROVIDER ??
    (process.env.LLM_ENDPOINT
      ? "custom"
      : process.env.AZURE_OPENAI_ENDPOINT
      ? "azure"
      : "openai"),

  /**
   * Custom OpenAI-COMPATIBLE endpoint (the company GEP gateway). Three values,
   * mirroring the curl: model in the body, a base URL ending at /v1, and a
   * bearer token. No api-version, no /deployments/ path.
   *   curl 'https://.../openai/v1/chat/completions'
   *     -H 'Authorization: Bearer <LLM_API_KEY>'
   *     -d '{ "model": "<LLM_MODEL>", "messages": [...] }'
   */
  llmEndpoint: process.env.LLM_ENDPOINT ?? "",
  llmModel: process.env.LLM_MODEL ?? "",
  llmApiKey: process.env.LLM_API_KEY ?? "",

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  /** Optional custom base URL for an OpenAI-compatible endpoint (proxy/gateway). */
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "",
  groqModel: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",

  /**
   * Azure OpenAI (company deployment). Three things differ from standard OpenAI
   * and are read from env:
   *   - AZURE_OPENAI_ENDPOINT   : base URL of the resource/gateway
   *   - AZURE_OPENAI_DEPLOYMENT : the deployment (model) name
   *   - AZURE_OPENAI_API_KEY    : the bearer token (sent as `Authorization: Bearer`)
   * api-version is optional and defaults below.
   */
  azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT ?? "",
  azureDeployment: process.env.AZURE_OPENAI_DEPLOYMENT ?? process.env.AZURE_OPENAI_MODEL ?? "",
  azureApiKey: process.env.AZURE_OPENAI_API_KEY ?? process.env.AZURE_OPENAI_TOKEN ?? "",
  azureApiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-08-01-preview",
  /**
   * Two-tier routing gate:
   * - Below `domainThreshold` (or no match) => the ticket isn't this agent's
   *   domain at all => outcome "out_of_domain" (router sends it elsewhere).
   * - Between the two => matched but uncertain => ask the customer to clarify.
   * - At/above `confidenceThreshold` => proceed to run the handler.
   */
  domainThreshold: Number(process.env.DOMAIN_THRESHOLD ?? "0.3"),
  confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD ?? "0.6"),
  port: Number(process.env.PORT ?? "3000"),

  /**
   * Top-level intent router (steps/classifier.ts) thresholds.
   * - `classifierMultiThreshold`: a domain counts toward "multi-issue" only when
   *   its confidence is at/above this. Kept at 0.6 to match the decomposer's own
   *   0.6 filter, so a `mixed` classification always yields >=2 sub-problems.
   * - `classifierFallbackThreshold`: when the top intent's confidence is below
   *   this (and it isn't multi-issue), raise `fallback` and route to the safe
   *   path instead of guessing a specialist.
   */
  classifierMultiThreshold: Number(process.env.CLASSIFIER_MULTI_THRESHOLD ?? "0.6"),
  classifierFallbackThreshold: Number(process.env.CLASSIFIER_FALLBACK_THRESHOLD ?? "0.5"),

  /**
   * KB retrieval (Tier-2 keyword). How many top-scoring sections to keep per
   * document. Sections are markdown headings; scoring is TF-IDF over the query.
   */
  kbTopSectionsPerFile: Number(process.env.KB_TOP_SECTIONS ?? "2"),

  /**
   * Durable audit log. Every trace entry is appended as one JSON line here, so
   * the "all agent interactions must be logged" requirement survives a restart.
   * Set AUDIT_LOG=off to disable file logging (console logging always stays on).
   */
  auditLogEnabled: (process.env.AUDIT_LOG ?? "on").toLowerCase() !== "off",
  auditLogFile: process.env.AUDIT_LOG_FILE ?? "logs/audit.jsonl",
};
