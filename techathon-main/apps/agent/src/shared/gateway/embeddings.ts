/**
 * gateway/embeddings.ts
 *
 * Text embeddings for semantic retrieval (the Help Center self-service search).
 * Uses the same OpenAI-compatible gateway as chat completions (the company GEP
 * endpoint, or standard OpenAI). Kept beside the gateway so embeddings are the
 * only other reason to touch a vendor SDK.
 *
 * Best-effort: if no provider is configured or a call fails, embed() returns
 * null and callers fall back to keyword scoring.
 */
import OpenAI from "openai";
import { config } from "../config/index.js";
import { log } from "../core/logger.js";

const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-large";

let cachedClient: OpenAI | null = null;
let resolved = false;

function getClient(): OpenAI | null {
  if (resolved) return cachedClient;
  resolved = true;
  if (config.llmEndpoint && config.llmApiKey) {
    cachedClient = new OpenAI({
      apiKey: config.llmApiKey,
      baseURL: config.llmEndpoint,
      // Uncompressed response avoids "Premature close" behind TLS-inspecting proxies.
      defaultHeaders: { "Accept-Encoding": "identity" },
    });
  } else if (config.openaiApiKey) {
    cachedClient = new OpenAI({
      apiKey: config.openaiApiKey,
      ...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
    });
  } else {
    cachedClient = null;
  }
  return cachedClient;
}

export function embeddingsConfigured(): boolean {
  return Boolean((config.llmEndpoint && config.llmApiKey) || config.openaiApiKey);
}

/** Embed a batch of texts. Returns one vector per input, or null on failure. */
export async function embed(texts: string[], traceId = "embed"): Promise<number[][] | null> {
  const client = getClient();
  if (!client || texts.length === 0) return null;
  try {
    const res = await client.embeddings.create({ model: EMBED_MODEL, input: texts });
    return res.data.map((d) => d.embedding as number[]);
  } catch (err) {
    log(traceId, "embeddings", "embed failed", { error: String(err) });
    return null;
  }
}

/** Cosine similarity of two equal-length vectors (0 when either is degenerate). */
export function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
