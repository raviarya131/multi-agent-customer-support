/**
 * policies/faq.ts — the live, admin-editable FAQ / canned-response store.
 *
 * Some inbound messages don't need the specialist pipeline at all: greetings
 * have a single fixed reply, and so do common questions ("what are your hours?",
 * "where are you located?"). Admins define FAQ entries here — a set of trigger
 * phrases + one canned answer — and the pipeline checks them FIRST (like the
 * greeting short-circuit). A match returns the answer and skips all specialists.
 *
 * Persisted to runtime-config/faq.json. Empty by default, so nothing changes
 * until an admin adds an entry.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { log } from "../core/logger.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = resolve(HERE, "../../../runtime-config");
const FAQ_FILE = join(CONFIG_DIR, "faq.json");

/** How an entry's triggers are matched against the customer message. */
export const faqMatchModes = ["contains", "exact", "regex"] as const;
export type FaqMatchMode = (typeof faqMatchModes)[number];

export const faqEntrySchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().min(1, "label is required"),
  enabled: z.boolean().default(true),
  match: z.enum(faqMatchModes).default("contains"),
  triggers: z.array(z.string().min(1)).min(1, "add at least one trigger phrase"),
  answer: z.string().min(1, "an answer is required"),
});
export type FaqEntryInput = z.infer<typeof faqEntrySchema>;
export interface FaqEntry extends FaqEntryInput {
  id: string;
  enabled: boolean;
  match: FaqMatchMode;
}

let cache: FaqEntry[] | null = null;

/**
 * Dummy/default FAQ entries shipped on first run so the browsable Help Center
 * isn't empty out of the box. Trigger phrases are drawn from the agents'
 * declarative use-case `example_utterances`; answers are short, customer-ready
 * summaries of each topic. Admins can edit or delete these freely afterwards.
 */
const DEFAULT_FAQS: Omit<FaqEntry, "id">[] = [
  {
    label: "Return policy",
    enabled: true,
    match: "contains",
    triggers: ["what is your return policy", "can i return this item", "how many days do i have to return", "is this item eligible for return"],
    answer:
      "You can return most items within 30 days of delivery, as long as they're unused and in their original packaging. Some items (like final-sale or perishable goods) aren't returnable. To start a return, open the order in your account and choose \"Return item\".",
  },
  {
    label: "Refund eligibility",
    enabled: true,
    match: "contains",
    triggers: ["can i get a refund", "am i eligible for a refund", "is this charge refundable", "how do refunds work"],
    answer:
      "Refunds are available for eligible returns within the 30-day window and for confirmed duplicate charges. Once approved, refunds are issued to your original payment method and typically take 5-10 business days to appear.",
  },
  {
    label: "Order tracking",
    enabled: true,
    match: "contains",
    triggers: ["where is my order", "track my delivery", "when will my package arrive", "has my order shipped yet"],
    answer:
      "You can track your order anytime from the order details page in your account, where you'll find the carrier, tracking number, and estimated delivery date. If your order is delayed, the revised ETA will show there too.",
  },
  {
    label: "Cancel or change an order",
    enabled: true,
    match: "contains",
    triggers: ["can i cancel my order", "how do i cancel my order", "i need to change my order", "cancel my subscription"],
    answer:
      "Orders can be changed or cancelled while they're still being prepared. Open the order in your account and choose \"Cancel\" or \"Edit\". Once an order has shipped it can no longer be cancelled, but you can return it after delivery.",
  },
  {
    label: "Product availability",
    enabled: true,
    match: "contains",
    triggers: ["is this in stock", "when will this be back in stock", "do you have this item available", "is the item available"],
    answer:
      "Live stock is shown on each product page. If an item is out of stock, you can opt in to a back-in-stock notification from that page and we'll email you as soon as it returns.",
  },
  {
    label: "Payment failed",
    enabled: true,
    match: "contains",
    triggers: ["why did my payment fail", "my payment was declined", "my card was declined", "i can't complete my payment"],
    answer:
      "Payments are usually declined due to an incorrect card detail, insufficient funds, or your bank flagging the transaction. Double-check your card number, expiry, and billing address, then try again or use a different payment method. If it keeps failing, contact your bank.",
  },
  {
    label: "Account and login",
    enabled: true,
    match: "contains",
    triggers: ["i can't log in", "i forgot my password", "how do i reset my password", "i'm locked out of my account"],
    answer:
      "If you can't sign in, use the \"Forgot password\" link on the login page to reset it via email. If your account is locked after several attempts, wait a few minutes and try again. Make sure you're using the same email you signed up with.",
  },
  {
    label: "Service status",
    enabled: true,
    match: "contains",
    triggers: ["is the site down", "is the website not working", "are you having an outage", "the app isn't working"],
    answer:
      "If pages aren't loading, try refreshing or clearing your browser cache first. Most issues are temporary. If the problem continues, let us know what you were doing and any error message you saw so we can investigate.",
  },
];

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

