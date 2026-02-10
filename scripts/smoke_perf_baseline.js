#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';

function parseArgs(argv) {
  const args = {
    n: 1000,
    seed: 'smoke',
    batchSize: 1000,
    limit: 10,
    repeats: 30,
    warmup: 5,
    queries: 'alpha,beta,gamma,w10,w999,w1500',
    rebuild: true,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--n') args.n = Number(argv[++i]);
    else if (a === '--seed') args.seed = String(argv[++i]);
    else if (a === '--batch-size') args.batchSize = Number(argv[++i]);
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--repeats') args.repeats = Number(argv[++i]);
    else if (a === '--warmup') args.warmup = Number(argv[++i]);
    else if (a === '--queries') args.queries = String(argv[++i]);
    else if (a === '--no-rebuild') args.rebuild = false;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }

  if (!Number.isInteger(args.n) || args.n < 1) throw new Error('--n must be a positive integer');
  if (!Number.isInteger(args.batchSize) || args.batchSize < 1) throw new Error('--batch-size must be a positive integer');
  if (!Number.isInteger(args.limit) || args.limit < 1) throw new Error('--limit must be a positive integer');
  if (!Number.isInteger(args.repeats) || args.repeats < 1) throw new Error('--repeats must be a positive integer');
  if (!Number.isInteger(args.warmup) || args.warmup < 0) throw new Error('--warmup must be >= 0');

  return args;
}

function usage() {
  return `Usage: node scripts/smoke_perf_baseline.js [options]

Runs end-to-end baseline:
  migrate/seed (documents) -> build (inverted_index) -> query loop benchmark

Options:
  --n 1000
  --seed smoke
  --batch-size 1000
  --limit 10
  --repeats 30
  --warmup 5
  --queries "alpha,beta,gamma,w10"
  --no-rebuild   Skip index rebuild (assumes inverted_index is already built)

Requires: DATABASE_URL
`;
}

function runNode(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) return reject(new Error(`${scriptPath} exited with signal ${signal}`));
      if (code !== 0) return reject(new Error(`${scriptPath} exited with code ${code}`));
      resolve();
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const tAll0 = performance.now();

  process.stdout.write('== Smoke Perf Baseline ==\n');

  process.stdout.write('\n[1/3] Seed documents\n');
  await runNode(new URL('./generate_and_ingest.js', import.meta.url), [
    '--n',
    String(args.n),
    '--seed',
    args.seed,
    '--batch-size',
    String(args.batchSize),
    '--reset',
  ]);

  if (args.rebuild) {
    process.stdout.write('\n[2/3] Build inverted index\n');
    // One index build per run.
    await runNode(new URL('./rebuild_index_and_benchmark.js', import.meta.url), [
      '--repeats',
      '1',
      '--warmup',
      '0',
      '--limit',
      '1',
      '--queries',
      'alpha',
    ]);
  } else {
    process.stdout.write('\n[2/3] Build inverted index (skipped via --no-rebuild)\n');
  }

  process.stdout.write('\n[3/3] Query latency benchmark\n');
  // Do not rebuild the index during the benchmark loop.
  await runNode(new URL('./rebuild_index_and_benchmark.js', import.meta.url), [
    '--no-rebuild',
    '--limit',
    String(args.limit),
    '--repeats',
    String(args.repeats),
    '--warmup',
    String(args.warmup),
    '--queries',
    args.queries,
  ]);

  const totalMs = performance.now() - tAll0;
  process.stdout.write(`\nTotal runtime: ${(totalMs / 1000).toFixed(2)} s (${totalMs.toFixed(0)} ms)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
