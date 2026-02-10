import pg from 'pg';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required environment variable: ${name}.\n` +
        `Provide it as e.g. ${name}=postgres://USER:PASSWORD@HOST:5432/DBNAME`
    );
  }
  return v;
}

// This helper exists mainly to provide clear prerequisite failures for smoke scripts.
export async function requireCommand(cmd) {
  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, ['--version'], { stdio: 'ignore' });
    child.on('error', () => {
      reject(
        new Error(
          `Missing required prerequisite: ${cmd}.\n` +
            `Install it and ensure it's on PATH. Under Debian/Ubuntu: apt-get install -y postgresql-client`
        )
      );
    });
    child.on('exit', (code) => {
      if (code === 0) resolve(true);
      else {
        reject(
          new Error(
            `Failed to execute ${cmd} --version (exit ${code}).\n` +
              `Ensure ${cmd} is installed and on PATH.`
          )
        );
      }
    });
  });
}

export function makeTestDatabaseName(prefix = 'mini_search_smoke') {
  const runId = (process.env.SMOKE_RUN_ID || randomUUID()).slice(0, 10);
  return `${prefix}_${runId}`;
}

export function withDbName(databaseUrl, dbName) {
  const u = new URL(databaseUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
}

function adminUrlFrom(databaseUrl) {
  const u = new URL(databaseUrl);
  // Connect to postgres maintenance DB for CREATE/DROP DATABASE.
  u.pathname = '/postgres';
  return u.toString();
}

function ident(name) {
  // Minimal identifier escaping for Postgres.
  return '"' + String(name).replaceAll('"', '""') + '"';
}

export async function createIsolatedDatabase({ prefix = 'mini_search_smoke' } = {}) {
  const baseUrl = requireEnv('DATABASE_URL');
  await requireCommand('psql');

  const dbName = makeTestDatabaseName(prefix);
  const adminUrl = adminUrlFrom(baseUrl);
  const testUrl = withDbName(baseUrl, dbName);

  const { Client } = pg;
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE ${ident(dbName)}`);
  } catch (e) {
    throw new Error(
      `Failed to create isolated database ${dbName}.\n` +
        `Ensure the DATABASE_URL user has CREATEDB privileges.\n` +
        `Original error: ${e?.message || String(e)}`
    );
  } finally {
    await client.end();
  }

  async function drop() {
    const c = new Client({ connectionString: adminUrl });
    await c.connect();
    try {
      await c.query(
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [dbName]
      );
      await c.query(`DROP DATABASE IF EXISTS ${ident(dbName)}`);
    } finally {
      await c.end();
    }
  }

  return { dbName, databaseUrl: testUrl, drop };
}
