/**
 * agents/products/index.ts
 *
 * The Products agent — owns pre-purchase catalog questions (availability,
 * stock, price, variants, specs). Shared factory pointed at its usecases/ dir.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createAgent } from "../../shared/agent-factory.js";

const HERE = dirname(fileURLToPath(import.meta.url));

export const productsAgent = createAgent({
  name: "products",
  useCasesDir: join(HERE, "usecases"),
});
