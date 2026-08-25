/**
 * shared/handlers/loader.ts
 *
 * Loads, validates, and registers the JSON use cases for ONE agent. An agent
 * passes the absolute path to its own usecases/ directory; the loader reads
 * every *.json there, wraps each in the common declarative handler, and
 * registers it. Tools and KB are shared/central — only the use-case JSONs are
 * per-agent.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { UseCaseDefinition } from "../core/types.js";
import type { Registry } from "../core/registry.js";
import { makeDeclarativeHandler } from "./declarative.handler.js";
import { findMissingTools } from "../tools/registry.js";
import { log } from "../core/logger.js";

const paramSpec = z.object({
  type: z.string(),
  format: z.string().optional(),
  description: z.string().optional(),
  prompt_if_missing: z.string().optional(),
});

export const defSchema = z
  .object({
    use_case_id: z.string(),
    version: z.number().optional(),
    enabled: z.boolean().optional(),
    description: z.string(),
    example_utterances: z.array(z.string()).min(1),
    prompt: z.string(),
    capabilities: z
      .object({
        tools: z.array(z.string()).optional(),
        knowledge_base: z
          .array(
            z.object({
              library_name: z.string().optional(),
              knowledge_file: z.string(),
              description: z.string().optional(),
            })
          )
          .optional(),
        can_ask_user: z.boolean().optional(),
      })
      .optional(),
    required_params: z.record(paramSpec).optional(),
    optional_params: z.record(paramSpec).optional(),
    side_effecting: z.boolean().optional(),
    response_templates: z.record(z.string()).optional(),
    error_template: z.string().optional(),
    status_routing: z.record(z.array(z.string())).optional(),
  })
  .passthrough();

/** Load every JSON use case from `useCasesDir`. Returns registered ids. */
export function loadUseCasesFrom(registry: Registry, useCasesDir: string): string[] {
  if (!existsSync(useCasesDir)) {
    log("boot", "loader", "no usecases dir", { useCasesDir });
    return [];
  }
  const files = readdirSync(useCasesDir).filter((f) => f.endsWith(".json"));
  const registered: string[] = [];

  for (const file of files) {
    const raw = readFileSync(join(useCasesDir, file), "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error(`[loader] ${file}: invalid JSON — skipped. ${String(e)}`);
      continue;
    }
    const result = defSchema.safeParse(parsed);
    if (!result.success) {
      console.error(
        `[loader] ${file}: failed validation — skipped.`,
        result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
      );
      continue;
    }
    const def = result.data as UseCaseDefinition;
    if (def.enabled === false) {
      console.error(`[loader] ${file}: disabled — skipped.`);
      continue;
    }
    const missing = findMissingTools(def.capabilities?.tools ?? []);
    if (missing.length > 0) {
      console.error(
        `[loader] ${file}: references unknown tools ${missing.join(", ")} — register them in shared/tools/index.ts.`
      );
    }
    registry.register(makeDeclarativeHandler(def));
    registered.push(def.use_case_id);
  }

  log("boot", "loader", "use cases registered", { dir: useCasesDir, registered });
  return registered;
}
