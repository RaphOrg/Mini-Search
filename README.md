# Mini-Search

Phase 1 MVP: in-memory inverted index + basic boolean keyword search API.

## Run

```bash
npm install
npm run dev
# server listens on PORT (default 3000)
```

## API

### Health

```bash
curl -sS localhost:3000/health
```

### Search

`GET /search?q=...`

- Multi-term queries are supported (whitespace separated).
- **AND** is the default behavior.
- **OR** behavior is enabled with `mode=or`.
- Optional `limit=<n>` to cap returned doc IDs.
- Optional `include=snippet` to also return a minimal text snippet per doc.

Examples:

```bash
# AND (default): docs containing both "quick" and "fox"
curl -sS 'localhost:3000/search?q=quick%20fox'

# OR: docs containing "cat" or "dog"
curl -sS 'localhost:3000/search?q=cat%20dog&mode=or'

# Include snippets
curl -sS 'localhost:3000/search?q=quick%20fox&include=snippet'
```

Response shape:

```json
{
  "q": "quick fox",
  "mode": "and",
  "terms": ["quick", "fox"],
  "count": 2,
  "docIds": ["1", "2"],
  "results": [
    { "docId": "1", "snippet": "..." }
  ]
}
```
