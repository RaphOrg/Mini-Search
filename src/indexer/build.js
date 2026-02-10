import fs from 'node:fs/promises';
import { getPool } from '../shared/db.js';
import { InvertedIndex } from './invertedIndex.js';
import { tokenize, termFrequencies } from './tokenize.js';

function toBigIntId(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') return BigInt(value);
  throw new Error(`Unsupported id type from database: ${typeof value}`);
}

/**
 * Reads documents from Postgres in batches and builds an inverted index.
 *
 * Assumed schema for MVP:
 *   documents(id bigint/int primary key, content text)
 *
 * Pagination strategy: keyset pagination by id (deterministic).
 */
export async function buildInvertedIndex({
  batchSize = 1000,
  table = 'documents',
  idColumn = 'id',
  contentColumn = 'content',
  startAfterId = 0n,
  persistPath = null,
} = {}) {
  const pool = getPool();
  const index = new InvertedIndex();

  let lastId = typeof startAfterId === 'bigint' ? startAfterId : BigInt(startAfterId);

  // Note: identifiers can't be parameterized; keep MVP constraints and validate
  // column/table names to avoid SQL injection.
  const ident = (s) => {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) {
      throw new Error(`Invalid identifier: ${s}`);
    }
    return `"${s}"`;
  };

  const tableIdent = ident(table);
  const idIdent = ident(idColumn);
  const contentIdent = ident(contentColumn);

  while (true) {
    // node-postgres will send BigInt values to Postgres correctly when used as
    // query params; if needed, Postgres will coerce from text.
    const res = await pool.query(
      `SELECT ${idIdent} AS id, ${contentIdent} AS content\n` +
        `FROM ${tableIdent}\n` +
        `WHERE ${idIdent} > $1\n` +
        `ORDER BY ${idIdent} ASC\n` +
        `LIMIT $2`,
      [lastId, batchSize],
    );

    if (res.rows.length === 0) break;

    for (const row of res.rows) {
      const docId = toBigIntId(row.id);
      const content = row.content ?? '';
      const tokens = tokenize(content);
      const tfByTerm = termFrequencies(tokens);
      index.addDocument(docId, tfByTerm);
      lastId = docId;
    }
  }

  index.finalize();

  if (persistPath) {
    const payload = index.toJSON();
    await fs.writeFile(persistPath, JSON.stringify(payload), 'utf8');
  }

  return index;
}
