import { randomUUID } from 'node:crypto';
import { CARD_CATALOG } from './cards.js';
import { PILE_IDS, shuffleAndOrient, splitThreeWays } from './engine.js';

export class TarotError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = 'TarotError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function requireStringId(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TarotError('INVALID_REQUEST', `${field} must be a non-empty string.`, 400);
  }
  return value;
}

function validatePositions(positions) {
  if (!Array.isArray(positions) || positions.length === 0) {
    throw new TarotError('INVALID_POSITIONS', 'positions must be a non-empty array.', 400);
  }
  if (positions.length > 128) {
    throw new TarotError('INVALID_POSITIONS', 'Too many positions in one draw.', 400);
  }

  const normalized = positions.map((value, index) => requireStringId(value, `positions[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    throw new TarotError('INVALID_POSITIONS', 'position IDs must be unique within one draw.', 400);
  }
  return normalized;
}

export class TarotStore {
  constructor({ randomIndex, idFactory = randomUUID } = {}) {
    this.randomIndex = randomIndex;
    this.idFactory = idFactory;
    this.sessions = new Map();
    this.branches = new Map();
  }

  createSession() {
    const id = this.idFactory();
    const session = {
      id,
      state: 'created',
      piles: null,
      branchIds: new Set()
    };
    this.sessions.set(id, session);
    return { session_id: id, state: session.state };
  }

  shuffleSession(sessionId) {
    const session = this.#getSession(sessionId);
    if (session.state !== 'created') {
      throw new TarotError('SESSION_ALREADY_SHUFFLED', 'Create a new reading to shuffle again.', 409);
    }

    const deck = shuffleAndOrient(CARD_CATALOG, this.randomIndex);
    session.piles = splitThreeWays(deck);
    session.state = 'split';

    return {
      session_id: session.id,
      state: session.state,
      piles: PILE_IDS.map(pileId => ({ pile_id: pileId, count: session.piles[pileId].length }))
    };
  }

  createBranch(sessionId, pileId) {
    const session = this.#getSession(sessionId);
    if (session.state !== 'split') {
      throw new TarotError('SESSION_NOT_READY', 'Shuffle the session before creating a branch.', 409);
    }
    if (!PILE_IDS.includes(pileId)) {
      throw new TarotError('INVALID_PILE', 'pile must be one of A, B, or C.', 400);
    }

    const branchId = this.idFactory();
    const branch = {
      id: branchId,
      sessionId: session.id,
      pileId,
      cards: session.piles[pileId],
      cursor: 0
    };
    this.branches.set(branchId, branch);
    session.branchIds.add(branchId);

    return {
      branch_id: branch.id,
      session_id: session.id,
      pile_id: pileId,
      available: branch.cards.length
    };
  }

  draw(branchId, positions) {
    const branch = this.#getBranch(branchId);
    const ids = validatePositions(positions);
    const available = branch.cards.length - branch.cursor;

    if (ids.length > available) {
      throw new TarotError(
        'INSUFFICIENT_CARDS',
        'The selected branch does not have enough cards.',
        409,
        { requested: ids.length, available }
      );
    }

    const mapped = {};
    ids.forEach((positionId, offset) => {
      const card = branch.cards[branch.cursor + offset];
      mapped[positionId] = {
        card_id: card.card_id,
        name_en: card.name_en,
        name_ja: card.name_ja,
        orientation: card.orientation
      };
    });
    branch.cursor += ids.length;

    return {
      branch_id: branch.id,
      pile_id: branch.pileId,
      remaining: branch.cards.length - branch.cursor,
      positions: mapped
    };
  }

  deleteSession(sessionId) {
    const session = this.#getSession(sessionId);
    for (const branchId of session.branchIds) {
      this.branches.delete(branchId);
    }
    this.sessions.delete(sessionId);
    return { deleted: true };
  }

  #getSession(sessionId) {
    requireStringId(sessionId, 'session_id');
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new TarotError('SESSION_NOT_FOUND', 'Session not found.', 404);
    }
    return session;
  }

  #getBranch(branchId) {
    requireStringId(branchId, 'branch_id');
    const branch = this.branches.get(branchId);
    if (!branch) {
      throw new TarotError('BRANCH_NOT_FOUND', 'Branch not found.', 404);
    }
    return branch;
  }
}
