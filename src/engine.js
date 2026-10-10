import { CARD_CATALOG } from './cards.js';

export const ORIENTATIONS = Object.freeze(['upright', 'reversed']);
export const PILE_IDS = Object.freeze(['A', 'B', 'C']);
export const PILE_SIZES = Object.freeze({ A: 27, B: 27, C: 26 });

export function secureRandomIndex(maxExclusive) {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x100000000) {
    throw new RangeError('maxExclusive must be an integer between 1 and 2^32.');
  }

  const range = 0x100000000;
  const limit = range - (range % maxExclusive);
  const value = new Uint32Array(1);

  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);

  return value[0] % maxExclusive;
}

export function shuffleAndOrient(catalog = CARD_CATALOG, randomIndex = secureRandomIndex) {
  const deck = catalog.map(card => ({
    ...card,
    orientation: randomIndex(2) === 0 ? 'upright' : 'reversed'
  }));

  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck.map(card => Object.freeze(card));
}

export function splitThreeWays(deck) {
  if (!Array.isArray(deck) || (deck.length !== 80 && deck.length !== 78)) {
    throw new TypeError('Expected a shuffled 78- or 80-card deck.');
  }
  const first = deck.length === 80 ? 27 : 26;
  const second = first * 2;
  return Object.freeze({
    A: Object.freeze(deck.slice(0, first)),
    B: Object.freeze(deck.slice(first, second)),
    C: Object.freeze(deck.slice(second))
  });
}
