import { getAppIndex } from '../../state/index.js';
import { search } from '../../query/index.js';

function parseMode(url) {
  const raw = (url.searchParams.get('mode') ?? '').toLowerCase();
  if (raw === 'or') return 'or';
  if (raw === 'and' || raw === '') return 'and';
  return null;
}

function snippetFor(text, terms) {
  if (!text) return null;
  if (!terms || terms.length === 0) return null;

  const lower = text.toLowerCase();
  let idx = -1;
  let found = null;
  for (const t of terms) {
    const i = lower.indexOf(String(t).toLowerCase());
    if (i !== -1 && (idx === -1 || i < idx)) {
      idx = i;
      found = t;
    }
  }
  if (idx === -1) return null;

  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + String(found).length + 80);
  return text.slice(start, end);
}

export function searchHandler(_req, res, url) {
  const q = url.searchParams.get('q') ?? '';
  const mode = parseMode(url);
  const include = (url.searchParams.get('include') ?? '').toLowerCase();
  const limitRaw = url.searchParams.get('limit');

  if (mode == null) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'invalid_mode', message: 'mode must be and|or' }));
    return;
  }

  const limit = limitRaw == null || limitRaw === '' ? undefined : Number(limitRaw);
  if (limit != null && (!Number.isFinite(limit) || limit < 0)) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'invalid_limit', message: 'limit must be a non-negative number' }));
    return;
  }

  const index = getAppIndex();
  const result = search({ q, mode, limit }, index);

  const payload = {
    q,
    mode: result.mode,
    terms: result.terms,
    count: result.docIds.length,
    docIds: result.docIds,
  };

  if (include === 'snippet') {
    payload.results = result.docIds.map((id) => {
      const doc = index.getDoc(id);
      return {
        docId: Number(id),
        snippet: snippetFor(doc?.text ?? '', result.terms),
      };
    });
  }

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}
