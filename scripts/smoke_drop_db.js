#!/usr/bin/env node
import { dropDatabaseByName, requireEnv } from './smoke_db_utils.js';

async function main() {
  const baseUrl = requireEnv('DATABASE_URL');
  const dbName = process.argv[2];
  if (!dbName) throw new Error('Usage: node scripts/smoke_drop_db.js <dbName>');
  await dropDatabaseByName({ baseUrl, dbName });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err?.message || err);
  process.exitCode = 1;
});
