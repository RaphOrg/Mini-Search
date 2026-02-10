import { tokenize, normalizeText } from '../src/shared/tokenizer.js';

function assertDeepEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label} failed\nexpected: ${e}\nactual:   ${a}`);
  }
}

const cases = [
  {
    label: 'basic punctuation + lowercase',
    input: 'Hello, world!!',
    options: {},
    expected: ['hello', 'world'],
  },
  {
    label: 'hyphenated words split',
    input: 'State-of-the-art systems',
    options: {},
    expected: ['state', 'of', 'the', 'art', 'systems'],
  },
  {
    label: 'unicode + diacritics preserved by default',
    input: 'Café naïve résumé',
    options: {},
    expected: ['café', 'naïve', 'résumé'],
  },
  {
    label: 'ascii fold enabled',
    input: 'Café naïve résumé',
    options: { asciiFold: true },
    expected: ['cafe', 'naive', 'resume'],
  },
  {
    label: 'smart apostrophe normalized and split by default',
    input: "Dont stop",
    options: {},
    expected: ['don', 't', 'stop'],
  },
  {
    label: 'preserve internal apostrophes',
    input: "Don't stop",
    options: { preserveApostrophes: true },
    expected: ["don't", 'stop'],
  },
  {
    label: 'stopwords optional removal',
    input: 'The quick brown fox jumps over the lazy dog',
    options: { removeStopwords: true },
    expected: ['quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog'],
  },
  {
    label: 'min token length',
    input: 'a bb ccc',
    options: { minTokenLength: 2 },
    expected: ['bb', 'ccc'],
  },
  {
    label: 'normalizeText output deterministic',
    input: '  Hello\n\tworld  ',
    options: {},
    expectedNormalized: 'hello world',
  },
];

for (const c of cases) {
  if (c.expectedNormalized) {
    const norm = normalizeText(c.input, c.options);
    assertDeepEqual(norm, c.expectedNormalized, c.label);
  } else {
    const toks = tokenize(c.input, c.options);
    assertDeepEqual(toks, c.expected, c.label);
  }
}

console.log(`tokenizer_check: OK (${cases.length} cases)`);
