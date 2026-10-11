import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_CATALOG, CARD_COUNT } from '../src/cards.js';

test('catalog contains exactly 80 unique cards including Title and GUARANTEE', () => {
  assert.equal(CARD_COUNT, 80);
  assert.equal(new Set(CARD_CATALOG.map(card => card.card_id)).size, 80);
  assert.equal(CARD_CATALOG[0].card_id, 'meta.title');
  assert.equal(CARD_CATALOG.find(card => card.card_id === 'meta.guarantee')?.symbolic_number, 23);
  assert.equal(CARD_CATALOG.filter(card => card.arcana === 'major').length, 22);
  assert.equal(CARD_CATALOG.filter(card => card.arcana === 'minor').length, 56);
});

test('user-defined special numbers are 22 title and 23 introduction/guarantee', async ()=>{
  const {cardsForDeck}=await import('../src/cards.js');
  for(const id of ['A','B']){
    const cards=cardsForDeck(id,{includeTitle:true,includeSecondary:true,majorOnly:true});
    const title=cards.find(c=>c.card_id==='meta.title');
    const last=cards.find(c=>c.card_id==='meta.'+(id==='A'?'introduction':'guarantee'));
    assert.equal(title.symbolic_number,22);
    assert.equal(last.symbolic_number,23);
  }
});
