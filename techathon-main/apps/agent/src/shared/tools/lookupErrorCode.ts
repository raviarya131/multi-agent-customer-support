/**
 * shared/tools/lookupErrorCode.ts
 *
 * Example shared tool: map a product error code to its known cause, fix, and
 * severity. In a real system this would query an incident/runbook database;
 * here it returns canned data so the technical agent runs end to end.
 *
 * Tools are "dumb": look up and return data. No LLM calls, no business logic.
 */
import type { Tool } from "../core/types.js";

interface ErrorInfo {
  cause: string;
  fix: string;
  severity: "low" | "medium" | "high";
}

// Tiny fake storefront runbook keyed by error code (normalized to upper-case).
const KNOWN_ERRORS: Record<string, ErrorInfo> = {
  ERR_CHECKOUT_5XX: {
    cause:
      "A transient error in the checkout service prevented the order from being placed. No order or charge was created.",
    fix: "Refresh the page, clear the cart cache (remove and re-add the item), and retry checkout. If it persists, escalate with the trace id.",
    severity: "medium",
  },
  ERR_PAYMENT_GATEWAY: {
    cause: "The payment session expired before the payment was submitted, so the payment page failed to load or hung.",
    fix: "Refresh the checkout page, disable ad/script blockers for the site, and retry. No order is placed until payment succeeds.",
    severity: "medium",
  },
  ERR_CART_SYNC: {
    cause: "A stale browser session caused the cart to show outdated items or quantities (display-only).",
    fix: "Refresh the page, or sign out and back in, to resync the cart. This does not affect any placed order.",
    severity: "low",
  },
};

export const lookupErrorCode: Tool = {
  name: "lookupErrorCode",
  description:
    "Look up a product error code. args: { errorCode }. Returns { found, cause, fix, severity }.",
  async run(args: Record<string, unknown>): Promise<unknown> {
    const code = String(args.errorCode ?? "").trim().toUpperCase();
    const info = KNOWN_ERRORS[code];
    if (!info) {
      return { found: false, errorCode: code || null };
    }
    return { found: true, errorCode: code, ...info };
  },
};
