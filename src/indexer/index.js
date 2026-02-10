// Simple Phase 1 in-memory inverted index.
//
// This is intentionally small and dependency-free so we can iterate quickly.
// Once Postgres storage is introduced, this module can be swapped to persist
// postings and retrieve them during search.

/**
 * @typedef {{ id: string|number, text?: string, title?: string, body?: string }} DocumentLike
 */

function normalizeToken(token) {
  return token.toLowerCase();
}

function tokenize(text) {
  if (!text) return [];
  // Keep it simple for MVP: split on non-alphanumerics.
  return text
    .split(/[^a-zA-Z0-9]+/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .map(normalizeToken);
}

export class InMemoryInvertedIndex {
  constructor() {
    /** @type {Map<string, Set<string>>} */
    this.postings = new Map();

    /** @type {Map<string, { id: string, text: string }>} */
    this.docs = new Map();
  }

  /**
   * @param {DocumentLike[]} docs
   */
  indexDocuments(docs) {
    if (!Array.isArray(docs)) throw new TypeError('docs must be an array');

    for (const doc of docs) {
      if (doc == null) continue;
      const id = String(doc.id);
      const text = String(doc.text ?? doc.body ?? doc.title ?? '');

      this.docs.set(id, { id, text });

      const tokens = new Set(tokenize(text));
      for (const token of tokens) {
        let set = this.postings.get(token);
        if (!set) {
          set = new Set();
          this.postings.set(token, set);
        }
        set.add(id);
      }
    }
  }

  /**
   * @param {string} term
   * @returns {Set<string>}
   */
  getPostings(term) {
    const key = normalizeToken(term);
    return this.postings.get(key) ?? new Set();
  }

  /**
   * @param {string} id
   */
  getDoc(id) {
    return this.docs.get(String(id)) ?? null;
  }
}

// Back-compat with the placeholder function signature.
export function indexDocuments(_docs) {
  throw new Error(
    'indexDocuments is not used directly. Instantiate InMemoryInvertedIndex and call .indexDocuments(docs).'
  );
}
