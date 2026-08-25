/**
 * help/retrieve.ts — semantic retrieval over the Help Center articles.
 *
 * Articles are split into sections by their markdown headings. Each section is
 * embedded once (cached by its text, so an edit re-embeds only the changed
 * section) and ranked against the query by cosine similarity. If embeddings
 * aren't available, we fall back to a small TF-style keyword overlap score so
 * the feature still works offline.
 */
import { embed, cosineSim, embeddingsConfigured } from "../gateway/embeddings.js";
import { listHelpArticles, type HelpArticle } from "./store.js";

export interface HelpSection {
  file: string;
  title: string; // article title
  heading: string; // section heading
  text: string; // full text used for matching + grounding
}

export interface HelpHit extends HelpSection {
  score: number;
}

function splitSections(article: HelpArticle): HelpSection[] {
  const lines = article.content.split(/\r?\n/);
  const sections: HelpSection[] = [];
  let heading = article.title;
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join("\n").trim();
    if (body) {
      sections.push({
        file: article.file,
        title: article.title,
        heading,
        // Prefix with the article + section so the embedding has context.
        text: `${article.title} — ${heading}\n${body}`,
      });
    }
    buf = [];
  };
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    const h1 = line.match(/^#\s+(.+)$/);
    if (h2) {
      flush();
      heading = h2[1].trim();
    } else if (h1) {
      // The H1 is the title; don't treat it as body.
      heading = article.title;
    } else {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

// Cache: section text -> embedding vector. Keyed by text so edits invalidate.
const vectorCache = new Map<string, number[]>();

function keywordScore(query: string, text: string): number {
  const q = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3)
  );
  if (q.size === 0) return 0;
  const t = text.toLowerCase();
  let hits = 0;
  for (const term of q) if (t.includes(term)) hits++;
  return hits / q.size;
}

export interface RetrieveResult {
  hits: HelpHit[];
  method: "vector" | "keyword";
}

/**
 * Rank Help Center sections against the query. Returns top hits (highest score
 * first). `score` is a cosine similarity (vector) or overlap ratio (keyword).
 */
export async function retrieveHelp(query: string, topK = 4, traceId = "help"): Promise<RetrieveResult> {
  const sections = listHelpArticles().flatMap(splitSections);
  if (sections.length === 0) return { hits: [], method: "keyword" };

  if (embeddingsConfigured()) {
    // Embed any sections we haven't seen, plus the query, in as few calls as possible.
    const missing = sections.filter((s) => !vectorCache.has(s.text));
    if (missing.length > 0) {
      const vecs = await embed(missing.map((s) => s.text), traceId);
      if (vecs) missing.forEach((s, i) => vectorCache.set(s.text, vecs[i]));
    }
    const qVec = (await embed([query], traceId))?.[0];
    if (qVec && sections.every((s) => vectorCache.has(s.text))) {
      const hits = sections
        .map((s) => ({ ...s, score: cosineSim(qVec, vectorCache.get(s.text)!) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
      return { hits, method: "vector" };
    }
    // fall through to keyword if embedding failed mid-way
  }

  const hits = sections
    .map((s) => ({ ...s, score: keywordScore(query, s.text) }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return { hits, method: "keyword" };
}
