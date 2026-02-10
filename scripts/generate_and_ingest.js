#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import { createPool } from './db.js';

function parseArgs(argv) {
  const args = { n: 1000, seed: 'seed', batchSize: 1000, reset: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--n') args.n = Number(argv[++i]);
    else if (a === '--seed') args.seed = String(argv[++i]);
    else if (a === '--batch-size') args.batchSize = Number(argv[++i]);
    else if (a === '--no-reset') args.reset = false;
    else if (a === '--reset') args.reset = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  if (!Number.isInteger(args.n) || args.n < 1) throw new Error('--n must be a positive integer');
  if (!Number.isInteger(args.batchSize) || args.batchSize < 1) throw new Error('--batch-size must be a positive integer');
  return args;
}

function usage() {
  return `Usage: node scripts/generate_and_ingest.js [--n 10000] [--seed seed] [--batch-size 1000] [--reset|--no-reset]

Generates deterministic synthetic documents and ingests into Postgres.
Requires DATABASE_URL in environment.
`;
}

// Deterministic RNG using repeated SHA256 (portable, no deps)
function makeRng(seed) {
  let state = Buffer.from(seed);
  let pool = Buffer.alloc(0);
  return function next() {
    if (pool.length < 4) {
      state = crypto.createHash('sha256').update(state).digest();
      pool = Buffer.concat([pool, state]);
    }
    const out = pool.readUInt32LE(0);
    pool = pool.subarray(4);
    return out / 0x100000000;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function randint(rng, min, maxInclusive) {
  return min + Math.floor(rng() * (maxInclusive - min + 1));
}

function generateDoc(rng, i, vocab) {
  const topic = pick(rng, ['alpha', 'beta', 'gamma', 'delta', 'epsilon']);
  const titleLen = randint(rng, 4, 10);
  const bodyLen = randint(rng, 60, 180);

  const titleWords = Array.from({ length: titleLen }, () => pick(rng, vocab));
  // Sprinkle topic term to create some predictable hits
  titleWords[Math.floor(rng() * titleWords.length)] = topic;

  const bodyWords = Array.from({ length: bodyLen }, () => pick(rng, vocab));
  for (let k = 0; k < 3; k++) bodyWords[randint(rng, 0, bodyWords.length - 1)] = topic;

  return {
    external_id: `doc_${String(i).padStart(8, '0')}`,
    title: titleWords.join(' '),
    body: bodyWords.join(' '),
  };
}

async function ensureSchema(pool) {
  // Use migrations as the source of truth for schema.
  const sql = await readFile(new URL('../migrations/001_create_documents.sql', import.meta.url), 'utf8');
  await pool.query(sql);
}

async function resetData(pool) {
  await pool.query('TRUNCATE TABLE inverted_index RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE TABLE documents RESTART IDENTITY CASCADE');
}

async function insertBatch(pool, docs) {
  const values = [];
  const params = [];
  let p = 1;
  for (const d of docs) {
    params.push(d.external_id, d.title, d.body);
    values.push(`($${p++}, $${p++}, $${p++})`);
  }
  const q = `INSERT INTO documents (external_id, title, body)
             VALUES ${values.join(',')}
             ON CONFLICT (external_id) DO UPDATE
             SET title = EXCLUDED.title,
                 body = EXCLUDED.body`;
  await pool.query(q, params);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const pool = createPool();
  try {
    await ensureSchema(pool);
    if (args.reset) await resetData(pool);

    const rng = makeRng(args.seed);
    const vocab = Array.from({ length: 2000 }, (_, i) => `w${i}`);

    const started = Date.now();
    let remaining = args.n;
    let i = 0;
    while (remaining > 0) {
      const size = Math.min(args.batchSize, remaining);
      const docs = [];
      for (let k = 0; k < size; k++) {
        docs.push(generateDoc(rng, i++, vocab));
      }
      await insertBatch(pool, docs);
      remaining -= size;
      if (i % (args.batchSize * 10) === 0 || remaining === 0) {
        process.stdout.write(`Inserted ${i}/${args.n} docs\n`);
      }
    }
    const elapsedMs = Date.now() - started;
    process.stdout.write(`Done. Inserted ${args.n} docs in ${elapsedMs} ms\n`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
