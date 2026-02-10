#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';

import pg from 'pg';

import { createIsolatedDatabase, requireEnv } from './smoke_db_utils.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function run(cmd, args, { env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      env: { ...process.env, ...(env ?? {}) },
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function httpJson(method, url, body, { timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));

    const req = http.request(
      {
        method,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        headers: {
          ...(payload
            ? {
                'content-type': 'application/json; charset=utf-8',
                'content-length': String(payload.length),
              }
            : {}),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          const ct = res.headers['content-type'] ?? '';
          const isJson = ct.includes('application/json');
          const parsed = isJson && raw ? JSON.parse(raw) : raw;
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('HTTP request timed out')));
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(baseUrl, { timeoutMs = 15000 } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const r = await httpJson('GET', `${baseUrl}/health`);
      if (r.status === 200) return;
    } catch {
      // ignore
    }
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for server /health');
    await sleep(200);
  }
}

async function main() {
  // Requires a locally available Postgres via DATABASE_URL.
  requireEnv('DATABASE_URL');

  const SERVER_PORT = Number(process.env.SMOKE_SERVER_PORT ?? 3333);

  const isolated = await createIsolatedDatabase({ prefix: 'mini_search_smoke_db' });
  const databaseUrl = isolated.databaseUrl;

  let serverProc;

  try {
    // Run migrations against fresh isolated DB
    await run('npm', ['run', 'db:migrate'], {
      env: {
        DATABASE_URL: databaseUrl,
      },
    });

    // Ingest exactly 20 via CLI (batch)
    const cliDocs = Array.from({ length: 20 }, (_, i) => ({
      title: `cli doc ${i + 1}`,
      body: `cli body ${i + 1} - quick brown fox ${i % 5}`,
    }));

    const runId = isolated.dbName;
    const cliBatchFile = `/tmp/mini-search-cli-docs-${runId}.json`;
    await run('node', [
      '-e',
      `require('node:fs').writeFileSync(${JSON.stringify(cliBatchFile)}, JSON.stringify({documents:${JSON.stringify(
        cliDocs
      )}}))`,
    ]);

    await run('node', ['src/cli/documents.js', 'batch', '--file', cliBatchFile], {
      env: {
        DATABASE_URL: databaseUrl,
      },
    });

    // Start HTTP server and ingest exactly 20 via HTTP batch
    serverProc = spawn('node', ['src/index.js'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        PORT: String(SERVER_PORT),
        DATABASE_URL: databaseUrl,
      },
    });

    const baseUrl = `http://127.0.0.1:${SERVER_PORT}`;
    await waitForHealth(baseUrl);

    const httpDocs = Array.from({ length: 20 }, (_, i) => ({
      title: `http doc ${i + 1}`,
      body: `http body ${i + 1} - cats and dogs ${i % 7}`,
    }));

    const resp = await httpJson('POST', `${baseUrl}/documents/batch`, { documents: httpDocs });
    if (resp.status !== 201) {
      throw new Error(`HTTP batch insert failed: status=${resp.status} body=${JSON.stringify(resp.body)}`);
    }
    if (!resp.body || resp.body.count !== 20) {
      throw new Error(`Expected HTTP insert count=20, got: ${JSON.stringify(resp.body)}`);
    }

    const { Client } = pg;
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();

    const countRes = await client.query('SELECT COUNT(*)::int AS n FROM documents');
    const n = countRes.rows[0]?.n ?? 0;
    if (n !== 40) throw new Error(`Expected exactly 40 documents (20 cli + 20 http), found ${n}`);

    const rowRes = await client.query('SELECT id, title, body, created_at FROM documents ORDER BY id ASC LIMIT 5');
    for (const r of rowRes.rows) {
      if (r.id == null || r.title == null || r.body == null || r.created_at == null) {
        throw new Error(`Row missing required fields: ${JSON.stringify(r)}`);
      }
    }

    await client.end();

    // eslint-disable-next-line no-console
    console.log(`\nsmoke:db OK (documents=${n})`);
  } finally {
    if (serverProc) {
      serverProc.kill('SIGTERM');
      await Promise.race([once(serverProc, 'exit'), sleep(2000)]);
    }
    await isolated.drop();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err?.message || err);
  process.exitCode = 1;
});
