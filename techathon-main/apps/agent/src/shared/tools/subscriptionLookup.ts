/**
 * shared/tools/subscriptionLookup.ts
 *
 * Example shared tool: return a customer's current subscription. Mocked here;
 * in a real system this would query the subscriptions table. Same "dumb tool"
 * pattern as dbQuery — fetch and return data, no business logic.
 */
import type { Tool } from "../core/types.js";

interface Subscription {
  plan: string;
  seats: number;
  status: "active" | "past_due" | "canceled";
  renewsOn: string;
}

const MOCK_SUBSCRIPTIONS: Record<string, Subscription> = {
  cust_001: { plan: "Pro", seats: 5, status: "active", renewsOn: "2026-07-01" },
  cust_002: { plan: "Starter", seats: 1, status: "past_due", renewsOn: "2026-06-30" },
  cust_003: { plan: "Business", seats: 20, status: "active", renewsOn: "2026-09-15" },
  cust_004: { plan: "Enterprise", seats: 250, status: "active", renewsOn: "2027-01-01" },
  cust_005: { plan: "Pro", seats: 8, status: "active", renewsOn: "2026-07-19" },
  cust_006: { plan: "Starter", seats: 2, status: "canceled", renewsOn: "2026-06-10" },
  cust_007: { plan: "Business", seats: 15, status: "past_due", renewsOn: "2026-06-28" },
  cust_008: { plan: "Free", seats: 1, status: "active", renewsOn: "—" },
  cust_009: { plan: "Enterprise", seats: 500, status: "active", renewsOn: "2026-12-01" },
  cust_010: { plan: "Pro", seats: 4, status: "active", renewsOn: "2026-08-05" },
};

export const subscriptionLookup: Tool = {
  name: "subscriptionLookup",
  description:
    "Look up a customer's current subscription. args: { customerId }. Returns { found, plan, seats, status, renewsOn }.",
  async run(args: Record<string, unknown>): Promise<unknown> {
    const customerId = String(args.customerId ?? "");
    const sub = MOCK_SUBSCRIPTIONS[customerId];
    if (!sub) return { found: false, customerId: customerId || null };
    return { found: true, customerId, ...sub };
  },
};
