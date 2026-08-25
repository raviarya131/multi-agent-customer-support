/**
 * agents/billing/index.ts
 *
 * The Billing agent. Almost nothing here — it's the shared factory pointed at
 * this agent's own usecases/ directory. Policy and Technical agents are copies
 * of this file with a different name + folder.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createAgent } from "../../shared/agent-factory.js";

const HERE = dirname(fileURLToPath(import.meta.url));

export const billingAgent = createAgent({
  name: "billing",
  useCasesDir: join(HERE, "usecases"),
});
