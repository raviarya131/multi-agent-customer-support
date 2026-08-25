/**
 * admin.ts — the agent service's live config-store API.
 *
 * These routes let the application API (and only the API — they're behind a
 * shared-secret header) mutate the agent's runtime configuration without a
 * restart: KB docs, declarative use cases, and SSRF-safe HTTP tools. Each
 * mutation validates input and hot-reloads the affected part.
 */
import { Router } from "express";
import { ENV } from "./env";
import { deleteKbDoc, listKbDocs, readKbDoc, writeKbDoc } from "./shared/kb/store";
import { generateKbArticle, type KbSource } from "./shared/kb/generate";
import {
  deleteUseCase,
  listUseCases,
  upsertUseCase,
} from "./shared/handlers/usecase-store";
import { listSpecs, deleteSpec, reloadHttpTools, upsertSpec } from "./shared/tools/http-store";
import { listTools } from "./shared/tools/registry";
import { registerAllTools } from "./shared/tools/index";
import { getPolicies, updatePolicies } from "./shared/policies/store";
import {
  deleteAgentRecord,
  initCustomAgents,
  listAgentRecords,
  listDomains,
  upsertAgentRecord,
} from "./shared/policies/agents";
import { deleteFaq, listFaqs, upsertFaq } from "./shared/policies/faq";
import { deleteHelpArticle, listHelpArticles, writeHelpArticle } from "./shared/help/store";

export const adminRouter = Router();

// Ensure built-ins + stored HTTP tools are present before serving config reads.
registerAllTools();
// Re-create any admin-defined specialist agents so they're editable + routable.
initCustomAgents();

adminRouter.use((req, res, next) => {
  if ((req.header("x-admin-token") || "") !== ENV.ADMIN_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

function fail(res: any, err: unknown) {
  res.status(400).json({ error: (err as Error).message || "bad request" });
}

// ---- KB --------------------------------------------------------------------
adminRouter.get("/kb", (_req, res) => res.json({ docs: listKbDocs() }));

adminRouter.put("/kb/:file", (req, res) => {
  try {
    const content = String((req.body ?? {}).content ?? "");
    res.json({ doc: writeKbDoc(req.params.file, content) });
  } catch (e) {
    fail(res, e);
  }
});

adminRouter.delete("/kb/:file", (req, res) => {
  try {
    deleteKbDoc(req.params.file);
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
});

// Generate a suggested KB article draft from a resolved interaction. Returns the
// draft only — saving is a separate, explicit PUT /kb/:file by the admin.
adminRouter.post("/kb/generate", async (req, res) => {
  try {
    const draft = await generateKbArticle((req.body ?? {}) as KbSource);
    res.json({ draft });
  } catch (e) {
    fail(res, e);
  }
});

// ---- Use cases -------------------------------------------------------------
// Agent list comes from the specialist registry (built-ins + admin-defined) so
// newly added agents appear here immediately, and removed ones disappear.
adminRouter.get("/usecases", (_req, res) =>
  res.json({ agents: listDomains(), usecases: listUseCases() })
);

adminRouter.put("/usecases/:agent", (req, res) => {
  try {
    res.json(upsertUseCase(req.params.agent, req.body));
  } catch (e) {
    fail(res, e);
  }
});

adminRouter.delete("/usecases/:agent/:id", (req, res) => {
  try {
    res.json({ ids: deleteUseCase(req.params.agent, req.params.id) });
  } catch (e) {
    fail(res, e);
  }
});

// ---- Tools -----------------------------------------------------------------
adminRouter.get("/tools", (_req, res) => {
  const declarativeNames = new Set(listSpecs().map((s) => s.name));
  const builtins = listTools()
    .map((t) => ({ name: t.name, description: t.description }))
    .filter((t) => !declarativeNames.has(t.name));
  res.json({ builtins, declarative: listSpecs() });
});

adminRouter.put("/tools/:name", (req, res) => {
  try {
    const spec = upsertSpec({ ...req.body, name: req.params.name });
    res.json({ spec });
  } catch (e) {
    fail(res, e);
  }
});

adminRouter.delete("/tools/:name", (req, res) => {
  try {
    deleteSpec(req.params.name);
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
});

adminRouter.post("/reload", (_req, res) => {
  reloadHttpTools();
  res.json({ ok: true });
});

// ---- Policies (hard checks, escalation rules, intent router) ----------------
adminRouter.get("/policies", (_req, res) => res.json({ policies: getPolicies() }));

adminRouter.put("/policies", (req, res) => {
  try {
    res.json({ policies: updatePolicies(req.body) });
  } catch (e) {
    fail(res, e);
  }
});

// ---- Specialist agents -----------------------------------------------------
adminRouter.get("/agents", (_req, res) => res.json({ agents: listAgentRecords() }));

adminRouter.put("/agents/:name", (req, res) => {
  try {
    res.json({ agent: upsertAgentRecord({ ...req.body, name: req.params.name }) });
  } catch (e) {
    fail(res, e);
  }
});

adminRouter.delete("/agents/:name", (req, res) => {
  try {
    deleteAgentRecord(req.params.name);
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
});

// ---- FAQ / canned responses ------------------------------------------------
adminRouter.get("/faq", (_req, res) => res.json({ faqs: listFaqs() }));

adminRouter.put("/faq/:id", (req, res) => {
  try {
    res.json({ faq: upsertFaq({ ...req.body, id: req.params.id }) });
  } catch (e) {
    fail(res, e);
  }
});

// Create (no id yet) — the store mints one.
adminRouter.post("/faq", (req, res) => {
  try {
    res.json({ faq: upsertFaq(req.body) });
  } catch (e) {
    fail(res, e);
  }
});

adminRouter.delete("/faq/:id", (req, res) => {
  try {
    deleteFaq(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
});

// ---- Help Center (customer-facing self-service articles) -------------------
adminRouter.get("/helpcenter", (_req, res) => res.json({ articles: listHelpArticles() }));

adminRouter.put("/helpcenter/:file", (req, res) => {
  try {
    const content = String((req.body ?? {}).content ?? "");
    res.json({ article: writeHelpArticle(req.params.file, content) });
  } catch (e) {
    fail(res, e);
  }
});

adminRouter.delete("/helpcenter/:file", (req, res) => {
  try {
    deleteHelpArticle(req.params.file);
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
});
