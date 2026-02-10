import { Pool } from 'pg';
import { config } from './config.js';

/**
 * Minimal Postgres pool helper.
 *
 * For Phase 1 we keep this tiny: one Pool for the process.
 */
let pool;

export function getPool() {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required to use Postgres-backed indexing');
  }
  if (!pool) {
    pool = new Pool({ connectionString: config.databaseUrl });
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    const p = pool;
    pool = undefined;
    await p.end();
  }
}
