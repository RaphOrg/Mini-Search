import { InvertedIndex } from '../indexer/invertedIndex.js';
import { tokenize as sharedTokenize } from '../shared/tokenizer.js';

/**
 * Minimal in-process app state for Phase 1/2.
 *
 * This keeps module boundaries simple: server routes query the index,
 * and the entrypoint seeds the index at boot.
 */
let appIndex = null;

function termFrequencies(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

class AppIndex {
  constructor() {
    this.index = new InvertedIndex();
    /** @type {Map<number, {id: number, text: string}>} */
    this.docs = new Map();
  }

  /**
   * Query adapter used by src/query/index.js.
   *
   * Keep this stable and independent from the internal index representation.
   *
   * @param {string} term
   * @returns {Map<number, number>} Map of docId -> term frequency
   */
  getPostings(term) {
    const list = this.index.postings.get(term) ?? [];
    const out = new Map();

    for (const p of list) {
      const docId = Number(p?.docId);
      const tf = Number(p?.tf);

      // Guard against corrupted postings (e.g. from JSON restore).
      if (!Number.isInteger(docId) || docId < 0) continue;
      out.set(docId, Number.isFinite(tf) && tf > 0 ? tf : 0);
    }

    return out;
  }

  /** @param {number} id */
  getDoc(id) {
    return this.docs.get(Number(id)) ?? null;
  }

  /** @param {number} id */
  hasDoc(id) {
    return this.docs.has(Number(id));
  }
}

/**
 * Initialize the global app index from an array of documents.
 * @param {Array<{id: number, text: string}>} docs
 */
export function initAppIndex(docs = []) {
  const store = new AppIndex();

  for (const doc of docs) {
    const id = Number(doc.id);
    if (!Number.isInteger(id) || id < 0) {
      throw new TypeError(`Invalid doc.id: ${doc?.id}`);
    }

    const text = typeof doc.text === 'string' ? doc.text : '';
    store.docs.set(id, { id, text });

    // Use the same tokenizer for indexing and querying.
    const tokens = sharedTokenize(text);
    const tfByTerm = termFrequencies(tokens);
    store.index.addDocument(id, tfByTerm);
  }

  if (docs.length > 0) store.index.finalize();
  appIndex = store;
  return appIndex;
}

export function getAppIndex() {
  if (!appIndex) {
    // Provide a helpful error instead of crashing deeper in query/search.
    throw new Error('App index not initialized. Call initAppIndex() during startup.');
  }
  return appIndex;
}
