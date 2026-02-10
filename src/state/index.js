import { InvertedIndex } from '../indexer/invertedIndex.js';
import { tokenize, termFrequencies } from '../indexer/tokenize.js';

/**
 * Minimal in-process app state for Phase 1/2.
 *
 * This keeps module boundaries simple: server routes query the index,
 * and the entrypoint seeds the index at boot.
 */
let appIndex = null;

class AppIndex {
  constructor() {
    this.index = new InvertedIndex();
    /** @type {Map<number, {id: number, text: string}>} */
    this.docs = new Map();
  }

  /** @param {number} id */
  getDoc(id) {
    return this.docs.get(id) ?? null;
  }

  /** @param {number} id */
  hasDoc(id) {
    return this.docs.has(id);
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
    const text = String(doc.text ?? '');
    store.docs.set(id, { id, text });

    const tokens = tokenize(text);
    const tfByTerm = termFrequencies(tokens);
    store.index.addDocument(id, tfByTerm);
  }

  store.index.finalize();
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
