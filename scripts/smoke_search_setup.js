#!/usr/bin/env node
import pg from 'pg';

import { createIsolatedDatabase, requireEnv } from './smoke_db_utils.js';

function shEscapeSingle(s) {
  return `'${String(s).replaceAll("'", `'"'"'`)}'`;
}

async function runMigrations(databaseUrl) {
  // Run the same migration command used elsewhere.
  const { spawn } = await import('node:child_process');
  await new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'db:migrate'], {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm run db:migrate exited with code ${code}`));
    });
  });
}

async function seedFixtures(databaseUrl) {
  const { Client } = pg;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // Ensure a clean state even if migrations create defaults later.
    await client.query('TRUNCATE TABLE inverted_index RESTART IDENTITY CASCADE');
    await client.query('TRUNCATE TABLE documents RESTART IDENTITY CASCADE');

    // Insert exactly 3 docs with deterministic IDs 1..3
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
  requireEnv('DATABASE_URL');
  const isolated = await createIsolatedDatabase({ prefix: 'mini_search_smoke_search' });
  try {
    await runMigrations(isolated.databaseUrl);
    await seedFixtures(isolated.databaseUrl);

    // Print shell assignments for the parent bash script to eval.
    // We intentionally print DROP_DB_CMD rather than calling drop here.
    process.stdout.write(
      `export DATABASE_URL=${shEscapeSingle(isolated.databaseUrl)}\n` +
        `export DROP_DB_CMD=${shEscapeSingle(
          `node -e "import('./scripts/smoke_db_utils.js').then(async m => { process.env.DATABASE_URL=${shEscapeSingle(
            requireEnv('DATABASE_URL')
          )}; const i=await m.createIsolatedDatabase({prefix:'noop'}); })"`
        )}\n`
    );
  } catch (e) {
    // If setup fails, drop the DB immediately.
    await isolated.drop();
    throw e;
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exitCode = 1;
});
