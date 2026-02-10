/**
 * Query module for Phase 1.
 *
 * Supports basic multi-term keyword boolean search:
 * - AND is default (intersection)
 * - OR can be requested via mode='or'
 *
 * Parsing is intentionally simple for MVP: terms are whitespace separated.
 */

/**
 * @param {Set<string>} a
 * @param {Set<string>} b
 */
function intersect(a, b) {
  // Iterate the smaller set for speed.
  if (a.size > b.size) return intersect(b, a);
  const out = new Set();
  for (const v of a) if (b.has(v)) out.add(v);
  return out;
}

/**
 * @param {Set<string>} a
 * @param {Set<string>} b
 */
function union(a, b) {
  const out = new Set(a);
  for (const v of b) out.add(v);
  return out;
}

function tokenizeQuery(q) {
  if (!q) return [];
  return q
    .trim()
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * @param {{ q: string, mode?: 'and'|'or', limit?: number }} params
 * @param {{ getPostings: (term: string) => Set<string> }} index
 */
export function search(params, index) {
  const q = params?.q ?? '';
  const mode = params?.mode ?? 'and';
  const limit =
    params?.limit == null || params.limit === '' ? null : Math.max(0, Number(params.limit));

  const terms = tokenizeQuery(q);
  if (terms.length === 0) return { terms: [], mode, docIds: [] };

  let acc = null;
  for (const term of terms) {
    const postings = index.getPostings(term);

    if (acc == null) {
      // Clone to avoid mutating index-owned sets.
      acc = new Set(postings);
      continue;
    }

    acc = mode === 'or' ? union(acc, postings) : intersect(acc, postings);

    // Early exit for AND: once empty, stays empty.
    if (mode !== 'or' && acc.size === 0) break;
  }

  const docIds = Array.from(acc ?? []);
  // Stable by docId (acceptance allows unsorted; stable ordering is nicer).
  docIds.sort();

  const limited = limit == null ? docIds : docIds.slice(0, limit);

  return { terms, mode, docIds: limited };
}
