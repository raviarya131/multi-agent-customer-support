import type {
  Account,
  CaseNote,
  CollabOverview,
  ConfigAuditRecord,
  EscalationRecord,
  FaqEntry,
  FeedbackRow,
  HelpAnswer,
  HelpArticle,
  HttpToolSpec,
  HumanAgent,
  HumanAgentAdmin,
  KbDoc,
  KbDraft,
  Message,
  NotificationRecord,
  PipelineProgressEvent,
  PolicyConfig,
  PublicFaq,
  RunSessionDetail,
  RunSessionRow,
  SlaConfig,
  SpecialistAgentRecord,
  StoredUseCase,
  TicketDashboardDetail,
  TicketDashboardRow,
  TicketDetail,
  TicketSummary,
  ToolInfo,
} from "./types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4100";

// ---- Token storage ---------------------------------------------------------
// Opaque session token kept in localStorage and attached as a Bearer header.
const TOKEN_KEY = "se_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  if (typeof window !== "undefined") localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

// ---- Auth ------------------------------------------------------------------

export async function apiLogin(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string; token?: string; account?: Account }> {
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || "Login failed" };
    return { ok: true, token: data.token, account: data.account };
  } catch {
    return { ok: false, error: "Network error — is the API running?" };
  }
}

export async function apiSignup(
  name: string,
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string; token?: string; account?: Account }> {
  try {
    const res = await fetch(`${API}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || "Sign up failed" };
    return { ok: true, token: data.token, account: data.account };
  } catch {
    return { ok: false, error: "Network error — is the API running?" };
  }
}

export async function apiLogout(): Promise<void> {
  try {
    await fetch(`${API}/api/auth/logout`, { method: "POST", headers: authHeaders() });
  } catch {
    // best-effort
  }
}

export async function getMe(): Promise<Account | null> {
  try {
    const res = await fetch(`${API}/api/auth/me`, { headers: authHeaders() });
    if (!res.ok) return null;
    const data = (await res.json()) as { account: Account };
    return data.account ?? null;
  } catch {
    return null;
  }
}

// ---- Tickets (customer-facing) ---------------------------------------------

/** Create a ticket or add a follow-up with live pipeline progress (SSE). */
export async function submitTicketStream(
  message: string,
  onProgress: (evt: PipelineProgressEvent) => void,
  ticketId?: string,
  linkTo?: string
): Promise<TicketDetail> {
  const res = await fetch(`${API}/api/tickets/stream`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      message,
      ticket_id: ticketId || undefined,
      link_to: linkTo || undefined,
    }),
  });

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || "Request failed");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: TicketDetail | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const evt = JSON.parse(line.slice(6)) as PipelineProgressEvent;
      onProgress(evt);
      // `complete` always carries the result. Note: greeting / out-of-scope
      // replies are ephemeral and intentionally have an empty ticket_id, so we
      // must NOT gate on ticket_id here or those replies would be dropped.
      if (evt.type === "complete") {
        result = {
          ticket_id: evt.ticket_id ?? "",
          display_id: evt.display_id,
          status: evt.status,
          summary: evt.summary,
          run: evt.run ?? null,
          messages: evt.messages ?? [],
          escalation_id: evt.escalation_id,
        };
      }
      if (evt.type === "error") throw new Error(evt.message || "Pipeline failed");
    }
  }

  if (!result) throw new Error("Pipeline finished without a result");
  return result;
}

/** Create a ticket or add a follow-up, then run the pipeline (non-streaming fallback). */
export async function submitTicket(
  message: string,
  ticketId?: string,
  linkTo?: string
): Promise<TicketDetail> {
  const res = await fetch(`${API}/api/tickets`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      message,
      ticket_id: ticketId || undefined,
      link_to: linkTo || undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data as TicketDetail;
}

/** Latest run + full message thread for one ticket (used to reopen a chat). */
export async function getTicket(ticketId: string): Promise<TicketDetail | null> {
  try {
    const res = await fetch(`${API}/api/tickets/${encodeURIComponent(ticketId)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as TicketDetail;
  } catch {
    return null;
  }
}

/**
 * Customer posts a message into an open escalation (live human chat). Returns
 * the refreshed thread, or `{ needsPipeline: true }` when there's no open
 * escalation so the caller can fall back to the AI pipeline.
 */
export async function postCustomerMessage(
  ticketId: string,
  text: string
): Promise<{ messages?: Message[]; needsPipeline?: boolean; error?: string }> {
  try {
    const res = await fetch(`${API}/api/tickets/${encodeURIComponent(ticketId)}/messages`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ text }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 || data?.error === "no_open_escalation") {
      return { needsPipeline: true };
    }
    if (!res.ok) return { error: data?.error || "Could not send message" };
    return { messages: (data?.messages ?? []) as Message[] };
  } catch {
    return { error: "Network error" };
  }
}

/** Tickets for the sidebar, scoped to the signed-in customer. */
export async function listTickets(): Promise<TicketSummary[]> {
  try {
    const res = await fetch(`${API}/api/tickets`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as { tickets: TicketSummary[] };
    return data.tickets ?? [];
  } catch {
    return [];
  }
}

/** Permanently delete a ticket and its history. */
export async function deleteTicket(ticketId: string): Promise<void> {
  try {
    await fetch(`${API}/api/tickets/${encodeURIComponent(ticketId)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  } catch {
    // best-effort; the list refresh will reflect server truth
  }
}

// ---- Escalation dashboard --------------------------------------------------

export type EscalationScope = "admin" | "manager" | "agent";
export interface EscalationViewer {
  id: string; name: string; email: string; role: string;
  agent_id?: string | null;
  level?: string | null; department?: string | null;
}

export async function listEscalations(): Promise<{
  escalations: EscalationRecord[];
  agents: HumanAgent[];
  scope?: EscalationScope;
  me?: EscalationViewer;
}> {
  try {
    const res = await fetch(`${API}/api/escalations`, { headers: authHeaders() });
    if (!res.ok) return { escalations: [], agents: [] };
    return (await res.json()) as {
      escalations: EscalationRecord[]; agents: HumanAgent[];
      scope?: EscalationScope; me?: EscalationViewer;
    };
  } catch {
    return { escalations: [], agents: [] };
  }
}

// Manager/admin reassigns (or self-claims) a case, declaring a disposition.
export async function reassignEscalation(
  id: string,
  assigneeId: string,
  disposition: "handling" | "delegated",
  note = ""
): Promise<{ error?: string }> {
  try {
    const res = await fetch(`${API}/api/escalations/${encodeURIComponent(id)}/reassign`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ assignee_id: assigneeId, disposition, note }),
    });
    if (!res.ok) return { error: ((await res.json().catch(() => ({}))) as any)?.error || "Reassign failed" };
    return {};
  } catch {
    return { error: "Network error" };
  }
}

/** The assigned human agent replies to the customer on an open case. */
export async function postAgentReply(
  escalationId: string,
  text: string
): Promise<{ messages?: Message[]; error?: string }> {
  try {
    const res = await fetch(`${API}/api/escalations/${encodeURIComponent(escalationId)}/reply`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data?.error || "Could not send reply" };
    return { messages: (data?.messages ?? []) as Message[] };
  } catch {
    return { error: "Network error" };
  }
}

export async function resolveEscalation(id: string): Promise<void> {
  try {
    await fetch(`${API}/api/escalations/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      headers: authHeaders(),
    });
  } catch {
    // best-effort; the list refresh will reflect server truth
  }
}

// Hand a case up to the department manager, with an optional short note.
export async function handoffEscalation(id: string, note: string): Promise<{ error?: string }> {
  try {
    const res = await fetch(`${API}/api/escalations/${encodeURIComponent(id)}/handoff`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (!res.ok) return { error: ((await res.json().catch(() => ({}))) as any)?.error || "Handoff failed" };
    return {};
  } catch {
    return { error: "Network error" };
  }
}

// ---- Notifications ---------------------------------------------------------

export async function getNotifications(): Promise<{
  notifications: NotificationRecord[];
  unread: number;
}> {
  try {
    const res = await fetch(`${API}/api/notifications`, { headers: authHeaders() });
    if (!res.ok) return { notifications: [], unread: 0 };
    return (await res.json()) as { notifications: NotificationRecord[]; unread: number };
  } catch {
    return { notifications: [], unread: 0 };
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await fetch(`${API}/api/notifications/${encodeURIComponent(id)}/read`, {
      method: "POST",
      headers: authHeaders(),
    });
  } catch {
    // best-effort
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  try {
    await fetch(`${API}/api/notifications/read-all`, { method: "POST", headers: authHeaders() });
  } catch {
    // best-effort
  }
}

// ---- Tickets dashboard -----------------------------------------------------

export async function listDashboardTickets(): Promise<TicketDashboardRow[]> {
  try {
    const res = await fetch(`${API}/api/dashboard/tickets`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as { tickets: TicketDashboardRow[] };
    return data.tickets ?? [];
  } catch {
    return [];
  }
}

export async function getDashboardTicket(ticketId: string): Promise<TicketDashboardDetail | null> {
  try {
    const res = await fetch(`${API}/api/dashboard/tickets/${encodeURIComponent(ticketId)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as TicketDashboardDetail;
  } catch {
    return null;
  }
}

// ---- Observability: agent run sessions -------------------------------------

export async function listRunSessions(): Promise<RunSessionRow[]> {
  try {
    const res = await fetch(`${API}/api/observability/runs`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as { runs: RunSessionRow[] };
    return data.runs ?? [];
  } catch {
    return [];
  }
}

export async function getRunSession(runId: string): Promise<RunSessionDetail | null> {
  try {
    const res = await fetch(`${API}/api/observability/runs/${encodeURIComponent(runId)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as RunSessionDetail;
  } catch {
    return null;
  }
}

// ---- Platform: live config store (admin) -----------------------------------

async function pf(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API}/api/platform${path}`, {
    method,
    headers: authHeaders(body === undefined ? {} : { "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data;
}

export const platform = {
  listKb: () => pf("GET", "/kb") as Promise<{ docs: KbDoc[] }>,
  putKb: (file: string, content: string) => pf("PUT", `/kb/${encodeURIComponent(file)}`, { content }),
  deleteKb: (file: string) => pf("DELETE", `/kb/${encodeURIComponent(file)}`),
  suggestKb: (body: { ticket_id?: string; source?: Record<string, unknown> }) =>
    pf("POST", "/kb/suggest", body) as Promise<{ draft: KbDraft }>,

  listUseCases: () =>
    pf("GET", "/usecases") as Promise<{ agents: string[]; usecases: StoredUseCase[] }>,
  putUseCase: (agent: string, def: unknown) => pf("PUT", `/usecases/${encodeURIComponent(agent)}`, def),
  deleteUseCase: (agent: string, id: string) =>
    pf("DELETE", `/usecases/${encodeURIComponent(agent)}/${encodeURIComponent(id)}`),

  listTools: () =>
    pf("GET", "/tools") as Promise<{ builtins: ToolInfo[]; declarative: HttpToolSpec[] }>,
  putTool: (name: string, spec: unknown) => pf("PUT", `/tools/${encodeURIComponent(name)}`, spec),
  deleteTool: (name: string) => pf("DELETE", `/tools/${encodeURIComponent(name)}`),

  listAudit: () => pf("GET", "/audit") as Promise<{ audit: ConfigAuditRecord[] }>,

  getPolicies: () => pf("GET", "/policies") as Promise<{ policies: PolicyConfig }>,
  putPolicies: (policies: PolicyConfig) =>
    pf("PUT", "/policies", policies) as Promise<{ policies: PolicyConfig }>,

  getSla: () => pf("GET", "/sla") as Promise<SlaConfig>,
  putSla: (cfg: SlaConfig) => pf("PUT", "/sla", cfg) as Promise<SlaConfig>,

  listHelp: () => pf("GET", "/helpcenter") as Promise<{ articles: HelpArticle[] }>,
  putHelp: (file: string, content: string) =>
    pf("PUT", `/helpcenter/${encodeURIComponent(file)}`, { content }) as Promise<{ article: HelpArticle }>,
  deleteHelp: (file: string) => pf("DELETE", `/helpcenter/${encodeURIComponent(file)}`),

  listSpecialists: () =>
    pf("GET", "/specialists") as Promise<{ agents: SpecialistAgentRecord[] }>,
  putSpecialist: (name: string, body: Omit<SpecialistAgentRecord, "builtin">) =>
    pf("PUT", `/specialists/${encodeURIComponent(name)}`, body),
  deleteSpecialist: (name: string) => pf("DELETE", `/specialists/${encodeURIComponent(name)}`),

  listFaqs: () => pf("GET", "/faq") as Promise<{ faqs: FaqEntry[] }>,
  createFaq: (body: Omit<FaqEntry, "id">) =>
    pf("POST", "/faq", body) as Promise<{ faq: FaqEntry }>,
  putFaq: (id: string, body: Omit<FaqEntry, "id">) =>
    pf("PUT", `/faq/${encodeURIComponent(id)}`, body) as Promise<{ faq: FaqEntry }>,
  deleteFaq: (id: string) => pf("DELETE", `/faq/${encodeURIComponent(id)}`),
};

// ---- Help Center: customer self-service (signed-in users) ------------------

export async function askHelp(message: string): Promise<HelpAnswer> {
  const res = await fetch(`${API}/api/help/ask`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Help is unavailable");
  return data as HelpAnswer;
}

export async function listHelpFaqs(): Promise<{ faqs: PublicFaq[] }> {
  const res = await fetch(`${API}/api/help/faqs`, {
    method: "GET",
    headers: authHeaders({ "Content-Type": "application/json" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "FAQs are unavailable");
  return data as { faqs: PublicFaq[] };
}

// ---- Admin: human-agent management -----------------------------------------

async function adm(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API}/api/admin${path}`, {
    method,
    headers: authHeaders(body === undefined ? {} : { "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data;
}

export const adminAgents = {
  list: () => adm("GET", "/agents") as Promise<{ agents: HumanAgentAdmin[]; departments: string[] }>,
  create: (body: {
    name: string;
    title: string;
    department: string;
    email: string;
    password?: string;
    level?: "agent" | "manager";
  }) => adm("POST", "/agents", body),
};

// ---- Real-time agent collaboration -----------------------------------------

export async function getCollabOverview(): Promise<CollabOverview | null> {
  try {
    const res = await fetch(`${API}/api/collab/overview`, { headers: authHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as CollabOverview;
  } catch {
    return null;
  }
}

export async function sendHeartbeat(): Promise<void> {
  try {
    await fetch(`${API}/api/collab/heartbeat`, { method: "POST", headers: authHeaders() });
  } catch {
    // best-effort
  }
}

/** SSE URL for the live collaboration feed (token in query — EventSource has no headers). */
export function collabStreamUrl(): string {
  const token = getToken() ?? "";
  return `${API}/api/collab/stream?token=${encodeURIComponent(token)}`;
}

export async function getCaseNotes(escalationId: string): Promise<CaseNote[]> {
  try {
    const res = await fetch(`${API}/api/escalations/${encodeURIComponent(escalationId)}/notes`, {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { notes: CaseNote[] };
    return data.notes ?? [];
  } catch {
    return [];
  }
}

export async function postCaseNote(
  escalationId: string,
  body: string
): Promise<{ note?: CaseNote; error?: string }> {
  try {
    const res = await fetch(`${API}/api/escalations/${encodeURIComponent(escalationId)}/note`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data?.error || "Could not save note" };
    return { note: data.note as CaseNote };
  } catch {
    return { error: "Network error" };
  }
}

// ---- Feedback (thumbs up/down on AI replies) -------------------------------

export type FeedbackRating = "up" | "down";

/** Customer rates an AI reply. Idempotent per message (re-rating replaces). */
export async function submitFeedback(
  ticketId: string,
  messageId: number,
  rating: FeedbackRating,
  comment?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API}/api/feedback`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ticket_id: ticketId, message_id: messageId, rating, comment }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || "Could not save feedback" };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

/** Current ratings for one ticket's messages, so the chat can show the state. */
export async function getTicketFeedback(
  ticketId: string
): Promise<Record<number, FeedbackRating>> {
  try {
    const res = await fetch(`${API}/api/feedback/${encodeURIComponent(ticketId)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { feedback: { message_id: number; rating: FeedbackRating }[] };
    const map: Record<number, FeedbackRating> = {};
    for (const f of data.feedback ?? []) map[f.message_id] = f.rating;
    return map;
  } catch {
    return {};
  }
}

/** Admin: every piece of feedback, newest first. */
export async function listFeedback(): Promise<FeedbackRow[]> {
  try {
    const res = await fetch(`${API}/api/admin/feedback`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as { feedback: FeedbackRow[] };
    return data.feedback ?? [];
  } catch {
    return [];
  }
}
