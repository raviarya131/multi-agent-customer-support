// Quick read-only inspector for the support DB. Prints the latest run's
// classification, sub-problems, agent reports, and resolution summary.
//   node apps/api/inspect-db.mjs
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(here, process.env.API_DB_PATH || "support.db");
const db = new DatabaseSync(dbPath, { readOnly: true });

const row = db
  .prepare("SELECT run_id, ticket_id, created_at, state_json FROM runs ORDER BY created_at DESC LIMIT 1")
  .get();

if (!row) {
  console.log("No runs found in", dbPath);
  process.exit(0);
}

const s = JSON.parse(row.state_json);
console.log("DB:", dbPath);
console.log("Latest run:", row.run_id, "| ticket:", row.ticket_id, "|", row.created_at);
console.log("\nMessage:", JSON.stringify(s.message));
console.log("message_count:", s.message_count);
console.log("\nclassification:", JSON.stringify(s.classification, null, 2));
console.log("\nsub_problems:", JSON.stringify(s.sub_problems, null, 2));
console.log("\nagent_reports:", (s.agent_reports || []).map((r) => ({ agent: r.agent, sub: r.sub_problem_id, status: r.status })));
console.log("\ninvestigation:", JSON.stringify(s.investigation));
console.log("\nresolution.summary:", s.resolution?.summary);
