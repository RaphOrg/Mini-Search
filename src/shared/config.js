import { config as loadEnv } from 'dotenv';

// Load .env in local/dev environments. In production, environment variables should
// be provided by the runtime.
loadEnv();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function portFromEnv(name, fallback) {
  const raw = process.env[name];
  const value = raw == null || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return value;
}

export const config = {
  port: portFromEnv('PORT', 3000),
  // Optional for Phase 1 scaffolding; required for Postgres-backed indexing.
  databaseUrl: process.env.DATABASE_URL ?? null,

  // Indexing knobs
  indexBatchSize: Number(process.env.INDEX_BATCH_SIZE ?? 1000),
  indexPersistPath: process.env.INDEX_PERSIST_PATH ?? null,
};
