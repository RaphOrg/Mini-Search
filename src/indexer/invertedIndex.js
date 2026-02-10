/**
 * In-memory inverted index:
 *   term -> [{ docId, tf }]
 */
export class InvertedIndex {
  constructor() {
    /** @type {Map<string, Array<{docId: number, tf: number}>>} */
    this.postings = new Map();
    this.docCount = 0;
  }

  /**
   * Add a single document's term frequencies.
   * @param {number} docId
   * @param {Map<string, number>} tfByTerm
   */
  addDocument(docId, tfByTerm) {
    for (const [term, tf] of tfByTerm.entries()) {
      const list = this.postings.get(term);
      if (list) list.push({ docId, tf });
      else this.postings.set(term, [{ docId, tf }]);
    }
    this.docCount += 1;
  }

  /**
   * Sort postings deterministically by docId, and terms lexicographically.
   * This helps ensure rebuilds are deterministic.
   */
  finalize() {
    for (const list of this.postings.values()) {
      list.sort((a, b) => a.docId - b.docId);
    }
  }

  toJSON() {
    // Make JSON deterministic: terms sorted.
    const terms = [...this.postings.keys()].sort();
    const obj = {
      docCount: this.docCount,
      postings: {},
    };
    for (const t of terms) obj.postings[t] = this.postings.get(t);
    return obj;
  }

  static fromJSON(json) {
    const idx = new InvertedIndex();
    idx.docCount = json.docCount ?? 0;
    const postingsObj = json.postings ?? {};
    for (const term of Object.keys(postingsObj)) {
      idx.postings.set(term, postingsObj[term]);
    }
    return idx;
  }
}
