import { CARD_CATALOG } from './cards.js';
import { TarotError, requireStringId, validatePositions, validateIncludeCustom } from './domain.js';
import { PILE_IDS, shuffleAndOrient, splitThreeWays } from './engine.js';

const PAGES_ORIGIN = 'https://kinoko34077.github.io';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;

function jsonResponse(payload, status = 200, origin = null) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  if (origin === PAGES_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(payload), { status, headers });
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

function allowedOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== PAGES_ORIGIN) {
    throw new TarotError('FORBIDDEN_ORIGIN', 'Origin is not allowed.', 403);
  }
  return origin;
}

async function parseJson(request) {
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new TarotError('BODY_TOO_LARGE', 'Request body is too large.', 413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new TarotError('BODY_TOO_LARGE', 'Request body is too large.', 413);
  }
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new TarotError('INVALID_JSON', 'Request body must be valid JSON.', 400);
  }
}

function parseBranchId(branchId) {
  requireStringId(branchId, 'branch_id');
  const separator = branchId.indexOf('~');
  if (separator <= 0 || separator === branchId.length - 1) {
    throw new TarotError('INVALID_REQUEST', 'branch_id is invalid.', 400);
  }
  return {
    sessionId: branchId.slice(0, separator),
    localBranchId: branchId.slice(separator + 1)
  };
}

async function applyRateLimit(request, env) {
  if (!env.TAROT_RATE_LIMITER?.limit) return;
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { success } = await env.TAROT_RATE_LIMITER.limit({ key: ip });
  if (!success) {
    throw new TarotError('RATE_LIMITED', 'Too many requests. Try again shortly.', 429);
  }
}

function getSessionStub(env, sessionId) {
  requireStringId(sessionId, 'session_id');
  const id = env.TAROT_SESSIONS.idFromName(sessionId);
  return env.TAROT_SESSIONS.get(id);
}

async function forward(stub, path, init, origin) {
  const response = await stub.fetch(new Request(`https://tarot-session.internal${path}`, init));
  const headers = new Headers(response.headers);
  if (origin === PAGES_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status: response.status, headers });
}

export class TarotSession {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (request.method === 'POST' && path === '/create') {
        const sessionId = requireStringId(request.headers.get('X-Tarot-Session-Id'), 'session_id');
        const existing = await this.ctx.storage.get('session');
        if (existing) {
          throw new TarotError('SESSION_ALREADY_EXISTS', 'Session already exists.', 409);
        }

        const session = {
          id: sessionId,
          state: 'created',
          piles: null,
          branches: {}
        };
        await this.ctx.storage.put('session', session);
        await this.#touch();
        return jsonResponse({ session_id: session.id, state: session.state }, 201);
      }

      if (request.method === 'POST' && path === '/shuffle') {
        const options = await parseJson(request);
        const session = await this.#requireSession();
        if (session.state !== 'created') {
          throw new TarotError('SESSION_ALREADY_SHUFFLED', 'Create a new reading to shuffle again.', 409);
        }

        const includeCustom = validateIncludeCustom(options.include_custom);
        const source = includeCustom ? CARD_CATALOG : CARD_CATALOG.filter(card => !card.card_id.startsWith('meta.'));
        const deck = shuffleAndOrient(source);
        session.piles = splitThreeWays(deck);
        session.state = 'split';
        await this.ctx.storage.put('session', session);
        await this.#touch();

        return jsonResponse({
          session_id: session.id,
          state: session.state,
          include_custom: includeCustom,
          total_cards: deck.length,
          piles: PILE_IDS.map(pileId => ({ pile_id: pileId, count: session.piles[pileId].length }))
        });
      }

      if (request.method === 'POST' && path === '/branches') {
        const body = await parseJson(request);
        const session = await this.#requireSession();
        if (session.state !== 'split') {
          throw new TarotError('SESSION_NOT_READY', 'Shuffle the session before creating a branch.', 409);
        }
        if (!PILE_IDS.includes(body.pile)) {
          throw new TarotError('INVALID_PILE', 'pile must be one of A, B, or C.', 400);
        }

        const localBranchId = crypto.randomUUID();
        session.branches[localBranchId] = { pileId: body.pile, cursor: 0 };
        await this.ctx.storage.put('session', session);
        await this.#touch();

        return jsonResponse({
          branch_id: `${session.id}~${localBranchId}`,
          session_id: session.id,
          pile_id: body.pile,
          available: session.piles[body.pile].length
        }, 201);
      }

