import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_DETAILS } from '../web/card-details.js';
import { deckASpecialInterpretation } from '../web/deck-a-special-interpretations.js';
import { meaningPoints } from '../web/meaning-points.js';

test('all standard 78x3 meanings split into readable clauses without losing a single original character', () => {
  assert.equal(Object.keys(CARD_DETAILS).length, 78);
  let count = 0, multi = 0;
  for (const [cardId, detail] of Object.entries(CARD_DETAILS)) {
    for (const key of ['essence', 'upright', 'reversed']) {
      const points = meaningPoints(detail[key]);
      assert.ok(points.length >= 1, cardId + ':' + key);
      assert.equal(points.map(p => p.text + p.punctuation).join(''), detail[key], cardId + ':' + key);
      assert.ok(points.every(p => p.text.trim() && !/[、。]$/.test(p.text)), cardId + ':' + key);
      count += 1;
      if (points.length > 1) multi += 1;
    }
  }
  assert.equal(count, 234);
  assert.ok(multi > 150, 'the majority of run-on descriptions should become short bullets');
});
test('Deck A special authored meanings remain unchanged with exact source reconstructability', () => {
  for (const id of ['meta.title', 'meta.introduction']) {
    const detail = deckASpecialInterpretation(id, 'A');
    for (const kind of ['essence','upright','reversed']) {
      assert.equal(meaningPoints(detail[kind]).map(p => p.text + p.punctuation).join(''), detail[kind]);
    }
  }
});
test('segmentation does not create invented content from empty/invalid input', () => {
  assert.deepEqual(meaningPoints(''),[]);
  assert.deepEqual(meaningPoints(null),[]);
  assert.deepEqual(meaningPoints('短い一節'),[{text:'短い一節',punctuation:''}]);
});
