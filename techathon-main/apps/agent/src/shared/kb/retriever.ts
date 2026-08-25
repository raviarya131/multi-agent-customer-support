/**
 * shared/kb/retriever.ts
 *
 * The CENTRAL knowledge base, shared by all agents. One tiered retrieval
 * interface; a use case declares which files it may read (scope), and
 * retrieveFromScope only ever looks inside that scope.
 *
 * Tier 2 (keyword) ships here: each document is split into sections by its
 * markdown headings, sections are scored against the query with TF-IDF, and the
 * top-scoring sections per document are returned. If the query matches nothing
 * in a document (or has no usable terms), we fall back to Tier 1 (whole doc) so
 * a retrieval never comes back empty. Tier 3 (vector/embeddings) can slot in
 * behind this same signature.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { RetrievalResult } from "../core/types.js";
import { config } from "../config/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIBRARY_DIR = join(HERE, "library");

const WHOLE_DOC_CHAR_LIMIT = 8000;

// Tiny English stopword list — enough to stop common words from dominating the
// keyword score. Not exhaustive by design; this is Tier 2, not a search engine.
const STOPWORDS = new Set([
  "a", "an", "and", "the", "is", "are", "was", "were", "be", "been", "being",
  "to", "of", "in", "on", "for", "with", "as", "at", "by", "from", "this",
  "that", "these", "those", "it", "its", "i", "you", "my", "me", "we", "our",
  "do", "does", "did", "can", "could", "should", "would", "will", "if", "or",
  "but", "not", "no", "so", "how", "what", "why", "when", "which", "get",
  "got", "have", "has", "had", "about", "there", "their", "they", "them",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

interface Section {
  file: string;
  heading: string;
  text: string; // heading + body, as shown to the model
  termCounts: Map<string, number>;
}

/** Split one markdown document into sections keyed by their headings. */
function splitSections(file: string, content: string): Section[] {
  const lines = content.split(/\r?\n/);
  const sections: Section[] = [];
  let heading = "(intro)";
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (heading === "(intro)" && body === "") return;
    const text = heading === "(intro)" ? body : `## ${heading}\n${body}`;
    sections.push({
      file,
      heading,
      text,
      termCounts: countTerms(`${heading} ${body}`),
    });
  };

  for (const line of lines) {
    const m = /^#{1,6}\s+(.*)$/.exec(line);
    if (m) {
      flush();
      heading = m[1].trim();
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

function countTerms(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const term of tokenize(text)) {
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return counts;
}

export async function retrieveFromScope(
  query: string,
  kbFiles: string[]
): Promise<RetrievalResult[]> {
  const queryTerms = [...new Set(tokenize(query))];

  // Load + section every in-scope file. Track which are missing.
  const sectionsByFile = new Map<string, Section[]>();
  const missing: string[] = [];
  for (const file of kbFiles) {
    const path = join(LIBRARY_DIR, file);
    if (!existsSync(path)) {
      missing.push(file);
      continue;
    }
    sectionsByFile.set(file, splitSections(file, readFileSync(path, "utf8")));
  }

  // IDF across all in-scope sections: rarer terms weigh more.
  const allSections = [...sectionsByFile.values()].flat();
  const docFreq = new Map<string, number>();
  for (const term of queryTerms) {
    const n = allSections.filter((s) => s.termCounts.has(term)).length;
    docFreq.set(term, n);
  }
  const totalSections = Math.max(allSections.length, 1);
  const idf = (term: string): number =>
    Math.log((totalSections + 1) / ((docFreq.get(term) ?? 0) + 1)) + 1;

  const scoreSection = (s: Section): number => {
    let score = 0;
    for (const term of queryTerms) {
      const tf = s.termCounts.get(term) ?? 0;
      if (tf > 0) score += tf * idf(term);
    }
    return score;
  };

  const results: RetrievalResult[] = [];

  for (const file of missing) {
    results.push({ source: `kb:${file}`, text: `[KB file not found: ${file}]` });
  }

  for (const [file, sections] of sectionsByFile) {
    const scored = sections
      .map((s) => ({ s, score: scoreSection(s) }))
      .sort((a, b) => b.score - a.score);

    const matching = scored.filter((r) => r.score > 0);

    if (matching.length === 0) {
      // Tier-1 fallback: no query term matched — return the whole (capped) doc.
      const whole = sections.map((s) => s.text).join("\n\n");
      results.push({
        source: `kb:${file}`,
        text:
          whole.length <= WHOLE_DOC_CHAR_LIMIT
            ? whole
            : whole.slice(0, WHOLE_DOC_CHAR_LIMIT),
        score: 0,
      });
      continue;
    }

    // When the query matches MOST sections of a document (broad/overview query),
    // return all matching sections so the model sees the full policy picture.
    // For narrow queries where only a few sections match, apply the normal cap.
    // "Most" = the matching fraction exceeds 50% of the document's total sections.
    const capDefault = Math.max(config.kbTopSectionsPerFile, 1);
    const broadQuery = matching.length >= Math.ceil(sections.length * 0.5);
    const ranked = broadQuery ? matching : matching.slice(0, capDefault);

    results.push({
      source: `kb:${file}`,
      text: ranked.map((r) => r.s.text).join("\n\n"),
      score: ranked[0].score,
    });
  }

  // Best-matching documents first.
  results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return results;
}