      if (request.method === 'POST' && path === '/draw') {
        const body = await parseJson(request);
        const localBranchId = requireStringId(body.branch_id, 'branch_id');
        const positions = validatePositions(body.positions);
        const session = await this.#requireSession();
        const branch = session.branches[localBranchId];
        if (!branch) {
          throw new TarotError('BRANCH_NOT_FOUND', 'Branch not found.', 404);
        }

        const cards = session.piles[branch.pileId];
        const available = cards.length - branch.cursor;
        if (positions.length > available) {
          throw new TarotError(
            'INSUFFICIENT_CARDS',
            'The selected branch does not have enough cards.',
            409,
            { requested: positions.length, available }
          );
        }

        const mapped = {};
        positions.forEach((positionId, offset) => {
          const card = cards[branch.cursor + offset];
          mapped[positionId] = {
            card_id: card.card_id,
            name_en: card.name_en,
            name_ja: card.name_ja,
            orientation: card.orientation
          };
        });
        branch.cursor += positions.length;
        await this.ctx.storage.put('session', session);
        await this.#touch();

        return jsonResponse({
          branch_id: `${session.id}~${localBranchId}`,
          pile_id: branch.pileId,
          remaining: cards.length - branch.cursor,
          positions: mapped
        });
      }

      if (request.method === 'DELETE' && path === '/session') {
        await this.#requireSession();
        await this.ctx.storage.deleteAll();
        return jsonResponse({ deleted: true });
      }

      return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }, 404);
    } catch (error) {
      if (error instanceof TarotError) {
        return jsonResponse(errorPayload(error), error.status);
      }
      console.error(error);
      return jsonResponse(errorPayload(error), 500);
    }
  }

  async #requireSession() {
    const session = await this.ctx.storage.get('session');
    if (!session) {
      throw new TarotError('SESSION_NOT_FOUND', 'Session not found.', 404);
    }
    return session;
  }

  async #touch() {
    await this.ctx.storage.setAlarm(Date.now() + SESSION_TTL_MS);
  }
}

export const worker = {
  async fetch(request, env) {
    let origin = null;
    try {
      origin = allowedOrigin(request);

      if (request.method === 'OPTIONS') {
        if (origin !== PAGES_ORIGIN) {
          throw new TarotError('FORBIDDEN_ORIGIN', 'Origin is not allowed.', 403);
        }
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
            'Vary': 'Origin'
          }
        });
      }

      const url = new URL(request.url);
      const { pathname } = url;

      if (request.method === 'GET' && pathname === '/api/health') {
        return jsonResponse({ ok: true }, 200, origin);
      }

      await applyRateLimit(request, env);

      if (request.method === 'POST' && pathname === '/api/sessions') {
        const sessionId = crypto.randomUUID();
        const stub = getSessionStub(env, sessionId);
        return forward(stub, '/create', {
          method: 'POST',
          headers: { 'X-Tarot-Session-Id': sessionId }
        }, origin);
      }

      let match = pathname.match(/^\/api\/sessions\/([^/]+)\/shuffle$/);
      if (request.method === 'POST' && match) {
        const sessionId = decodeURIComponent(match[1]);
        const options = await parseJson(request);
        validateIncludeCustom(options.include_custom);
        return forward(getSessionStub(env, sessionId), '/shuffle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ include_custom: options.include_custom ?? true })
        }, origin);
      }

      match = pathname.match(/^\/api\/sessions\/([^/]+)\/branches$/);
      if (request.method === 'POST' && match) {
        const sessionId = decodeURIComponent(match[1]);
        const body = await parseJson(request);
        return forward(getSessionStub(env, sessionId), '/branches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }, origin);
      }

      match = pathname.match(/^\/api\/branches\/([^/]+)\/draw$/);
      if (request.method === 'POST' && match) {
        const branchId = decodeURIComponent(match[1]);
        const { sessionId, localBranchId } = parseBranchId(branchId);
        const body = await parseJson(request);
        return forward(getSessionStub(env, sessionId), '/draw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branch_id: localBranchId, positions: body.positions })
        }, origin);
      }

      match = pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (request.method === 'DELETE' && match) {
        const sessionId = decodeURIComponent(match[1]);
        return forward(getSessionStub(env, sessionId), '/session', { method: 'DELETE' }, origin);
      }

      return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }, 404, origin);
    } catch (error) {
      if (error instanceof TarotError) {
        return jsonResponse(errorPayload(error), error.status, origin);
      }
      console.error(error);
      return jsonResponse(errorPayload(error), 500, origin);
    }
  }
};

export default worker;
