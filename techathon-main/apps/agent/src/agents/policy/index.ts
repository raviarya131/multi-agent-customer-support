/**
 * agents/policy/index.ts
 *
 * The Policy agent — identical to billing except name + usecases folder.
 * Proves the shared infra (tools, KB, graph, gateway) is genuinely reused.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createAgent } from "../../shared/agent-factory.js";

const HERE = dirname(fileURLToPath(import.meta.url));

export const policyAgent = createAgent({
  name: "policy",
  useCasesDir: join(HERE, "usecases"),
});
