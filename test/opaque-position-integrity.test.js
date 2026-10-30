import test from 'node:test';
import assert from 'node:assert/strict';
import { TarotStore } from '../src/store.js';
import { TarotSession } from '../src/worker.js';

const IDS = ['__proto__', 'constructor', 'toString'];

function assertOpaqueDrawOutput(result, totalBefore) {
  const serialized = JSON.parse(JSON.stringify(result));
  const positions = serialized.positions;
  assert.deepEqual(Object.keys(positions), IDS);
  for (const id of IDS) {
    assert.equal(Object.hasOwn(positions, id), true, id + ' must survive JSON output');
    assert.equal(typeof positions[id].card_id, 'string');
    assert.ok(['upright', 'reversed'].includes(positions[id].orientation));
  }
  assert.equal(serialized.remaining, totalBefore - IDS.length);
}

test('Node draw preserves reserved-looking opaque position IDs in serialized results', () => {
  const store = new TarotStore({ randomIndex: () => 0 });
  const { session_id } = store.createSession();
  store.shuffleSession(session_id);
  const { branch_id } = store.createBranch(session_id, 'A');
  assertOpaqueDrawOutput(store.draw(branch_id, IDS), 27);
});

class FakeStorage {
  constructor() { this.data = new Map(); }
  async get(k) { return structuredClone(this.data.get(k)); }
  async put(k, v) { this.data.set(k, structuredClone(v)); }
  async deleteAll() { this.data.clear(); }
  async setAlarm() {}
}

function request(path, method = 'POST', payload, headers = {}) {
  return new Request('https://tarot-session.internal' + path, {
    method,
    headers: { ...headers, ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
  });
}

test('Durable Object draw preserves reserved-looking opaque position IDs in JSON response', async () => {
  const session = new TarotSession({ storage: new FakeStorage() }, {});
  assert.equal((await session.fetch(request('/create', 'POST', undefined, {
    'X-Tarot-Session-Id': 'synthetic-session'
  }))).status, 201);
  assert.equal((await session.fetch(request('/shuffle'))).status, 200);
  const branchResponse = await session.fetch(request('/branches', 'POST', { pile: 'A' }));
  assert.equal(branchResponse.status, 201);
  const { branch_id } = await branchResponse.json();
  const local = branch_id.split('~')[1];
  const response = await session.fetch(request('/draw', 'POST', {
    branch_id: local, positions: IDS
  }));
  assert.equal(response.status, 200);
  assertOpaqueDrawOutput(await response.json(), 27);
});
