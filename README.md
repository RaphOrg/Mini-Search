# Mini-Search

Phase 1 scaffolding for a mini search engine.

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

## Local setup

1) Start Postgres and create a database (example):

```sql
CREATE DATABASE mini_search;
```

2) Create a `.env` file (see `.env.example`) and set:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/mini_search
```

## Generate deterministic synthetic dataset

Generates `N` synthetic docs deterministically (seeded) and ingests them into Postgres.

```bash
npm run data:generate -- --n 10000 --seed seed --batch-size 1000
```

By default it resets tables first. To keep existing data:

```bash
npm run data:generate -- --n 10000 --seed seed --no-reset
```

## Rebuild inverted index + benchmark query latency

This rebuilds a simple inverted index table in Postgres, then runs a set of sample term queries and prints latency percentiles.

```bash
npm run bench
```

Optional flags:

```bash
npm run bench -- --repeats 50 --warmup 10 --limit 10 --queries "alpha,beta,w10"
```

Example output:

```
Index rebuilt in 1234.56 ms
query term="alpha" n=30 p50=1.23ms p95=3.45ms min=0.98ms max=5.67ms
...
```
