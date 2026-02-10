import { healthHandler } from './routes/health.js';

export async function router(req, res) {
  // Use a constant origin to avoid trusting/misparsing a user-controlled Host header.
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/health') {
    return healthHandler(req, res);
  }

  res.statusCode = 404;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'not_found' }));
}
