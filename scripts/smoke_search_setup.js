#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import pg from 'pg';

import { createIsolatedDatabase, requireEnv } from './smoke_db_utils.js';

function parseArgs(argv) {
  return { json: argv.includes('--json') };
}

async function ensureSchema(databaseUrl) {
  const sql = await readFile(new URL('../migrations/001_create_documents.sql', import.meta.url), 'utf8');
  const { Client } = pg;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function seedFixtures(databaseUrl) {
  const { Client } = pg;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('TRUNCATE TABLE documents RESTART IDENTITY CASCADE');

    await client.query(
      `INSERT INTO documents (external_id, title, body)
       VALUES
         ('seed_1', 'doc 1', 'the quick brown fox jumps over the lazy dog'),
         ('seed_2', 'doc 2', 'the quick red fox jumps over the sleeping cat'),
         ('seed_3', 'doc 3', 'cats and dogs can be friends')`
    );

    const r = await client.query('SELECT id FROM documents ORDER BY id ASC');
    const ids = r.rows.map((x) => String(x.id));
    if (ids.join(',') !== '1,2,3') {
      throw new Error(`Fixture contamination: expected inserted ids 1,2,3 but got ${ids.join(',')}`);
    }
  } finally {
    await client.end();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.json) throw new Error('Usage: node scripts/smoke_search_setup.js --json');

  requireEnv('DATABASE_URL');
  const isolated = await createIsolatedDatabase({ prefix: 'mini_search_smoke_search' });

  try {
    await ensureSchema(isolated.databaseUrl);
    await seedFixtures(isolated.databaseUrl);

    process.stdout.write(JSON.stringify({ databaseUrl: isolated.databaseUrl, dbName: isolated.dbName }));
  } catch (e) {
    await isolated.drop();
    throw e;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err?.message || err);
  process.exitCode = 1;
});
