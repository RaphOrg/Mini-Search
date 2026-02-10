import { healthHandler } from './routes/health.js';
import { searchHandler } from './routes/search.js';
import {
  createDocumentHandler,
  createDocumentsBatchHandler,
  getDocumentByIdHandler,
} from './routes/documents.js';

export async function router(req, res) {
  // Use a constant origin to avoid trusting/misparsing a user-controlled Host header.
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/health') {
    return healthHandler(req, res);
  }

  if (req.method === 'GET' && url.pathname === '/search') {
    return searchHandler(req, res, url);
  }

  if (req.method === 'POST' && url.pathname === '/documents') {
    return createDocumentHandler(req, res);
  }

  if (req.method === 'POST' && url.pathname === '/documents/batch') {
    return createDocumentsBatchHandler(req, res);
  }

  const docIdMatch = url.pathname.match(/^\/documents\/(\d+)$/);
  if (req.method === 'GET' && docIdMatch) {
    return getDocumentByIdHandler(req, res, docIdMatch[1]);
  }

  res.statusCode = 404;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'not_found' }));
}
