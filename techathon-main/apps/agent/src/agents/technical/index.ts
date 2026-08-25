/**
 * agents/technical/index.ts
 *
 * The Technical agent — same shared infra, its own use cases.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createAgent } from "../../shared/agent-factory.js";

const HERE = dirname(fileURLToPath(import.meta.url));

export const technicalAgent = createAgent({
  name: "technical",
  useCasesDir: join(HERE, "usecases"),
});
