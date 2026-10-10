import { CARD_CATALOG } from './cards.js';
import { TarotError, requireStringId, validatePositions, validateShuffleOptions } from './domain.js';
import { PILE_IDS, shuffleAndOrient, splitThreeWays } from './engine.js';

export { TarotError } from './domain.js';

export class TarotStore {
  constructor({ randomIndex, idFactory = () => crypto.randomUUID() } = {}) {
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

  shuffleSession(sessionId, options = {}) {
    const session = this.#getSession(sessionId);
    if (session.state !== 'created') {
      throw new TarotError('SESSION_ALREADY_SHUFFLED', 'Create a new reading to shuffle again.', 409);
    }

    const includeCustom = validateShuffleOptions(options);
    const source = includeCustom ? CARD_CATALOG : CARD_CATALOG.filter(card => !card.card_id.startsWith('meta.'));
    const deck = shuffleAndOrient(source, this.randomIndex);
    session.piles = splitThreeWays(deck);
    session.state = 'split';

    return {
      session_id: session.id,
      state: session.state,
      include_custom: includeCustom,
      total_cards: deck.length,
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
