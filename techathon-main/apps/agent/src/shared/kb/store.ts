/**
 * kb/store.ts — admin CRUD over the KB library (markdown files).
 *
 * The retriever already reads KB files from disk on every retrieval, so a doc
 * added or edited here is live on the very next ticket — no restart, no reload
 * call needed. This module just guards the filename (no path traversal) and
 * writes/reads the same `library/` directory the retriever reads.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIBRARY_DIR = join(HERE, "library");

export interface KbDoc {
  file: string;
  content: string;
  bytes: number;
}

/** Reject anything that isn't a plain `name.md` (no slashes, no traversal). */
function safeName(file: string): string {
  const name = file.trim();
  if (!/^[a-zA-Z0-9._-]+\.md$/.test(name) || name.includes("..")) {
    throw new Error("Invalid KB filename (use letters/numbers/._- and a .md extension)");
  }
  return name;
}

export function listKbDocs(): KbDoc[] {
  if (!existsSync(LIBRARY_DIR)) return [];
  return readdirSync(LIBRARY_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const content = readFileSync(join(LIBRARY_DIR, file), "utf8");
      return { file, content, bytes: Buffer.byteLength(content) };
    });
}

export function readKbDoc(file: string): KbDoc | null {
  const name = safeName(file);
  const path = join(LIBRARY_DIR, name);
  if (!existsSync(path)) return null;
  const content = readFileSync(path, "utf8");
  return { file: name, content, bytes: Buffer.byteLength(content) };
}

export function writeKbDoc(file: string, content: string): KbDoc {
  const name = safeName(file);
  if (!existsSync(LIBRARY_DIR)) mkdirSync(LIBRARY_DIR, { recursive: true });
  writeFileSync(join(LIBRARY_DIR, name), content, "utf8");
  return { file: name, content, bytes: Buffer.byteLength(content) };
}

export function deleteKbDoc(file: string): void {
  const name = safeName(file);
  const path = join(LIBRARY_DIR, name);
  if (existsSync(path)) unlinkSync(path);
}
