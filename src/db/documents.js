import { getPool } from './pool.js';

export async function insertDocument({ title, body, createdAt } = {}) {
  if (typeof title !== 'string' || title.trim() === '') {
    throw new Error('title is required');
  }
  if (typeof body !== 'string' || body.trim() === '') {
    throw new Error('body is required');
  }

  const pool = getPool();

  const { rows } = await pool.query(
    `INSERT INTO documents (title, body, created_at)
     VALUES ($1, $2, COALESCE($3, NOW()))
     RETURNING id, title, body, created_at`,
    [title, body, createdAt ?? null]
  );

  return normalizeRow(rows[0]);
}

export async function insertDocumentsBatch(docs) {
  if (!Array.isArray(docs)) throw new Error('docs must be an array');
  if (docs.length === 0) return [];

  // Validate upfront for clearer errors.
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    if (!d || typeof d !== 'object') throw new Error(`docs[${i}] must be an object`);
    if (typeof d.title !== 'string' || d.title.trim() === '') throw new Error(`docs[${i}].title is required`);
    if (typeof d.body !== 'string' || d.body.trim() === '') throw new Error(`docs[${i}].body is required`);
  }

  const pool = getPool();

  // Build a single INSERT with multiple VALUES.
  const values = [];
  const placeholders = docs
    .map((d, idx) => {
      const base = idx * 3;
      values.push(d.title, d.body, d.createdAt ?? null);
      return `($${base + 1}, $${base + 2}, COALESCE($${base + 3}, NOW()))`;
    })
    .join(', ');

  const { rows } = await pool.query(
    `INSERT INTO documents (title, body, created_at)
     VALUES ${placeholders}
     RETURNING id, title, body, created_at
     ORDER BY id ASC`,
    values
  );

  return rows.map(normalizeRow);
}

export async function getDocumentById(id) {
  const docId = Number(id);
  if (!Number.isInteger(docId) || docId < 1) return null;

  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, title, body, created_at FROM documents WHERE id = $1',
    [docId]
  );
  return rows[0] ? normalizeRow(rows[0]) : null;
}

function normalizeRow(row) {
  return {
    id: Number(row.id),
    title: row.title,
    body: row.body,
    created_at: row.created_at,
  };
}
