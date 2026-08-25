// Auto-suggest FAQs from repeated questions.
//
// Every resolved support run is "observed": its question is normalized and
// counted. Once the same question has been asked enough times and isn't already
// covered by an existing FAQ, we create a DISABLED FAQ draft (via the agent's
// config store) for an admin to review and enable in Platform > FAQ. This never
// affects the customer response — it's best-effort and fully swallowed on error.
import { recordCandidate, markCandidatePromoted, type FaqCandidate } from "./db";
import { agentAdmin } from "./agentAdmin";

// How many times a question must be asked (globally) before it's suggested.
export const FAQ_PROMOTION_THRESHOLD = 3;

/** Lowercase, strip punctuation, collapse whitespace — mirrors the agent's norm(). */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A short, human-friendly label derived from the question. */
function labelFromQuestion(question: string): string {
  const clean = question.replace(/\s+/g, " ").trim();
  const short = clean.length > 60 ? `${clean.slice(0, 57)}...` : clean;
  return `Suggested: ${short}`;
}

/**
 * Record a resolved support run and, if it crosses the threshold, suggest it as
 * an FAQ draft. Safe to call on every run — it self-guards on category/outcome.
 */
export function observeResolvedRun(state: any, message: string): void {
  try {
    const classification = state?.classification;
    const category: string = classification?.category ?? "support";
    const resolutionSummary: string = state?.resolution?.summary ?? "";

    // Only learn from genuinely resolved, single-issue support answers — never
    // greetings/FAQ/out-of-scope, escalations, or multi-issue merges (whose
    // combined answer wouldn't make a clean canned reply).
    if (category !== "support") return;
    if (!resolutionSummary.trim()) return;
    if (state?.escalation?.escalate) return;
    if (classification?.is_multi_issue) return;

    const normQuestion = normalizeQuestion(message);
    if (!normQuestion || normQuestion.split(" ").length < 2) return;

    const row = recordCandidate({
      normQuestion,
      sample: message.replace(/\s+/g, " ").trim(),
      intent: classification?.primary_intent ?? null,
      answer: resolutionSummary.trim(),
    });

    if (row.count >= FAQ_PROMOTION_THRESHOLD && row.promoted === 0) {
      // Fire-and-forget — promotion talks to the agent service over HTTP.
      void maybePromote(row).catch((err) =>
        console.error("[faqAuto] promote failed:", (err as Error).message)
      );
    }
  } catch (err) {
    console.error("[faqAuto] observe failed:", (err as Error).message);
  }
}

/**
 * Create a disabled FAQ draft for a frequently-asked question, unless an existing
 * FAQ already covers it. Marks the candidate promoted either way so we don't
 * retry it on every subsequent ask.
 */
async function maybePromote(row: FaqCandidate): Promise<void> {
  const normQuestion = row.norm_question;

  // Dedup against current FAQs using the same "contains" logic matchFaq uses:
  // if any trigger phrase is a substring of the asked question, it's covered.
  let covered = false;
  try {
    const { faqs } = (await agentAdmin.listFaqs()) as {
      faqs: { triggers: string[] }[];
    };
    covered = faqs.some((f) =>
      (f.triggers ?? []).some((t) => {
        const nt = normalizeQuestion(t);
        return nt.length > 0 && normQuestion.includes(nt);
      })
    );
  } catch (err) {
    // If we can't read FAQs, skip promotion this time and retry on the next ask.
    console.error("[faqAuto] dedup check failed:", (err as Error).message);
    return;
  }

  if (!covered) {
    await agentAdmin.createFaq({
      label: labelFromQuestion(row.sample_question),
      enabled: false,
      match: "contains",
      triggers: [row.sample_question],
      answer: row.answer,
    });
    console.log(`[faqAuto] suggested FAQ draft from question asked ${row.count}x: "${row.sample_question}"`);
  }

  markCandidatePromoted(row.id);
}
