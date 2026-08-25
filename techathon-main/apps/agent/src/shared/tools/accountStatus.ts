/**
 * shared/tools/accountStatus.ts
 *
 * Example shared tool: return a customer's account/login state, used by the
 * technical agent for access problems. Mocked here; a real system would query
 * the identity/auth service.
 */
import type { Tool } from "../core/types.js";

interface AccountState {
  locked: boolean;
  mfaEnabled: boolean;
  lastLogin: string;
}

const MOCK_ACCOUNTS: Record<string, AccountState> = {
  cust_001: { locked: false, mfaEnabled: true, lastLogin: "2026-06-22T08:14:00Z" },
  cust_002: { locked: true, mfaEnabled: false, lastLogin: "2026-05-30T19:02:00Z" },
  cust_003: { locked: false, mfaEnabled: true, lastLogin: "2026-06-24T11:40:00Z" },
  cust_004: { locked: false, mfaEnabled: true, lastLogin: "2026-06-25T06:05:00Z" },
  cust_005: { locked: false, mfaEnabled: false, lastLogin: "2026-06-23T17:22:00Z" },
  cust_006: { locked: true, mfaEnabled: false, lastLogin: "2026-06-01T09:10:00Z" },
  cust_007: { locked: false, mfaEnabled: true, lastLogin: "2026-06-24T22:48:00Z" },
  cust_008: { locked: false, mfaEnabled: false, lastLogin: "2026-06-20T13:33:00Z" },
  cust_009: { locked: false, mfaEnabled: true, lastLogin: "2026-06-25T05:19:00Z" },
  cust_010: { locked: true, mfaEnabled: true, lastLogin: "2026-06-19T15:00:00Z" },
};

export const accountStatus: Tool = {
  name: "accountStatus",
  description:
    "Look up a customer's account/login state. args: { customerId }. Returns { found, locked, mfaEnabled, lastLogin }.",
  async run(args: Record<string, unknown>): Promise<unknown> {
    const customerId = String(args.customerId ?? "");
    const acct = MOCK_ACCOUNTS[customerId];
    if (!acct) return { found: false, customerId: customerId || null };
    return { found: true, customerId, ...acct };
  },
};
