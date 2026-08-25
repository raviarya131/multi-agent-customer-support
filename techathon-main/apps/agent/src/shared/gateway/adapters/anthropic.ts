/**
 * gateway/adapters/anthropic.ts
 *
 * Wraps the Anthropic SDK behind the LLMProvider interface.
 * Note: Anthropic keeps the system prompt separate from messages,
 * so we split it out here. Callers don't need to know that.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMMessage, CompleteOptions } from "../provider.js";

export class AnthropicAdapter implements LLMProvider {
  readonly name = "anthropic";
  readonly defaultModel = "claude-sonnet-4-6";
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(messages: LLMMessage[], opts: CompleteOptions = {}): Promise<string> {
    // Anthropic wants system separate from the turn list.
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const turns = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const res = await this.client.messages.create({
      model: opts.model ?? this.defaultModel,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.2,
      system: system || undefined,
      messages: turns,
    });

    // Concatenate any text blocks in the response.
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
}
