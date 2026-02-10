import { getDocumentById, insertDocument, insertDocumentsBatch } from '../../db/documents.js';

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return null;
  return JSON.parse(raw);
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export async function createDocumentHandler(req, res) {
  try {
    const data = (await readJson(req)) ?? {};
    const doc = await insertDocument({
      title: data.title,
      body: data.body ?? data.content,
      createdAt: data.created_at ?? data.createdAt,
    });
    return sendJson(res, 201, { document: doc });
  } catch (err) {
    return sendJson(res, 400, { error: 'bad_request', message: err?.message ?? String(err) });
  }
}

export async function createDocumentsBatchHandler(req, res) {
  try {
    const data = (await readJson(req)) ?? {};
    const docs = data.documents ?? data.docs;
    const inserted = await insertDocumentsBatch(
      (docs ?? []).map((d) => ({
        title: d.title,
        body: d.body ?? d.content,
        createdAt: d.created_at ?? d.createdAt,
      }))
    );
    return sendJson(res, 201, { documents: inserted, count: inserted.length });
  } catch (err) {
    return sendJson(res, 400, { error: 'bad_request', message: err?.message ?? String(err) });
  }
}

export async function getDocumentByIdHandler(_req, res, id) {
  const doc = await getDocumentById(id);
  if (!doc) {
    return sendJson(res, 404, { error: 'not_found' });
  }
  return sendJson(res, 200, { document: doc });
}
