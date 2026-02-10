#!/usr/bin/env node
/**
 * Phase 2 Smoke Test: End-to-end index build against Postgres.
 *
 * Validates:
 *  - Index build CLI completes successfully against seeded DB
 *  - Output contains expected terms + postings with TF counts
 *  - Re-running build with no DB changes yields byte-identical JSON output
 *
 * Usage:
 *   DATABASE_URL=... node scripts/smoke_index_build_determinism.js
 */

import { spawn } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function runNode(args, { env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...(env ?? {}) },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d) => (stderr += d.toString('utf8')));

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else {
        const err = new Error(`Command failed (${code}): node ${args.join(' ')}`);
        err.code = code;
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function main() {
  assert(process.env.DATABASE_URL, 'DATABASE_URL must be set');

  const tmpDir = path.join(process.cwd(), '.tmp_smoke');
  await mkdir(tmpDir, { recursive: true });

  const out1 = path.join(tmpDir, 'index_run1.json');
  const out2 = path.join(tmpDir, 'index_run2.json');

  // Ensure clean run artifacts.
  await rm(out1, { force: true });
  await rm(out2, { force: true });

  // Seed a small deterministic dataset. Make ingestion batch-size small enough to
  // exercise its batching path.
  await runNode(['scripts/generate_and_ingest.js', '--n', '25', '--seed', 'smoke', '--batch-size', '7', '--reset']);

  // Build index with a small batch size to force multiple SELECT batches.
  await runNode(['src/indexer/cli.js', `--batchSize=10`, `--persistPath=${out1}`]);
  await runNode(['src/indexer/cli.js', `--batchSize=10`, `--persistPath=${out2}`]);

  const b1 = await readFile(out1);
  const b2 = await readFile(out2);

  const h1 = sha256(b1);
  const h2 = sha256(b2);

  assert(h1 === h2, `Index JSON not byte-identical across runs: ${h1} != ${h2}`);

  const j = JSON.parse(b1.toString('utf8'));
  assert(typeof j.docCount === 'number' && j.docCount === 25, `Unexpected docCount: ${j.docCount}`);
  assert(j.postings && typeof j.postings === 'object', 'postings missing');

  // Deterministic term expectations:
  // - generator always injects one of these topic terms (alpha..epsilon) into each doc.
  // - tokenizer yields lowercased tokens; topics are already lowercase.
  for (const t of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) {
    assert(Array.isArray(j.postings[t]), `Expected term '${t}' missing postings`);
    assert(j.postings[t].length > 0, `Expected term '${t}' to have postings`);
  }

  // Validate TF presence and shape; TF must be a positive integer.
  // We also expect postings to be sorted by docId due to finalize().
  for (const term of Object.keys(j.postings)) {
    const list = j.postings[term];
    assert(Array.isArray(list), `postings for '${term}' must be an array`);
    let last = -Infinity;
    for (const p of list) {
      assert(typeof p.docId === 'number' || typeof p.docId === 'string' || typeof p.docId === 'bigint', 'docId must exist');
      const docIdNum = Number(p.docId);
      assert(Number.isFinite(docIdNum), `docId must be numeric-like, got ${p.docId}`);
      assert(docIdNum >= 1, `docId must be >= 1, got ${docIdNum}`);
      assert(Number.isInteger(p.tf) && p.tf >= 1, `tf must be a positive integer for '${term}', got ${p.tf}`);
      assert(docIdNum >= last, `postings for '${term}' are not sorted by docId`);
      last = docIdNum;
    }
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        docCount: j.docCount,
        termCount: Object.keys(j.postings).length,
        sha256: h1,
        out1,
        out2,
      },
      null,
      2,
    ) + '\n',
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
