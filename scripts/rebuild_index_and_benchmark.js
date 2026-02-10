#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import { createPool } from './db.js';

function parseArgs(argv) {
  const args = { limit: 10, queries: null, repeats: 30, warmup: 5, rebuild: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--repeats') args.repeats = Number(argv[++i]);
    else if (a === '--warmup') args.warmup = Number(argv[++i]);
    else if (a === '--queries') args.queries = String(argv[++i]);
    else if (a === '--no-rebuild') args.rebuild = false;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  if (!Number.isInteger(args.limit) || args.limit < 1) throw new Error('--limit must be a positive integer');
  if (!Number.isInteger(args.repeats) || args.repeats < 1) throw new Error('--repeats must be a positive integer');
  if (!Number.isInteger(args.warmup) || args.warmup < 0) throw new Error('--warmup must be >= 0');
  return args;
}

function usage() {
  return `Usage: node scripts/rebuild_index_and_benchmark.js [--limit 10] [--repeats 30] [--warmup 5] [--queries "alpha,beta,w10"] [--no-rebuild]

Rebuilds inverted_index from documents and benchmarks query latency.
Requires DATABASE_URL.

Output: p50/p95 in ms (plus min/max).
`;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(idx, 0), sorted.length - 1)];
}

async function rebuildIndex(pool) {
  // Simple tokenizer: lowercase and split on non-alphanumerics.
  // This is sufficient for Phase 1 baseline and deterministic synthetic dataset.
  const sql = `
    TRUNCATE TABLE inverted_index RESTART IDENTITY;

    WITH tokens AS (
      SELECT
        d.id AS doc_id,
        LOWER(t.term) AS term
      FROM documents d
      CROSS JOIN LATERAL regexp_split_to_table(d.title || ' ' || d.body, '[^A-Za-z0-9]+') AS t(term)
      WHERE t.term <> ''
    ), tf AS (
      SELECT term, doc_id, COUNT(*)::int AS tf
      FROM tokens
      GROUP BY term, doc_id
    )
    INSERT INTO inverted_index(term, doc_id, tf)
    SELECT term, doc_id, tf
    FROM tf;
  `;
  await pool.query(sql);
}

async function runOneQuery(pool, term, limit) {
  // Return top docs by tf for a single term.
  const q = `
    SELECT d.external_id, i.tf
    FROM inverted_index i
    JOIN documents d ON d.id = i.doc_id
    WHERE i.term = $1
    ORDER BY i.tf DESC, d.id ASC
    LIMIT $2;
  `;
  return pool.query(q, [term.toLowerCase(), limit]);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const pool = createPool();
  try {
    // Ensure tables exist (schema.sql is executed by generator; still guard here)
    await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'documents'`);

    if (args.rebuild) {
      const t0 = performance.now();
      await rebuildIndex(pool);
      const indexMs = performance.now() - t0;
      process.stdout.write(`Index rebuilt in ${indexMs.toFixed(2)} ms\n`);
    } else {
      process.stdout.write('Index rebuild skipped (--no-rebuild)\n');
    }

    const defaultQueries = ['alpha', 'beta', 'gamma', 'w10', 'w999', 'w1500'];
    const queries = args.queries ? args.queries.split(',').map((s) => s.trim()).filter(Boolean) : defaultQueries;

    for (const term of queries) {
      // warmup
      for (let i = 0; i < args.warmup; i++) {
        await runOneQuery(pool, term, args.limit);
      }

      const samples = [];
      for (let i = 0; i < args.repeats; i++) {
        const start = performance.now();
        await runOneQuery(pool, term, args.limit);
        const dur = performance.now() - start;
        samples.push(dur);
      }
      samples.sort((a, b) => a - b);
      const p50 = percentile(samples, 50);
      const p95 = percentile(samples, 95);
      const min = samples[0];
      const max = samples[samples.length - 1];

      process.stdout.write(
        `query term="${term}" n=${samples.length} ` +
          `p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms ` +
          `min=${min.toFixed(2)}ms max=${max.toFixed(2)}ms\n`
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
