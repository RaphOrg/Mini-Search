import { config as loadEnv } from 'dotenv';

// Load .env in local/dev environments. In production, environment variables should
// be provided by the runtime.
loadEnv();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  // Optional for Phase 1 scaffolding; will become required once DB is used.
  databaseUrl: process.env.DATABASE_URL ?? null,
  // If/when DB becomes required, switch to:
  // databaseUrl: required('DATABASE_URL'),
};
