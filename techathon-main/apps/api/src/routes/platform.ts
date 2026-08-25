import express from "express";
import { agentAdmin } from "../agentAdmin";
import { recordConfigAudit, getLatestRun, getMessages, listConfigAudit } from "../db";
import { getSlaConfig, setSlaConfig } from "../sla";
import { requireRole, type AuthedRequest } from "./middleware";

const router = express.Router();

function audit(req: AuthedRequest, action: string, target: string, detail?: string) {
  const a = req.account!;
  recordConfigAudit({ actor_id: a.id, actor_name: a.name, action, target, detail: detail ?? null });
}

async function platform(res: express.Response, fn: () => Promise<any>) {
  try { res.json(await fn()); } catch (e) { res.status(400).json({ error: (e as Error).message }); }
}

// KB docs
router.get("/kb", requireRole("admin"), (_req, res) => platform(res, () => agentAdmin.listKb()));
router.put("/kb/:file", requireRole("admin"), (req: AuthedRequest, res) =>
  platform(res, async () => {
    const out = await agentAdmin.putKb(req.params.file, String((req.body ?? {}).content ?? ""));
    audit(req, "kb.upsert", req.params.file);
    return out;
  })
);
router.delete("/kb/:file", requireRole("admin"), (req: AuthedRequest, res) =>
  platform(res, async () => {
    const out = await agentAdmin.deleteKb(req.params.file);
    audit(req, "kb.delete", req.params.file);
    return out;
  })
);

router.post("/kb/suggest", requireRole("admin"), (req: AuthedRequest, res) =>
  platform(res, async () => {
    const body = (req.body ?? {}) as { ticket_id?: string; source?: Record<string, unknown> };
    let source: Record<string, unknown> = body.source ?? {};
    if (body.ticket_id) {
      const state: any = getLatestRun(body.ticket_id);
      if (!state) throw new Error("No run found for that ticket");
      const reports: any[] = Array.isArray(state.agent_reports) ? state.agent_reports : [];
      const firstCustomer = getMessages(body.ticket_id).find((m) => m.role === "customer")?.text ?? state.message ?? "";
      source = {
        question: firstCustomer,
        resolution: state.resolution?.summary ?? "",
        findings: [...reports.flatMap((r) => (Array.isArray(r.findings) ? r.findings : [])), ...(Array.isArray(state.resolution?.findings) ? state.resolution.findings : [])].slice(0, 12),
        actions: [...reports.flatMap((r) => (Array.isArray(r.actions) ? r.actions : [])), ...(Array.isArray(state.resolution?.actions) ? state.resolution.actions : [])].slice(0, 12),
        domain: state.classification?.primary_intent ?? undefined,
      };
    }
    const out = await agentAdmin.generateKb(source);
    audit(req, "kb.suggest", body.ticket_id ?? "manual");
    return out;
  })
);

// Use cases
router.get("/usecases", requireRole("admin"), (_req, res) => platform(res, () => agentAdmin.listUseCases()));
router.put("/usecases/:agent", requireRole("admin"), (req: AuthedRequest, res) =>
  platform(res, async () => {
    const out = await agentAdmin.putUseCase(req.params.agent, req.body);
    audit(req, "usecase.upsert", `${req.params.agent}/${(req.body ?? {}).use_case_id ?? "?"}`);
    return out;
  })
);
router.delete("/usecases/:agent/:id", requireRole("admin"), (req: AuthedRequest, res) =>
  platform(res, async () => {
    const out = await agentAdmin.deleteUseCase(req.params.agent, req.params.id);
    audit(req, "usecase.delete", `${req.params.agent}/${req.params.id}`);
    return out;
  })
);

// Tools
router.get("/tools", requireRole("admin"), (_req, res) => platform(res, () => agentAdmin.listTools()));
router.put("/tools/:name", requireRole("admin"), (req: AuthedRequest, res) =>
  platform(res, async () => {
    const out = await agentAdmin.putTool(req.params.name, req.body);
    audit(req, "tool.upsert", req.params.name, JSON.stringify(req.body?.url_template ?? ""));
    return out;
  })
);
router.delete("/tools/:name", requireRole("admin"), (req: AuthedRequest, res) =>
  platform(res, async () => {
    const out = await agentAdmin.deleteTool(req.params.name);
    audit(req, "tool.delete", req.params.name);
    return out;
  })
);

// Policies
router.get("/policies", requireRole("admin"), (_req, res) => platform(res, () => agentAdmin.getPolicies()));
router.put("/policies", requireRole("admin"), (req: AuthedRequest, res) =>
  platform(res, async () => {
    const out = await agentAdmin.putPolicies(req.body);
    audit(req, "policies.update", "policies");
    return out;
  })
);

// Specialists
router.get("/specialists", requireRole("admin"), (_req, res) => platform(res, () => agentAdmin.listSpecialists()));
router.put("/specialists/:name", requireRole("admin"), (req: AuthedRequest, res) =>
  platform(res, async () => {
    const out = await agentAdmin.putSpecialist(req.params.name, req.body);
    audit(req, "agent.upsert", req.params.name);
    return out;
  })
);
router.delete("/specialists/:name", requireRole("admin"), (req: AuthedRequest, res) =>
  platform(res, async () => {
    const out = await agentAdmin.deleteSpecialist(req.params.name);
    audit(req, "agent.delete", req.params.name);
    return out;
  })
);

// FAQ
router.get("/faq", requireRole("admin"), (_req, res) => platform(res, () => agentAdmin.listFaqs()));
router.post("/faq", requireRole("admin"), (req: AuthedRequest, res) =>
  platform(res, async () => {
    const out = await agentAdmin.createFaq(req.body);
    audit(req, "faq.create", out?.faq?.label ?? "faq");
    return out;
  })
);
router.put("/faq/:id", requireRole("admin"), (req: AuthedRequest, res) =>
  platform(res, async () => {
    const out = await agentAdmin.putFaq(req.params.id, req.body);
    audit(req, "faq.upsert", out?.faq?.label ?? req.params.id);
    return out;
  })
);
router.delete("/faq/:id", requireRole("admin"), (req: AuthedRequest, res) =>
  platform(res, async () => {
    const out = await agentAdmin.deleteFaq(req.params.id);
    audit(req, "faq.delete", req.params.id);
    return out;
  })
);

// SLA policy (per-department × priority deadlines, in hours)
router.get("/sla", requireRole("admin"), (_req, res) => res.json(getSlaConfig()));
router.put("/sla", requireRole("admin"), (req: AuthedRequest, res) => {
  try {
    const out = setSlaConfig(req.body ?? {});
    audit(req, "sla.update", "sla.policy");
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// Help Center (customer-facing self-service articles)
router.get("/helpcenter", requireRole("admin"), (_req, res) => platform(res, () => agentAdmin.listHelp()));
router.put("/helpcenter/:file", requireRole("admin"), (req: AuthedRequest, res) =>
  platform(res, async () => {
    const out = await agentAdmin.putHelp(req.params.file, String((req.body ?? {}).content ?? ""));
    audit(req, "helpcenter.upsert", req.params.file);
    return out;
  })
);
router.delete("/helpcenter/:file", requireRole("admin"), (req: AuthedRequest, res) =>
  platform(res, async () => {
    const out = await agentAdmin.deleteHelp(req.params.file);
    audit(req, "helpcenter.delete", req.params.file);
    return out;
  })
);

// Audit feed
router.get("/audit", requireRole("admin"), (_req, res) => {
  res.json({ audit: listConfigAudit(200) });
});

export default router;
