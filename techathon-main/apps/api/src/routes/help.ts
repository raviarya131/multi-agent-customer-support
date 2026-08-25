import express from "express";
import { randomUUID } from "node:crypto";
import { askAgentHelp, listAgentFaqs } from "../agentClient";
import { requireRole, type AuthedRequest } from "./middleware";

const router = express.Router();

// Browsable FAQ list for signed-in customers — enabled entries only, read-only.
// Lets customers self-deflect by scanning answers before opening a ticket.
router.get("/faqs", requireRole("user"), async (_req: AuthedRequest, res) => {
  try {
    res.json(await listAgentFaqs());
  } catch (err) {
    res.status(502).json({ error: "FAQs are unavailable right now.", detail: (err as Error).message });
  }
});

// Self-service Help Center. Signed-in customers ask freely and get a grounded
// answer from the customer-facing articles. This is ephemeral — NO ticket and
// NO run are persisted; it's deflection before escalation.
router.post("/ask", requireRole("user"), async (req: AuthedRequest, res) => {
  const message = String(req.body?.message ?? "").trim();
  if (!message) return res.status(400).json({ error: "message is required" });
  try {
    const result = await askAgentHelp(message, `help-${randomUUID().slice(0, 8)}`);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: "Help is unavailable right now.", detail: (err as Error).message });
  }
});

export default router;
