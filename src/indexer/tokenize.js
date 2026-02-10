/**
 * Simple tokenizer for MVP indexing.
 *
 * - lowercases
 * - extracts letter/number sequences
 */
export function tokenize(text) {
  if (!text) return [];
  const matches = text.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  return matches ?? [];
}

export function termFrequencies(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}
