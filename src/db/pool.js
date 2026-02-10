import pg from 'pg';

import { config } from '../shared/config.js';

const { Pool } = pg;

let pool;

export function getPool() {
  if (pool) return pool;
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required to use the database');
  }
  pool = new Pool({ connectionString: config.databaseUrl });
  return pool;
}
