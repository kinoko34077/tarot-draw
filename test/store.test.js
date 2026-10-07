import test from 'node:test';
import assert from 'node:assert/strict';
import { TarotStore } from '../src/store.js';

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
