import { createServer as createNodeServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { TarotError, TarotStore } from './store.js';

const WEB_ROOT = resolve(fileURLToPath(new URL('../web/', import.meta.url)));
const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/model.js', ['model.js', 'text/javascript; charset=utf-8']],
  ['/runtime-config.js', ['runtime-config.js', 'text/javascript; charset=utf-8']],
  ['/config.js', ['config.js', 'text/javascript; charset=utf-8']]
]);

function setCommonHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https:; img-src 'self' data: https://commons.wikimedia.org https://upload.wikimedia.org https://thumb.wikimedia.org; base-uri 'none'; frame-ancestors 'none'"
  );
}

function json(res, status, payload) {
  setCommonHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function parseJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) {
      throw new TarotError('BODY_TOO_LARGE', 'Request body is too large.', 413);
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new TarotError('INVALID_JSON', 'Request body must be valid JSON.', 400);
  }
}

function errorPayload(error) {
  return {
    error: {
      code: error.code ?? 'INTERNAL_ERROR',
      message: error.message ?? 'Internal server error.',
      ...(error.details ? { details: error.details } : {})
    }
  };
}

async function serveStatic(pathname, res) {
  const entry = STATIC_FILES.get(pathname);
  if (!entry) return false;
  const [filename, contentType] = entry;
  const data = await readFile(resolve(WEB_ROOT, filename));
  setCommonHeaders(res);
  res.statusCode = 200;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-cache');
  res.end(data);
  return true;
}

export function createTarotServer({ store = new TarotStore() } = {}) {
  return createNodeServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const { pathname } = url;

      if (req.method === 'GET' && pathname === '/api/health') {
        return json(res, 200, { ok: true });
      }

      if (req.method === 'POST' && pathname === '/api/sessions') {
        return json(res, 201, store.createSession());
      }

      let match = pathname.match(/^\/api\/sessions\/([^/]+)\/shuffle$/);
      if (req.method === 'POST' && match) {
        return json(res, 200, store.shuffleSession(decodeURIComponent(match[1])));
      }

      match = pathname.match(/^\/api\/sessions\/([^/]+)\/branches$/);
      if (req.method === 'POST' && match) {
        const body = await parseJson(req);
        return json(res, 201, store.createBranch(decodeURIComponent(match[1]), body.pile));
      }

      match = pathname.match(/^\/api\/branches\/([^/]+)\/draw$/);
      if (req.method === 'POST' && match) {
        const body = await parseJson(req);
        return json(res, 200, store.draw(decodeURIComponent(match[1]), body.positions));
      }

      match = pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (req.method === 'DELETE' && match) {
        return json(res, 200, store.deleteSession(decodeURIComponent(match[1])));
      }

      if (req.method === 'GET' && await serveStatic(pathname, res)) {
        return;
      }

      return json(res, 404, { error: { code: 'NOT_FOUND', message: 'Route not found.' } });
    } catch (error) {
      if (error instanceof TarotError) {
        return json(res, error.status, errorPayload(error));
      }
      console.error(error);
      return json(res, 500, errorPayload(error));
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  const server = createTarotServer();
  server.listen(port, () => {
    console.log(`tarot-draw listening on http://localhost:${port}`);
  });
}
