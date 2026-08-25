/**
 * shared/tools/dbQuery.ts
 *
 * Example shared tool: a mock data lookup. In a real system this would query
 * SQLite/Postgres; here it returns canned data so the pipeline runs end to end.
 * Billing, policy, and technical use cases could all use it (scoped per use case).
 *
 * Stage 3 replaces the mock body with a real SQL query; the signature stays.
 */
import type { Tool } from "../core/types.js";

// Tiny fake table of charges keyed by customerId.
const MOCK_CHARGES: Record<string, Array<{ id: string; amount: number; desc: string }>> = {
  cust_001: [
    { id: "txn_1", amount: 49, desc: "Pro plan monthly" },
    { id: "txn_2", amount: 49, desc: "Pro plan monthly (duplicate)" },
  ],
  cust_002: [{ id: "txn_9", amount: 12, desc: "Add-on: extra seats" }],
  cust_003: [
    { id: "txn_21", amount: 399, desc: "Business plan monthly" },
    { id: "txn_22", amount: 60, desc: "Add-on: 3 extra seats" },
  ],
  cust_004: [{ id: "txn_30", amount: 4800, desc: "Enterprise plan annual" }],
  cust_005: [
    { id: "txn_41", amount: 79, desc: "Pro plan monthly" },
    { id: "txn_42", amount: 79, desc: "Pro plan monthly (duplicate)" },
  ],
  cust_006: [{ id: "txn_51", amount: 24, desc: "Starter plan monthly" }],
  cust_007: [
    { id: "txn_61", amount: 299, desc: "Business plan monthly" },
    { id: "txn_62", amount: 299, desc: "Business plan monthly (retry)" },
  ],
  cust_008: [],
  cust_009: [{ id: "txn_70", amount: 12000, desc: "Enterprise plan annual" }],
  cust_010: [{ id: "txn_81", amount: 49, desc: "Pro plan monthly" }],
};

export const dbQuery: Tool = {
  name: "dbQuery",
  description:
    "Look up billing records for a customer. args: { customerId }. Returns { charges }.",
  async run(args: Record<string, unknown>): Promise<unknown> {
    const customerId = String(args.customerId ?? "");
    return { charges: MOCK_CHARGES[customerId] ?? [] };
  },
};
