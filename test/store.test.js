import test from 'node:test';
import assert from 'node:assert/strict';
import { TarotStore } from '../src/store.js';
import { buildPositionIds, planPileDraws } from '../web/model.js';

function makeStore() {
  let random = 0;
  let id = 0;
  return new TarotStore({
    randomIndex: max => (random++) % max,
    idFactory: () => `id-${++id}`
  });
}

test('branches share split ancestry but isolate consumption state', () => {
  const store = makeStore();
  const session = store.createSession();
  store.shuffleSession(session.session_id);
  const primary = store.createBranch(session.session_id, 'A');
  const parallel = store.createBranch(session.session_id, 'B');

  const first = store.draw(primary.branch_id, ['r0c0', 'r0c1']);
  const second = store.draw(parallel.branch_id, ['r0c0', 'r0c1']);
  assert.equal(first.remaining, 25);
  assert.equal(second.remaining, 25);

  const primaryNext = store.draw(primary.branch_id, ['r1c0']);
  assert.equal(primaryNext.remaining, 24);
  assert.equal(second.remaining, 25);
});

test('two branches from the same pile start from the same immutable snapshot', () => {
  const store = makeStore();
  const session = store.createSession();
  store.shuffleSession(session.session_id);
  const a = store.createBranch(session.session_id, 'A');
  const b = store.createBranch(session.session_id, 'A');
  const drawA = store.draw(a.branch_id, ['x']);
  const drawB = store.draw(b.branch_id, ['x']);
  assert.deepEqual(drawA.positions.x, drawB.positions.x);
});

test('draw rejects duplicate positions and insufficient cards explicitly', () => {
  const store = makeStore();
  const session = store.createSession();
  store.shuffleSession(session.session_id);
  const branch = store.createBranch(session.session_id, 'C');

  assert.throws(() => store.draw(branch.branch_id, ['x', 'x']), error => error.code === 'INVALID_POSITIONS');
  const positions = Array.from({ length: 27 }, (_, i) => `p${i}`);
  assert.throws(
    () => store.draw(branch.branch_id, positions),
    error => error.code === 'INSUFFICIENT_CARDS' && error.details.available === 26
  );
});

test('orientation stays attached to the shuffled card across draws', () => {
  const store = makeStore();
  const session = store.createSession();
  store.shuffleSession(session.session_id);
  const a = store.createBranch(session.session_id, 'A');
  const b = store.createBranch(session.session_id, 'A');
  const first = store.draw(a.branch_id, ['one']).positions.one;
  const replay = store.draw(b.branch_id, ['one']).positions.one;
  assert.equal(first.card_id, replay.card_id);
  assert.equal(first.orientation, replay.orientation);
});

test('80-card user-selected multi-pile plan consumes each oriented card exactly once', () => {
  const store = makeStore();
  const session = store.createSession();
  const split = store.shuffleSession(session.session_id);
  const positions = buildPositionIds(4,20);
  const plan = planPileDraws(['A','B','C'], split.piles, positions);
  const resolved = {};
  for (const part of plan) {
    const branch = store.createBranch(session.session_id, part.pileId);
    const batch = store.draw(branch.branch_id, part.positions);
    assert.equal(batch.remaining, 0);
    Object.assign(resolved, batch.positions);
  }
  assert.deepEqual(Object.keys(resolved), positions);
  assert.equal(new Set(Object.values(resolved).map(card => card.card_id)).size, 80);
  assert.ok(Object.values(resolved).every(card =>
    card.orientation === 'upright' || card.orientation === 'reversed'));
});


test('78-card session has no original cards and preserves optional second branch', () => {
  const store = makeStore();
  const session = store.createSession();
  assert.throws(() => store.shuffleSession(session.session_id, { include_custom: 'false' }),
    error => error.code === 'INVALID_DECK_OPTIONS');
  const split = store.shuffleSession(session.session_id, { include_custom:false });
  assert.equal(split.total_cards,78);
  assert.equal(split.include_custom,false);
  assert.deepEqual(split.piles.map(p=>p.count),[26,26,26]);
  const primary = store.createBranch(session.session_id,'A');
  const parallel = store.createBranch(session.session_id,'B');
  const positions = Array.from({length:26},(_,i)=>'p'+i);
  for (const branch of [primary,parallel]) {
    const result = store.draw(branch.branch_id,positions);
    assert.equal(Object.keys(result.positions).length,26);
    assert.ok(Object.values(result.positions).every(card=>!card.card_id.startsWith('meta.')));
  }
  const session80=store.createSession();
  const legacy=store.shuffleSession(session80.session_id);
  assert.deepEqual(legacy.piles.map(p=>p.count),[27,27,26]);
});


test('A and B represent physically distinct second special cards at the server boundary', () => {
  for (const [deckId,expected,excluded] of [
    ['A','meta.introduction','meta.guarantee'],['B','meta.guarantee','meta.introduction']
  ]) {
    const store=makeStore();
    const session=store.createSession();
    const split=store.shuffleSession(session.session_id,{include_custom:true,deck_id:deckId});
    assert.equal(split.deck_id,deckId);
    assert.equal(split.total_cards,80);
    const ids=[];
    for (const {pile_id,count} of split.piles) {
      const branch=store.createBranch(session.session_id,pile_id);
      const result=store.draw(branch.branch_id,Array.from({length:count},(_,i)=>'r'+i));
      ids.push(...Object.values(result.positions).map(card=>card.card_id));
    }
    assert.equal(ids.filter(id=>id===expected).length,1);
    assert.equal(ids.includes(excluded),false);
    assert.equal(new Set(ids).size,80);
  }
});


test('independent 79-card toggles are server-authored and never draw the other original', () => {
  for (const [options, expected] of [
    [{ deck_id:'A', include_title:true, include_secondary:false }, 'meta.title'],
    [{ deck_id:'A', include_title:false, include_secondary:true }, 'meta.introduction'],
    [{ deck_id:'B', include_title:false, include_secondary:true }, 'meta.guarantee']
  ]) {
    const store = makeStore();
    const created = store.createSession();
    const shuffled = store.shuffleSession(created.session_id, options);
    assert.equal(shuffled.total_cards, 79);
    assert.deepEqual(shuffled.piles.map(p => p.count), [27,26,26]);
    const found = [];
    for (const pile of shuffled.piles) {
      const branch = store.createBranch(created.session_id, pile.pile_id);
      const drawn = store.draw(branch.branch_id, Array.from({length:pile.count},(_,i)=>'r'+i));
      found.push(...Object.values(drawn.positions).map(card=>card.card_id));
    }
    assert.equal(found.filter(id=>id.startsWith('meta.')).length,1);
    assert.equal(found.filter(id=>id===expected).length,1);
    assert.equal(new Set(found).size,79);
  }
});

test('shuffle rejects invalid individual original-card settings without freezing session', () => {
  const store = makeStore(), session=store.createSession();
  assert.throws(()=>store.shuffleSession(session.session_id,{include_title:'yes'}), e=>e.code==='INVALID_DECK_OPTIONS');
  const shuffled=store.shuffleSession(session.session_id,{include_title:false,include_secondary:false});
  assert.deepEqual(shuffled.piles.map(p=>p.count),[26,26,26]);
  assert.equal(shuffled.total_cards,78);
});
