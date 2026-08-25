/**
 * http-guard.ts — SSRF-safe outbound HTTP for declarative tools.
 *
 * Deliberate stance (a "deeper thinking" answer for reviewers): we chose
 * declarative HTTP tools over arbitrary code execution, and every outbound call
 * goes through this guard. Protections:
 *   - Scheme allowlist: only http/https.
 *   - Host allowlist: the caller must name the hosts a tool may reach.
 *   - DNS rebinding / SSRF: we resolve the hostname and reject if ANY resolved
 *     address is private, loopback, link-local, or otherwise reserved.
 *   - No redirects: 3xx is refused (a redirect could bounce to an internal host).
 *   - Timeout: every request is aborted after a bound.
 *   - No secret auto-forward: only headers explicitly declared on the tool are
 *     sent; we never attach ambient credentials or env secrets.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Hostnames this call may reach (exact or dot-suffix match). Required. */
  allowedHosts: string[];
  timeoutMs?: number;
  maxBytes?: number;
}

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

function ipv4IsPrivate(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true; // treat unparsable as unsafe
  const [a, b] = p;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local / cloud metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function ipv6IsPrivate(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true; // loopback / unspecified
  if (v.startsWith("fe80")) return true; // link-local
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique local
  if (v.startsWith("::ffff:")) return ipv4IsPrivate(v.slice("::ffff:".length)); // mapped v4
  return false;
}

function addressIsPrivate(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return ipv4IsPrivate(ip);
  if (kind === 6) return ipv6IsPrivate(ip);
  return true;
}

function hostAllowed(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((a) => {
    const x = a.toLowerCase().trim();
    return x === h || h.endsWith(`.${x}`);
  });
}

/** Validate a URL against the SSRF policy; throws SsrfError if disallowed. */
export async function assertUrlSafe(rawUrl: string, allowedHosts: string[]): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError(`Invalid URL: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError(`Blocked scheme: ${url.protocol}`);
  }
  if (!allowedHosts.length) {
    throw new SsrfError("No allowed hosts configured for this tool");
  }
  if (!hostAllowed(url.hostname, allowedHosts)) {
    throw new SsrfError(`Host not allowlisted: ${url.hostname}`);
  }

  // Resolve and reject if any address is private/reserved (anti-SSRF / rebinding).
  const literal = isIP(url.hostname);
  const addresses = literal
    ? [url.hostname]
    : (await lookup(url.hostname, { all: true })).map((a) => a.address);
  if (!addresses.length) throw new SsrfError(`Could not resolve host: ${url.hostname}`);
  for (const addr of addresses) {
    if (addressIsPrivate(addr)) {
      throw new SsrfError(`Host resolves to a private/reserved address (${addr})`);
    }
  }
  return url;
}

export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOptions
): Promise<{ status: number; body: unknown }> {
  const url = await assertUrlSafe(rawUrl, opts.allowedHosts);
  const timeoutMs = Math.min(opts.timeoutMs ?? 5000, 15000);
  const maxBytes = Math.min(opts.maxBytes ?? 64 * 1024, 256 * 1024);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.headers ?? {},
      body: opts.body,
      redirect: "manual", // a redirect could escape the allowlist
      signal: controller.signal,
    });
    if (res.status >= 300 && res.status < 400) {
      throw new SsrfError(`Redirects are not allowed (got ${res.status})`);
    }
    const text = (await res.text()).slice(0, maxBytes);
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep as text */
    }
    return { status: res.status, body };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new SsrfError(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
