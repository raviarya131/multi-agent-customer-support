/**
 * shared/tools/paymentStatus.ts
 *
 * Example shared tool: return the status of a customer's most recent payment.
 * Mocked here; a real system would query the payments/billing provider.
 */
import type { Tool } from "../core/types.js";

interface PaymentRecord {
  method: string;
  lastPayment: {
    amount: number;
    status: "succeeded" | "failed" | "pending";
    declineReason?: string;
  };
}

const MOCK_PAYMENTS: Record<string, PaymentRecord> = {
  cust_001: {
    method: "Visa ****4242",
    lastPayment: { amount: 49, status: "succeeded" },
  },
  cust_002: {
    method: "Mastercard ****1881",
    lastPayment: { amount: 12, status: "failed", declineReason: "insufficient_funds" },
  },
  cust_003: {
    method: "Visa ****3091",
    lastPayment: { amount: 399, status: "succeeded" },
  },
  cust_004: {
    method: "Amex ****1007",
    lastPayment: { amount: 4800, status: "succeeded" },
  },
  cust_005: {
    method: "Visa ****7755",
    lastPayment: { amount: 79, status: "pending" },
  },
  cust_006: {
    method: "Mastercard ****2240",
    lastPayment: { amount: 24, status: "failed", declineReason: "expired_card" },
  },
  cust_007: {
    method: "Visa ****6612",
    lastPayment: { amount: 299, status: "failed", declineReason: "card_declined" },
  },
  cust_008: {
    method: "—",
    lastPayment: { amount: 0, status: "succeeded" },
  },
  cust_009: {
    method: "Wire transfer",
    lastPayment: { amount: 12000, status: "succeeded" },
  },
  cust_010: {
    method: "Visa ****9090",
    lastPayment: { amount: 49, status: "succeeded" },
  },
};

export const paymentStatus: Tool = {
  name: "paymentStatus",
  description:
    "Look up a customer's most recent payment status. args: { customerId }. Returns { found, method, lastPayment }.",
  async run(args: Record<string, unknown>): Promise<unknown> {
    const customerId = String(args.customerId ?? "");
    const rec = MOCK_PAYMENTS[customerId];
    if (!rec) return { found: false, customerId: customerId || null };
    return { found: true, customerId, ...rec };
  },
};
