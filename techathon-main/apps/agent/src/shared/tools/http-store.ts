/**
 * http-store.ts — the live registry of admin-defined declarative HTTP tools.
 *
 * Admins describe a tool as data (name, method, URL template, allowed hosts,
 * static headers) — never code. We persist the specs to a JSON file, build an
 * SSRF-guarded Tool for each, and (re)register them in the central tool pool.
 * Use cases then reference the tool by name like any built-in.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { Tool } from "../core/types.js";
import { unregisterTool, upsertTool } from "./registry.js";
import { safeFetch } from "./http-guard.js";
import { log } from "../core/logger.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// apps/agent/runtime-config/tools.json  (outside src so it's clearly data)
const CONFIG_DIR = resolve(HERE, "../../../runtime-config");
const TOOLS_FILE = join(CONFIG_DIR, "tools.json");

export const httpToolSpecSchema = z.object({
  name: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "name must be alphanumeric/underscore, starting with a letter"),
  description: z.string().min(1),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET"),
  url_template: z.string().url().or(z.string().regex(/^https?:\/\//)),
  allowed_hosts: z.array(z.string()).optional(),
  headers: z.record(z.string()).optional(),
  timeout_ms: z.number().int().positive().max(15000).optional(),
});

export type HttpToolSpec = z.infer<typeof httpToolSpecSchema>;

// Names of tools currently owned by this store (so reload can drop removed ones).
const owned = new Set<string>();

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

function hostOf(template: string): string {
  try {
    return new URL(template.replace(/\{\w+\}/g, "x")).hostname;
  } catch {
    return "";
  }
}

function fillTemplate(tpl: string, args: Record<string, unknown>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, k) => encodeURIComponent(String(args[k] ?? "")));
}

/** Build an SSRF-guarded Tool from a declarative spec. */
export function makeHttpTool(spec: HttpToolSpec): Tool {
  const allowedHosts = spec.allowed_hosts?.length ? spec.allowed_hosts : [hostOf(spec.url_template)];
  return {
    name: spec.name,
    description: spec.description,
    async run(args: Record<string, unknown>) {
      const url = fillTemplate(spec.url_template, args);
      const method = spec.method ?? "GET";
      const hasBody = method !== "GET" && method !== "DELETE";
      const body = hasBody ? JSON.stringify(args.body ?? args) : undefined;
      const headers = {
        ...(spec.headers ?? {}),
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      };
      const { status, body: data } = await safeFetch(url, {
        method,
        headers,
        body,
        allowedHosts,
        timeoutMs: spec.timeout_ms,
      });
      return { status, data };
    },
  };
}

export function listSpecs(): HttpToolSpec[] {
  if (!existsSync(TOOLS_FILE)) return [];
  try {
    const raw = JSON.parse(readFileSync(TOOLS_FILE, "utf8"));
    if (!Array.isArray(raw)) return [];
    const out: HttpToolSpec[] = [];
    for (const item of raw) {
      const parsed = httpToolSpecSchema.safeParse(item);
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  } catch {
    return [];
  }
}

function saveSpecs(specs: HttpToolSpec[]): void {
  ensureDir();
  writeFileSync(TOOLS_FILE, JSON.stringify(specs, null, 2), "utf8");
}

/** (Re)register every stored HTTP tool, dropping any that were removed. */
export function reloadHttpTools(): HttpToolSpec[] {
  const specs = listSpecs();
  const nextNames = new Set(specs.map((s) => s.name));
  for (const name of owned) {
    if (!nextNames.has(name)) unregisterTool(name);
  }
  owned.clear();
  for (const spec of specs) {
    upsertTool(makeHttpTool(spec));
    owned.add(spec.name);
  }
  log("config", "http-store", "http tools reloaded", { tools: [...nextNames] });
  return specs;
}

/** Validate + persist a tool spec, then hot-reload. Returns the saved spec. */
export function upsertSpec(input: unknown): HttpToolSpec {
  const spec = httpToolSpecSchema.parse(input);
  const specs = listSpecs().filter((s) => s.name !== spec.name);
  specs.push(spec);
  saveSpecs(specs);
  reloadHttpTools();
  return spec;
}

export function deleteSpec(name: string): void {
  const specs = listSpecs().filter((s) => s.name !== name);
  saveSpecs(specs);
  reloadHttpTools();
}
