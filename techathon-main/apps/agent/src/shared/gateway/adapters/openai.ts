/**
 * gateway/adapters/openai.ts
 *
 * Wraps the OpenAI SDK behind the same LLMProvider interface.
 * OpenAI accepts the system message inline in the messages array,
 * so this adapter is even simpler.
 */
import OpenAI from "openai";
import type { LLMProvider, LLMMessage, CompleteOptions } from "../provider.js";

export interface OpenAICompatibleConfig {
  apiKey: string;
  name?: string;
  defaultModel?: string;
  baseURL?: string;
  /**
   * Query params sent on every request. Native Azure OpenAI requires
   * `{ "api-version": "..." }`; standard OpenAI/compat endpoints leave this unset.
   */
  defaultQuery?: Record<string, string>;
  /** Extra headers merged on every request. */
  defaultHeaders?: Record<string, string>;
  /** Initial token-limit param. Auto-corrected at runtime if the API rejects it. */
  tokenParam?: "max_tokens" | "max_completion_tokens";
}

export class OpenAIAdapter implements LLMProvider {
  readonly name: string;
  readonly defaultModel: string;
  private client: OpenAI;
  // These two are learned at runtime: different gateways accept different bodies
  // (e.g. gpt-5.x deployments require `max_completion_tokens`; some reject a
  // non-default `temperature`). We start from a sensible guess and self-correct
  // from the API's 400 messages, remembering the fix for later calls.
  private tokenParam: "max_tokens" | "max_completion_tokens";
  private includeTemperature = true;

  constructor(cfg: OpenAICompatibleConfig) {
    this.name = cfg.name ?? "openai";
    this.defaultModel = cfg.defaultModel ?? "gpt-4o-mini";
    // gpt-5 / o-series default to the newer `max_completion_tokens`.
    this.tokenParam =
      cfg.tokenParam ??
      (/^(gpt-5|o1|o3|o4)/i.test(this.defaultModel) ? "max_completion_tokens" : "max_tokens");
    this.client = new OpenAI({
      apiKey: cfg.apiKey,
      ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}),
      ...(cfg.defaultQuery ? { defaultQuery: cfg.defaultQuery } : {}),
      // The OpenAI SDK sends `Authorization: Bearer <apiKey>` — exactly what a
      // company gateway behind a bearer token expects.
      // Behind TLS-inspecting corporate proxies the gzip response stream can be
      // truncated ("Premature close" in Gunzip). Requesting an uncompressed
      // response avoids that failure mode.
      defaultHeaders: { "Accept-Encoding": "identity", ...(cfg.defaultHeaders ?? {}) },
    });
  }

  async complete(messages: LLMMessage[], opts: CompleteOptions = {}): Promise<string> {
    const model = opts.model ?? this.defaultModel;
    const payloadMessages = messages.map((m) => ({ role: m.role, content: m.content }));

    // Up to a few attempts so we can swap an unsupported parameter and retry the
    // SAME call, instead of burning the gateway-level retries on the same 400.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      const body: Record<string, unknown> = { model, messages: payloadMessages };
      // Reasoning models bill reasoning tokens against the cap, so give
      // `max_completion_tokens` generous headroom or the content comes back empty.
      body[this.tokenParam] =
        this.tokenParam === "max_completion_tokens"
          ? Math.max(opts.maxTokens ?? 1024, 4096)
          : opts.maxTokens ?? 1024;
      if (this.includeTemperature) body.temperature = opts.temperature ?? 0.2;

      try {
        const res = await this.client.chat.completions.create(body as any);
        return res.choices[0]?.message?.content ?? "";
      } catch (err) {
        lastErr = err;
        const msg = String((err as { message?: string })?.message ?? err).toLowerCase();
        // "Unsupported parameter: 'max_tokens' is not supported ... Use 'max_completion_tokens'."
        if (this.tokenParam === "max_tokens" && msg.includes("max_completion_tokens")) {
          this.tokenParam = "max_completion_tokens";
          continue;
        }
        // The reverse: a gateway that only understands the classic param.
        if (
          this.tokenParam === "max_completion_tokens" &&
          msg.includes("'max_tokens'") &&
          !msg.includes("'max_completion_tokens'")
        ) {
          this.tokenParam = "max_tokens";
          continue;
        }
        // "temperature does not support 0.2 ... only the default (1) is supported"
        if (this.includeTemperature && msg.includes("temperature")) {
          this.includeTemperature = false;
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }
}
