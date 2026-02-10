import http from 'node:http';

import { config } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import { router } from './router.js';

export function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      await router(req, res);
    } catch (err) {
      logger.error('Unhandled request error', { err: err?.stack ?? String(err) });
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json; charset=utf-8');
      }
      if (!res.writableEnded) {
        res.end(JSON.stringify({ error: 'internal_server_error' }));
      }
    }
  });

  server.listen(config.port, () => {
    logger.info(`server listening on port ${config.port}`);
  });

  return server;
}
