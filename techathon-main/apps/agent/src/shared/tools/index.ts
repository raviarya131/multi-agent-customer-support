/**
 * shared/tools/index.ts
 *
 * The ONE place tools join the central pool at boot. All agents share this.
 * Adding a tool = one import + one registerTool() line. Use cases then opt in
 * by name in their JSON.
 */
import { registerTool } from "./registry.js";
import { dbQuery } from "./dbQuery.js";
import { lookupErrorCode } from "./lookupErrorCode.js";
import { subscriptionLookup } from "./subscriptionLookup.js";
import { paymentStatus } from "./paymentStatus.js";
import { accountStatus } from "./accountStatus.js";
import { serviceStatus } from "./serviceStatus.js";
import { orderLookup } from "./orderLookup.js";
import { productLookup } from "./productLookup.js";
import { reloadHttpTools } from "./http-store.js";

let done = false;

export function registerAllTools(): void {
  if (done) return; // idempotent — safe if multiple agents boot in one process
  registerTool(dbQuery);
  registerTool(lookupErrorCode);
  registerTool(subscriptionLookup);
  registerTool(paymentStatus);
  registerTool(accountStatus);
  registerTool(serviceStatus);
  registerTool(orderLookup);
  registerTool(productLookup);
  // Admin-defined declarative HTTP tools (live config store).
  reloadHttpTools();
  done = true;
}
