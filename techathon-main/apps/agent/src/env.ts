// Loads the root .env no matter which workspace folder we run from.
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

(() => {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) return config({ path: candidate });
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  config();
})();

export const ENV = {
  AGENT_PORT: Number(process.env.AGENT_PORT || 5000),
  // Shared secret the API sends to reach the agent's /admin/* config routes.
  // Only the API should call these; the browser never talks to the agent.
  ADMIN_TOKEN: process.env.AGENT_ADMIN_TOKEN || "dev-admin-token",
};
