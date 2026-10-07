import { randomInt } from 'node:crypto';
import { CARD_CATALOG } from './cards.js';

export const ORIENTATIONS = Object.freeze(['upright', 'reversed']);
export const PILE_IDS = Object.freeze(['A', 'B', 'C']);
export const PILE_SIZES = Object.freeze({ A: 27, B: 27, C: 26 });

export function secureRandomIndex(maxExclusive) {
  return randomInt(maxExclusive);
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
  if (!Array.isArray(deck) || deck.length !== 80) {
    throw new TypeError('Expected an 80-card shuffled deck.');
  }

  return Object.freeze({
    A: Object.freeze(deck.slice(0, 27)),
    B: Object.freeze(deck.slice(27, 54)),
    C: Object.freeze(deck.slice(54, 80))
  });
}
