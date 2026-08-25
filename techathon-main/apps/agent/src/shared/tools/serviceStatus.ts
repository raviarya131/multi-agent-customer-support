/**
 * shared/tools/serviceStatus.ts
 *
 * Example shared tool: report the operational status of a product component
 * (like a status page). Mocked here; a real system would query the incident
 * /status service.
 */
import type { Tool } from "../core/types.js";

interface ComponentStatus {
  status: "operational" | "degraded" | "down";
  since?: string;
}

const MOCK_STATUS: Record<string, ComponentStatus> = {
  export: { status: "degraded", since: "2026-06-23T15:00:00Z" },
  api: { status: "operational" },
  dashboard: { status: "operational" },
  billing: { status: "operational" },
};

export const serviceStatus: Tool = {
  name: "serviceStatus",
  description:
    "Report the operational status of a product component. args: { component }. Returns { component, status, since }.",
  async run(args: Record<string, unknown>): Promise<unknown> {
    const component = String(args.component ?? "").trim().toLowerCase();
    if (!component) {
      // No component named — return the whole status board.
      return { board: MOCK_STATUS };
    }
    const info = MOCK_STATUS[component] ?? { status: "operational" as const };
    return { component, ...info };
  },
};
