import http from 'node:http';

import { config } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import { router } from './router.js';

function safeErrorMessage(err) {
  if (!err) return 'Unknown error';
  if (err instanceof Error) return err.message || err.name;
  return String(err);
}

function getRequestContext(req) {
  return {
    method: req.method,
    url: req.url,
    // Avoid logging full headers by default to reduce risk of leaking secrets.
    // Add more fields here if debugging requires it.
    userAgent: req.headers?.['user-agent'],
  };
}

export function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      await router(req, res);
    } catch (err) {
      // Always log stack trace server-side for actionable debugging.
      logger.error('Unhandled request error', {
        request: getRequestContext(req),
        message: safeErrorMessage(err),
        stack: err?.stack ?? null,
      });

      const includeStack = config.includeErrorStack && config.nodeEnv !== 'production';

      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json; charset=utf-8');
      }
      if (!res.writableEnded) {
        res.end(
          JSON.stringify({
            error: {
              code: 'internal_server_error',
              message: safeErrorMessage(err),
              ...(includeStack ? { stack: err?.stack ?? String(err) } : null),
            },
          })
        );
      }
    }
  });

  server.listen(config.port, () => {
    logger.info(`server listening on port ${config.port}`);
  });

  return server;
}
