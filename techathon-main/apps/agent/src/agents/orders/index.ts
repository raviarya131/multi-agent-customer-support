/**
 * agents/orders/index.ts
 *
 * The Orders agent — owns the order lifecycle (status, tracking, delivery,
 * cancel/change). Like the other specialists it's just the shared factory
 * pointed at this agent's own usecases/ directory.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createAgent } from "../../shared/agent-factory.js";

const HERE = dirname(fileURLToPath(import.meta.url));

export const ordersAgent = createAgent({
  name: "orders",
  useCasesDir: join(HERE, "usecases"),
});
