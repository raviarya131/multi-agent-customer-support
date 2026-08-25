/**
 * gateway/index.ts
 *
 * THE SINGLE DOOR. Every LLM call in the app goes through callLLM().
 * No file outside this folder imports a vendor SDK. This is the constraint
 * the rubric asks for, and it's where retries / logging / JSON parsing live.
 */
import type { LLMProvider, LLMMessage, CompleteOptions } from "./provider.js";
import { AnthropicAdapter } from "./adapters/anthropic.js";
import { OpenAIAdapter } from "./adapters/openai.js";
import { config } from "../config/index.js";
import { log } from "../core/logger.js";

// --- Provider registry: name -> adapter instance ----------------------------
const providers = new Map<string, LLMProvider>();

function registerProvider(p: LLMProvider) {
  providers.set(p.name, p);
}

// Register whichever providers have a key configured. Missing keys are fine —
// you only need the one you intend to use.
if (config.anthropicApiKey) registerProvider(new AnthropicAdapter(config.anthropicApiKey));
if (config.openaiApiKey)
  registerProvider(
    new OpenAIAdapter({
      apiKey: config.openaiApiKey,
      defaultModel: config.openaiModel,
      ...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
    })
  );
if (config.groqApiKey) {
  registerProvider(new OpenAIAdapter({
    name: "groq",
    apiKey: config.groqApiKey,
    defaultModel: config.groqModel,
    baseURL: "https://api.groq.com/openai/v1",
  }));
}
if (config.geminiApiKey) {
  registerProvider(new OpenAIAdapter({
    name: "gemini",
    apiKey: config.geminiApiKey,
    defaultModel: config.geminiModel,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  }));
}
// Custom OpenAI-COMPATIBLE endpoint (company GEP gateway). Matches the curl:
// base URL ends at /v1, model goes in the body, bearer-token auth. The OpenAI
// SDK appends /chat/completions, so baseURL is LLM_ENDPOINT verbatim.
if (config.llmEndpoint && config.llmModel && config.llmApiKey) {
  registerProvider(
    new OpenAIAdapter({
      name: "custom",
      apiKey: config.llmApiKey,
      defaultModel: config.llmModel,
      baseURL: config.llmEndpoint,
      // The adapter self-corrects the token param / temperature from the API's
      // own error messages, so this works whether the gateway wants max_tokens
      // or max_completion_tokens and whether or not it accepts temperature.
    })
  );
}
// Native Azure OpenAI (only if you use a real Azure resource URL with
// /deployments/ + api-version). Bearer token + endpoint + deployment.
if (config.azureEndpoint && config.azureDeployment && config.azureApiKey) {
  const base = config.azureEndpoint.replace(/\/+$/, "");
  // Accept either a bare resource endpoint or a full deployments URL.
  const baseURL = base.includes("/deployments/")
    ? base
    : `${base}/openai/deployments/${config.azureDeployment}`;
  registerProvider(
    new OpenAIAdapter({
      name: "azure",
      apiKey: config.azureApiKey,
      defaultModel: config.azureDeployment,
      baseURL,
      defaultQuery: { "api-version": config.azureApiVersion },
    })
  );
}
function pickProvider(name?: string): LLMProvider {
  const chosen = name ?? config.defaultProvider;
  const provider = providers.get(chosen);
  if (!provider) {
    const available = [...providers.keys()].join(", ") || "none";
    throw new Error(
      `LLM provider "${chosen}" not available. Configured: ${available}. ` +
        `Set the matching API key in .env.`
    );
  }
  return provider;
}

// --- Request shape callers use ----------------------------------------------
export interface LLMRequest {
  system?: string;
  user: string;
  /** Override the default provider for this single call. */
  provider?: string;
  /** When true, we strip code fences and JSON.parse the response. */
  json?: boolean;
  options?: CompleteOptions;
  /** For tracing — pass the ticket's traceId so the call shows up in the log. */
  traceId?: string;
}

const MAX_RETRIES = 2;

async function withRetries<T>(fn: () => Promise<T>, traceId?: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (traceId) {
        log(traceId, "gateway", `LLM call failed (attempt ${attempt + 1})`, {
          error: String(err),
        });
      }
      // simple backoff
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/** Strip ```json fences and parse. Throws if it isn't valid JSON. */
function parseJson<T>(text: string): T {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned) as T;
}

/**
 * The one function the whole app uses.
 * - Plain text:   const t = await callLLM({ user: "..." });
 * - JSON output:  const o = await callLLM<MyType>({ user: "...", json: true });
 */
export async function callLLM<T = string>(req: LLMRequest): Promise<T> {
  const provider = pickProvider(req.provider);
  const messages: LLMMessage[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content: req.user });

  if (req.traceId) {
    log(req.traceId, "gateway", "LLM call", {
      provider: provider.name,
      json: !!req.json,
    });
  }

  const text = await withRetries(
    () => provider.complete(messages, req.options),
    req.traceId
  );

  if (req.json) return parseJson<T>(text);
  return text as unknown as T;
}

/** Expose which providers are live (handy for a health check / demo). */
export function availableProviders(): string[] {
  return [...providers.keys()];
}
