/**
 * help/store.ts — admin CRUD over the customer-facing Help Center articles.
 *
 * DELIBERATELY SEPARATE from the internal KB library: only these articles are
 * ever exposed to the self-service Help widget, so internal docs (escalation
 * matrix, routing thresholds, etc.) can never leak to customers. Markdown files
 * live in `articles/`; the retriever reads them on demand, so an edit here is
 * live on the next question.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTICLES_DIR = join(HERE, "articles");

export interface HelpArticle {
  file: string;
  title: string;
  content: string;
  bytes: number;
}

/** Reject anything that isn't a plain `name.md` (no slashes, no traversal). */
function safeName(file: string): string {
  const name = file.trim();
  if (!/^[a-zA-Z0-9._-]+\.md$/.test(name) || name.includes("..")) {
    throw new Error("Invalid article filename (use letters/numbers/._- and a .md extension)");
  }
  return name;
}

/** Title = first markdown H1, else the filename without extension. */
function titleOf(file: string, content: string): string {
  const m = content.match(/^#\s+(.+)$/m);
  if (m) return m[1].trim();
  return file.replace(/\.md$/i, "").replace(/[-_]+/g, " ");
}

export function listHelpArticles(): HelpArticle[] {
  if (!existsSync(ARTICLES_DIR)) return [];
  return readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const content = readFileSync(join(ARTICLES_DIR, file), "utf8");
      return { file, title: titleOf(file, content), content, bytes: Buffer.byteLength(content) };
    });
}

export function readHelpArticle(file: string): HelpArticle | null {
  const name = safeName(file);
  const path = join(ARTICLES_DIR, name);
  if (!existsSync(path)) return null;
  const content = readFileSync(path, "utf8");
  return { file: name, title: titleOf(name, content), content, bytes: Buffer.byteLength(content) };
}

export function writeHelpArticle(file: string, content: string): HelpArticle {
  const name = safeName(file);
  if (!existsSync(ARTICLES_DIR)) mkdirSync(ARTICLES_DIR, { recursive: true });
  writeFileSync(join(ARTICLES_DIR, name), content, "utf8");
  return { file: name, title: titleOf(name, content), content, bytes: Buffer.byteLength(content) };
}

export function deleteHelpArticle(file: string): void {
  const name = safeName(file);
  const path = join(ARTICLES_DIR, name);
  if (existsSync(path)) unlinkSync(path);
}
