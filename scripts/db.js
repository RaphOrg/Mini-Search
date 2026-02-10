import { config as loadEnv } from 'dotenv';
import pg from 'pg';

loadEnv();

const { Pool } = pg;

export function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Missing required env var: DATABASE_URL');
  }
  return url;
}

export function createPool() {
  return new Pool({
    connectionString: getDatabaseUrl(),
  });
}
