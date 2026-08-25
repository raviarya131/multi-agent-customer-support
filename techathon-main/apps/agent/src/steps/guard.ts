// Step 1 — Hard-signal guard.
// Pure-ish function. Deterministic phrase screen (NOT mood). Sets force_escalation
// but never stops the pipeline; agents still run to build handoff context.
//
// The phrase list is now admin-editable: it comes from the live policy store
// (seeded with the original signals), so behavior is identical until an admin
// changes the hard-check policy in the Platform console.
import type { Guard } from "../contracts/types";
import { getPolicies } from "../shared/policies/store";

export function runGuard(message: string): Guard {
  const { guard } = getPolicies();
  if (!guard.enabled) {
    return { force_escalation: false, reason: null, matched_phrase: null };
  }
  const text = message.toLowerCase();
  for (const s of guard.signals) {
    if (text.includes(s.phrase.toLowerCase())) {
      return {
        force_escalation: true,
        reason: `Hard signal detected (${s.category})`,
        matched_phrase: s.phrase,
      };
    }
  }
  return { force_escalation: false, reason: null, matched_phrase: null };
}
