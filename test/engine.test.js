import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_CATALOG } from '../src/cards.js';
import { shuffleAndOrient, splitThreeWays } from '../src/engine.js';

function deterministicIndex() {
  let value = 0;
  return max => {
    const result = value % max;
    value += 1;
    return result;
  };
}

test('shuffle produces one oriented instance of every card', () => {
  const deck = shuffleAndOrient(CARD_CATALOG, deterministicIndex());
  assert.equal(deck.length, 80);
  assert.equal(new Set(deck.map(card => card.card_id)).size, 80);
  assert.ok(deck.every(card => card.orientation === 'upright' || card.orientation === 'reversed'));
});

test('three-way split is 27/27/26 and preserves shuffled order inside slices', () => {
  const deck = CARD_CATALOG.map((card, index) => ({ ...card, orientation: index % 2 ? 'reversed' : 'upright' }));
  const piles = splitThreeWays(deck);
  assert.equal(piles.A.length, 27);
  assert.equal(piles.B.length, 27);
  assert.equal(piles.C.length, 26);
  assert.deepEqual(piles.A, deck.slice(0, 27));
  assert.deepEqual(piles.B, deck.slice(27, 54));
  assert.deepEqual(piles.C, deck.slice(54, 80));
});


test('78-card option excludes original slots and splits exactly 26/26/26', () => {
  const base = CARD_CATALOG.filter(card => !card.card_id.startsWith('meta.'));
  const deck = shuffleAndOrient(base, deterministicIndex());
  const piles = splitThreeWays(deck);
  assert.equal(deck.length, 78);
  assert.ok(deck.every(card => !card.card_id.startsWith('meta.')));
  assert.deepEqual(Object.values(piles).map(pile => pile.length), [26, 26, 26]);
  assert.deepEqual([...piles.A,...piles.B,...piles.C], deck);
  assert.throws(() => splitThreeWays(CARD_CATALOG.slice(0,77)), /78- or 80-card/);
});
