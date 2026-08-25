/**
 * gateway/provider.ts
 *
 * The single interface every provider adapter implements. The rest of the
 * codebase only ever sees this shape — never a vendor SDK.
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompleteOptions {
  /** Sampling temperature; lower = more deterministic (good for classifier). */
  temperature?: number;
  /** Max tokens to generate. */
  maxTokens?: number;
  /** Provider-specific model override. */
  model?: string;
}

/** Every adapter (Anthropic, OpenAI, ...) implements this one method. */
export interface LLMProvider {
  readonly name: string;
  readonly defaultModel: string;
  complete(messages: LLMMessage[], opts?: CompleteOptions): Promise<string>;
}
