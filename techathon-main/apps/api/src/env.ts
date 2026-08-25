// Loads root .env (walks up the tree) and exposes typed config.
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
  API_PORT: Number(process.env.API_PORT || 4100),
  AGENT_URL: process.env.AGENT_URL || "http://localhost:5000",
  DB_PATH: process.env.API_DB_PATH || "support.db",
  // Email (Resend) — optional. Email is skipped gracefully if no key is set.
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  RESEND_FROM: process.env.RESEND_FROM || "Support Engine <onboarding@resend.dev>",
  // Shared secret for the agent's /admin/* live config-store routes.
  AGENT_ADMIN_TOKEN: process.env.AGENT_ADMIN_TOKEN || "dev-admin-token",
};
