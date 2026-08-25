/**
 * shared/core/registry.ts
 *
 * A Registry holds the use-case handlers for ONE agent. It used to be a single
 * global Map; making it a class is the change that isolates agents from each
 * other. Each agent owns its own Registry instance, so the billing agent only
 * ever sees billing use cases and the policy agent only policy ones — even when
 * both run in the same process at the same time.
 *
 * The classifier and the agent pipeline receive a Registry; they never reach
 * for a global. That isolation is what makes parallel, side-by-side agents safe.
 */
import type { UseCaseHandler } from "./types.js";

export class Registry {
  private handlers = new Map<string, UseCaseHandler>();

  register(handler: UseCaseHandler): void {
    if (this.handlers.has(handler.id)) {
      throw new Error(`Duplicate handler id: ${handler.id}`);
    }
    this.handlers.set(handler.id, handler);
  }

  get(id: string): UseCaseHandler | undefined {
    return this.handlers.get(id);
  }

  list(): UseCaseHandler[] {
    return [...this.handlers.values()];
  }

  get size(): number {
    return this.handlers.size;
  }

  /** Drop all handlers. Used by hot-reload before re-loading from disk. */
  clear(): void {
    this.handlers.clear();
  }
}
