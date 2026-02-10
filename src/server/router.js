import { healthHandler } from './routes/health.js';

export async function router(req, res) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return healthHandler(req, res);
  }

  res.statusCode = 404;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'not_found' }));
}
