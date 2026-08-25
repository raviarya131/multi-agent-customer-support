/**
 * shared/tools/registry.ts
 *
 * The CENTRAL tool pool, shared by ALL agents (billing, policy, technical, ...).
 * Tools register here once at boot. Use cases reference them BY NAME in their
 * JSON `capabilities.tools`, and the scoped context only exposes the subset a
 * given use case declared. One pool, per-use-case access.
 *
 * Tools are deliberately "dumb": fetch or compute and return data. No LLM
 * calls, no business logic — so the same tool serves many use cases and agents.
 */
import type { Tool } from "../core/types.js";

const tools = new Map<string, Tool>();

export function registerTool(tool: Tool): void {
  if (tools.has(tool.name)) throw new Error(`Duplicate tool name: ${tool.name}`);
  tools.set(tool.name, tool);
}

/** Register or replace a tool by name. Used by the live config store (reload). */
export function upsertTool(tool: Tool): void {
  tools.set(tool.name, tool);
}

export function unregisterTool(name: string): void {
  tools.delete(name);
}

export function hasTool(name: string): boolean {
  return tools.has(name);
}

export function getTool(name: string): Tool | undefined {
  return tools.get(name);
}

export function listTools(): Tool[] {
  return [...tools.values()];
}

export function findMissingTools(scope: string[]): string[] {
  return scope.filter((n) => !tools.has(n));
}
