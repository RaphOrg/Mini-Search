// Shared deterministic tokenizer + normalizer for both indexing and querying.
// MVP goals:
// - deterministic output
// - no heavy NLP dependencies
// - consistent normalization across index and query paths

/**
 * A small default stopword set (optional) for MVP.
 * Keep this intentionally conservative; callers can pass their own list.
 */
export const DEFAULT_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'was',
  'were',
  'will',
  'with',
]);

/**
 * @typedef {Object} TokenizeOptions
 * @property {boolean} [lowercase=true] Lowercase tokens.
 * @property {boolean} [asciiFold=false] Fold diacritics ("café" -> "cafe").
 * @property {boolean} [removeStopwords=false] Remove stopwords.
 * @property {Set<string>|string[]} [stopwords=DEFAULT_STOPWORDS] Stopword list used when removeStopwords is true.
 * @property {number} [minTokenLength=1] Minimum token length to include.
 * @property {boolean} [preserveApostrophes=false] If true, keeps internal apostrophes ("don't" stays "don't").
 */

function coerceStopwords(stopwords) {
  if (!stopwords) return DEFAULT_STOPWORDS;
  if (stopwords instanceof Set) return stopwords;
  if (Array.isArray(stopwords)) return new Set(stopwords);
  throw new TypeError('stopwords must be a Set<string> or string[]');
}

function maybeAsciiFold(input) {
  // NFKD splits base letters from combining marks; removing combining marks folds accents.
  // This is deterministic and built-in; no external NLP lib.
  return input.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalize input text into a form suitable for deterministic tokenization.
 *
 * Notes on punctuation handling:
 * - We treat punctuation (and most symbols) as token separators.
 * - Hyphens and slashes become separators ("state-of-the-art" -> ["state","of","the","art"]).
 * - By default apostrophes are separators too ("don't" -> ["don","t"]).
 *   If preserveApostrophes=true, internal apostrophes are preserved.
 *
 * @param {string} text
 * @param {TokenizeOptions} [options]
 * @returns {string} normalized text
 */
export function normalizeText(text, options = {}) {
  const {
    lowercase = true,
    asciiFold = false,
    preserveApostrophes = false,
  } = options;

  if (text == null) return '';
  if (typeof text !== 'string') text = String(text);

  let s = text;

  // Normalize unicode presentation forms.
  // NFC keeps composed characters; folding is optionally done later.
  s = s.normalize('NFC');

  if (asciiFold) s = maybeAsciiFold(s);
  if (lowercase) s = s.toLowerCase();

  // Replace common “smart quotes” apostrophes with ASCII apostrophe.
  s = s.replace(/[\u2019\u2018\u02BC]/g, "'");

  // Convert all non-letter/number (and optionally apostrophe) to spaces.
  // Unicode property escapes require modern Node; this repo uses recent Node.
  // Keep letters and numbers from any language.
  const allowed = preserveApostrophes ? "[^\\p{L}\\p{N}']+" : "[^\\p{L}\\p{N}]+";
  s = s.replace(new RegExp(allowed, 'gu'), ' ');

  if (preserveApostrophes) {
    // Only keep apostrophes that are internal to a token (letters/numbers on both sides).
    // e.g. "rock 'n' roll" -> "rock n roll" (quotes removed)
    s = s.replace(/(^|\s)'|'(\s|$)/g, ' ');
    s = s.replace(/(\s)'+/g, '$1');
  }

  // Collapse whitespace.
  s = s.trim().replace(/\s+/g, ' ');

  return s;
}

/**
 * Tokenize text into an array of normalized tokens.
 *
 * @param {string} text
 * @param {TokenizeOptions} [options]
 * @returns {string[]}
 */
export function tokenize(text, options = {}) {
  const {
    removeStopwords = false,
    stopwords = DEFAULT_STOPWORDS,
    minTokenLength = 1,
  } = options;

  const normalized = normalizeText(text, options);
  if (!normalized) return [];

  const tokens = normalized.split(' ');
  const sw = removeStopwords ? coerceStopwords(stopwords) : null;

  const out = [];
  for (const t of tokens) {
    if (!t) continue;
    if (t.length < minTokenLength) continue;
    if (sw && sw.has(t)) continue;
    out.push(t);
  }
  return out;
}
