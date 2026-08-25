/**
 * usecase-store.ts — admin CRUD over an agent's declarative use cases.
 *
 * Use cases are JSON files in each agent's usecases/ dir. Unlike KB, they're
 * compiled into a per-agent Registry at load time, so after writing/deleting a
 * file we call the agent's reload() to atomically swap in the new registry.
 */
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { UseCaseDefinition } from "../core/types.js";
import { defSchema } from "./loader.js";
import { getCreatedAgent, listCreatedAgents } from "../agent-factory.js";

export interface StoredUseCase {
  agent: string;
  file: string;
  def: UseCaseDefinition;
}

function readDir(agentName: string, dir: string): StoredUseCase[] {
  if (!existsSync(dir)) return [];
  const out: StoredUseCase[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    try {
      const def = JSON.parse(readFileSync(join(dir, file), "utf8")) as UseCaseDefinition;
      out.push({ agent: agentName, file, def });
    } catch {
      /* skip unparsable */
    }
  }
  return out;
}

export function listUseCases(): StoredUseCase[] {
  return listCreatedAgents().flatMap((a) => readDir(a.name, a.useCasesDir));
}

export function listAgentNames(): string[] {
  return listCreatedAgents().map((a) => a.name);
}

function fileNameFor(id: string): string {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(id)) {
    throw new Error("use_case_id must be alphanumeric/underscore, starting with a letter");
  }
  return `${id}.json`;
}

/** Validate + write a use case to its agent's dir, then hot-reload that agent. */
export function upsertUseCase(agentName: string, input: unknown): { def: UseCaseDefinition; ids: string[] } {
  const agent = getCreatedAgent(agentName);
  if (!agent) throw new Error(`Unknown agent: ${agentName}`);
  const def = defSchema.parse(input) as UseCaseDefinition;
  const file = fileNameFor(def.use_case_id);
  writeFileSync(join(agent.useCasesDir, file), JSON.stringify(def, null, 2), "utf8");
  const ids = agent.reload();
  return { def, ids };
}

export function deleteUseCase(agentName: string, id: string): string[] {
  const agent = getCreatedAgent(agentName);
  if (!agent) throw new Error(`Unknown agent: ${agentName}`);
  const path = join(agent.useCasesDir, fileNameFor(id));
  if (existsSync(path)) unlinkSync(path);
  return agent.reload();
}