function readAll(): FaqEntry[] {
  if (cache) return cache;
  if (!existsSync(FAQ_FILE)) {
    // First run: seed dummy FAQs so the browsable Help Center isn't empty. Once
    // written, the file is the source of truth — admin edits/deletions persist.
    const seeded: FaqEntry[] = DEFAULT_FAQS.map((e) => ({ ...e, id: randomUUID() }));
    save(seeded);
    return cache!;
  }
  try {
    const raw = JSON.parse(readFileSync(FAQ_FILE, "utf8"));
    const arr = Array.isArray(raw) ? raw : [];
    const out: FaqEntry[] = [];
    for (const item of arr) {
      const parsed = faqEntrySchema.safeParse(item);
      if (parsed.success) {
        out.push({
          ...parsed.data,
          id: parsed.data.id || randomUUID(),
          enabled: parsed.data.enabled ?? true,
          match: parsed.data.match ?? "contains",
        });
      }
    }
    cache = out;
  } catch {
    cache = [];
  }
  return cache;
}

function save(entries: FaqEntry[]): void {
  ensureDir();
  writeFileSync(FAQ_FILE, JSON.stringify(entries, null, 2), "utf8");
  cache = entries;
}

/** Every FAQ entry (enabled and disabled), for the admin editor. */
export function listFaqs(): FaqEntry[] {
  return [...readAll()];
}

/** A customer-safe FAQ — only what's shown when browsing (no triggers/match config). */
export interface PublicFaq {
  id: string;
  label: string;
  answer: string;
}

/**
 * Enabled FAQs in a customer-safe shape, for the browsable Help Center list.
 * Internal matching config (triggers, match mode, regex) is intentionally omitted.
 */
export function listPublicFaqs(): PublicFaq[] {
  return readAll()
    .filter((e) => e.enabled !== false)
    .map((e) => ({ id: e.id, label: e.label, answer: e.answer }));
}

export function invalidateFaqCache(): void {
  cache = null;
}

/** Validate + persist one FAQ entry (create when id is absent). */
export function upsertFaq(input: unknown): FaqEntry {
  const parsed = faqEntrySchema.parse(input);
  const id = parsed.id || randomUUID();
  const entry: FaqEntry = { ...parsed, id, enabled: parsed.enabled, match: parsed.match };
  const next = readAll().filter((e) => e.id !== id);
  next.push(entry);
  save(next);
  log("config", "faq-store", "faq upserted", { id, label: entry.label });
  return entry;
}

export function deleteFaq(id: string): void {
  save(readAll().filter((e) => e.id !== id));
  log("config", "faq-store", "faq deleted", { id });
}

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Does one trigger match the message under the entry's match mode? */
function triggerHits(message: string, trigger: string, mode: FaqMatchMode): boolean {
  const m = norm(message);
  const t = norm(trigger);
  if (!t) return false;
  if (mode === "exact") return m === t;
  if (mode === "regex") {
    try {
      return new RegExp(trigger, "i").test(message);
    } catch {
      return false; // an invalid pattern simply never matches
    }
  }
  // "contains": whole-word-ish substring match on the normalized text.
  return m.includes(t);
}

export interface FaqMatch {
  id: string;
  label: string;
  answer: string;
}

/**
 * First enabled FAQ entry whose triggers match the message, or null. Checked at
 * the very start of classification so a canned answer skips the pipeline.
 */
export function matchFaq(message: string): FaqMatch | null {
  if (!message || !message.trim()) return null;
  for (const entry of readAll()) {
    if (entry.enabled === false) continue;
    if (entry.triggers.some((t) => triggerHits(message, t, entry.match))) {
      return { id: entry.id, label: entry.label, answer: entry.answer };
    }
  }
  return null;
}
