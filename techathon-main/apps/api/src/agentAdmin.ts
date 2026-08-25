// Thin client for the agent service's live config-store (/admin/*). The browser
// never talks to the agent directly; the API proxies here with the shared
// secret so all config changes flow through one authenticated, audited path.
import { ENV } from "./env";

async function call(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${ENV.AGENT_URL}/admin${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": ENV.AGENT_ADMIN_TOKEN,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `agent admin ${method} ${path} failed (${res.status})`);
  return data;
}

export const agentAdmin = {
  // KB
  listKb: () => call("GET", "/kb"),
  putKb: (file: string, content: string) =>
    call("PUT", `/kb/${encodeURIComponent(file)}`, { content }),
  deleteKb: (file: string) => call("DELETE", `/kb/${encodeURIComponent(file)}`),
  generateKb: (source: unknown) => call("POST", "/kb/generate", source),
  // Use cases
  listUseCases: () => call("GET", "/usecases"),
  putUseCase: (agent: string, def: unknown) =>
    call("PUT", `/usecases/${encodeURIComponent(agent)}`, def),
  deleteUseCase: (agent: string, id: string) =>
    call("DELETE", `/usecases/${encodeURIComponent(agent)}/${encodeURIComponent(id)}`),
  // Tools
  listTools: () => call("GET", "/tools"),
  putTool: (name: string, spec: unknown) =>
    call("PUT", `/tools/${encodeURIComponent(name)}`, spec),
  deleteTool: (name: string) => call("DELETE", `/tools/${encodeURIComponent(name)}`),
  // Policies (hard checks, escalation rules, intent router)
  getPolicies: () => call("GET", "/policies"),
  putPolicies: (body: unknown) => call("PUT", "/policies", body),
  // Specialist agents
  listSpecialists: () => call("GET", "/agents"),
  putSpecialist: (name: string, body: unknown) =>
    call("PUT", `/agents/${encodeURIComponent(name)}`, body),
  deleteSpecialist: (name: string) => call("DELETE", `/agents/${encodeURIComponent(name)}`),
  // FAQ / canned responses
  listFaqs: () => call("GET", "/faq"),
  createFaq: (body: unknown) => call("POST", "/faq", body),
  putFaq: (id: string, body: unknown) => call("PUT", `/faq/${encodeURIComponent(id)}`, body),
  deleteFaq: (id: string) => call("DELETE", `/faq/${encodeURIComponent(id)}`),
  // Help Center (customer-facing self-service articles)
  listHelp: () => call("GET", "/helpcenter"),
  putHelp: (file: string, content: string) =>
    call("PUT", `/helpcenter/${encodeURIComponent(file)}`, { content }),
  deleteHelp: (file: string) => call("DELETE", `/helpcenter/${encodeURIComponent(file)}`),
};
