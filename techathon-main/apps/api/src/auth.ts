// Lightweight email + password auth with opaque, DB-backed session tokens.
//
// Design choices (deliberate, demo-appropriate):
//  - Passwords hashed with Node's built-in scrypt (no native bcrypt build step).
//  - Sessions are opaque random tokens stored in SQLite, not JWTs — simpler to
//    revoke and no signing-secret management. A token maps to one account.
//  - Three roles: `user` (a customer), `admin` (admin + developer combined), and
//    `agent` (a human support agent who handles escalations).
//  - Demo accounts are seeded from the existing customer + human-agent rosters so
//    every persona can log in immediately. Shared demo password below.
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { USERS } from "./users";
import { HUMAN_AGENTS } from "./humans";

export type Role = "user" | "admin" | "agent";

export interface Account {
  id: string;
  email: string;
  role: Role;
  name: string;
  customer_id: string | null;
  agent_id: string | null;
}

interface AccountRow extends Account {
  password_hash: string;
}

export const DEMO_PASSWORD = "demo1234";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL,
    name          TEXT NOT NULL,
    customer_id   TEXT,
    agent_id      TEXT,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    account_id  TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    expires_at  INTEGER NOT NULL
  );
`);

// ---- Password hashing ------------------------------------------------------

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// ---- Account helpers -------------------------------------------------------

function publicAccount(row: AccountRow): Account {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    name: row.name,
    customer_id: row.customer_id ?? null,
    agent_id: row.agent_id ?? null,
  };
}

function findAccountRowByEmail(email: string): AccountRow | null {
  const row = db
    .prepare("SELECT * FROM accounts WHERE email = ?")
    .get(email.trim().toLowerCase()) as any;
  return row ?? null;
}

export function getAccountById(id: string): Account | null {
  const row = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as any;
  return row ? publicAccount(row) : null;
}

/** The user account linked to a customer id (used to address notifications). */
export function getAccountByCustomerId(customerId: string): Account | null {
  const row = db
    .prepare("SELECT * FROM accounts WHERE customer_id = ? AND role = 'user'")
    .get(customerId) as any;
  return row ? publicAccount(row) : null;
}

/** The login account linked to a human agent id. */
export function getAccountByAgentId(agentId: string): Account | null {
  const row = db
    .prepare("SELECT * FROM accounts WHERE agent_id = ? AND role = 'agent'")
    .get(agentId) as any;
  return row ? publicAccount(row) : null;
}

export function listAccounts(): Account[] {
  const rows = db.prepare("SELECT * FROM accounts ORDER BY role, name").all() as any[];
  return rows.map(publicAccount);
}

/** Validate an email and confirm it's not already registered. Throws if not. */
export function assertEmailAvailable(email: string): void {
  const e = (email || "").trim().toLowerCase();
  if (!isEmail(e)) throw new Error("Enter a valid email address");
  if (findAccountRowByEmail(e)) throw new Error("An account with that email already exists");
}

interface SeedSpec {
  email: string;
  name: string;
  role: Role;
  customer_id?: string | null;
  agent_id?: string | null;
}

function emailFromName(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@demo.test`;
}

function isEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

/** Low-level insert. Returns the created public account. Caller checks uniqueness. */
function insertAccount(spec: {
  email: string;
  password: string;
  role: Role;
  name: string;
  customer_id?: string | null;
  agent_id?: string | null;
}): Account {
  const id = `acc_${randomUUID().slice(0, 8)}`;
  const email = spec.email.trim().toLowerCase();
  db.prepare(
    `INSERT INTO accounts (id, email, password_hash, role, name, customer_id, agent_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    email,
    hashPassword(spec.password),
    spec.role,
    spec.name,
    spec.customer_id ?? null,
    spec.agent_id ?? null,
    new Date().toISOString()
  );
  return { id, email, role: spec.role, name: spec.name, customer_id: spec.customer_id ?? null, agent_id: spec.agent_id ?? null };
}

function upsertAccount(spec: SeedSpec): void {
  if (findAccountRowByEmail(spec.email)) return;
  insertAccount({ ...spec, password: DEMO_PASSWORD });
}

/** Idempotently create demo accounts for every persona. Safe to call on boot. */
export function seedAccounts(): void {
  upsertAccount({ email: "admin@demo.test", name: "Admin / Developer", role: "admin" });

  for (const u of USERS) {
    upsertAccount({
      email: emailFromName(u.name),
      name: u.name,
      role: "user",
      customer_id: u.id,
    });
  }

  for (const a of HUMAN_AGENTS) {
    upsertAccount({
      email: emailFromName(a.name),
      name: a.name,
      role: "agent",
      agent_id: a.id,
    });
  }
}

// ---- Sessions --------------------------------------------------------------

export function pruneSessions(now = Date.now()): void {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
}

function createSession(accountId: string): string {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  db.prepare(
    "INSERT INTO sessions (token, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).run(token, accountId, new Date(now).toISOString(), now + SESSION_TTL_MS);
  return token;
}

export function deleteSession(token: string): void {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function accountForToken(token: string | null | undefined): Account | null {
  if (!token) return null;
  pruneSessions();
  const row = db
    .prepare(
      `SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, Date.now()) as any;
  return row ? publicAccount(row) : null;
}

export interface LoginResult {
  ok: boolean;
  reason?: "invalid";
  token?: string;
  account?: Account;
}

export function login(email: string, password: string): LoginResult {
  const row = findAccountRowByEmail(email || "");
  if (!row || !verifyPassword(password || "", row.password_hash)) {
    return { ok: false, reason: "invalid" };
  }
  const token = createSession(row.id);
  return { ok: true, token, account: publicAccount(row) };
}

// ---- Self-service signup ---------------------------------------------------

export interface SignupResult {
  ok: boolean;
  reason?: "exists" | "invalid";
  message?: string;
  token?: string;
  account?: Account;
}

/** Create a new customer account (role `user`) with a generated customer id. */
export function signup(email: string, password: string, name: string): SignupResult {
  const e = (email || "").trim().toLowerCase();
  const n = (name || "").trim();
  if (!isEmail(e)) return { ok: false, reason: "invalid", message: "Enter a valid email address" };
  if ((password || "").length < 6)
    return { ok: false, reason: "invalid", message: "Password must be at least 6 characters" };
  if (!n) return { ok: false, reason: "invalid", message: "Name is required" };
  if (findAccountRowByEmail(e))
    return { ok: false, reason: "exists", message: "An account with that email already exists" };

  const account = insertAccount({
    email: e,
    password,
    role: "user",
    name: n,
    customer_id: `cust_${randomUUID().slice(0, 8)}`,
  });
  const token = createSession(account.id);
  return { ok: true, token, account };
}

/** Admin-created login for a human support agent, linked to a human_agents row. */
export function createAgentAccount(opts: {
  name: string;
  email: string;
  password?: string;
  agentId: string;
}): Account {
  const e = opts.email.trim().toLowerCase();
  if (!isEmail(e)) throw new Error("Enter a valid email address");
  if (findAccountRowByEmail(e)) throw new Error("An account with that email already exists");
  return insertAccount({
    email: e,
    password: opts.password?.trim() || DEMO_PASSWORD,
    role: "agent",
    name: opts.name.trim(),
    agent_id: opts.agentId,
  });
}
