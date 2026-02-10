# Smoke & Perf Scripts

This repo includes a small set of “smoke” scripts to validate basic functionality and to produce baseline performance numbers.

## Perf baseline (`npm run smoke:perf`)

### What it does

`npm run smoke:perf` runs an end-to-end baseline flow:

1. **Seed documents** into Postgres (synthetic dataset).
2. **Build the inverted index** (at most once per run).
3. **Benchmark query latency** by running a repeatable set of single-term queries and printing p50/p95.

### Why the index build happens only once

The perf harness is designed to measure query latency. Rebuilding the index repeatedly inside the benchmark loop is a major performance footgun and makes the numbers meaningless.

As of Phase 3 stabilization, the perf flow builds the index **once** and then runs the query benchmark with index rebuild disabled.

### How to run

```bash
# Requires a running Postgres and DATABASE_URL set
npm run smoke:perf
```

### Common options

You can pass options through to the Node script:

```bash
node scripts/smoke_perf_baseline.js --n 1000 --repeats 30 --warmup 5 --limit 10
```

### Skipping the rebuild step (explicit)

If you have already built the index and want to re-run only the query benchmark:

```bash
node scripts/smoke_perf_baseline.js --no-rebuild
```

Under the hood, the benchmark runner supports:

```bash
node scripts/rebuild_index_and_benchmark.js --no-rebuild
```

## Other smoke scripts

- `npm run smoke:index`: determinism check for index build.
- `npm run smoke:search`: basic HTTP-level search smoke test.
- `npm run smoke:db`: DB connectivity/basic sanity checks.
