import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { TarotSession } from '../src/worker.js';

class FakeStorage {
  constructor() {
    this.values = new Map();
    this.alarmAt = null;
  }

  async get(key) {
    const value = this.values.get(key);
    return value === undefined ? undefined : structuredClone(value);
  }

  async put(key, value) {
    this.values.set(key, structuredClone(value));
  }

  async deleteAll() {
    this.values.clear();
    this.alarmAt = null;
  }

  async setAlarm(timestamp) {
    this.alarmAt = timestamp;
  }
}

function jsonRequest(path, method = 'POST', body, headers = {}) {
  return new Request(`https://tarot-session.internal${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

async function json(response) {
  return { status: response.status, headers: response.headers, body: await response.json() };
}

test('Durable Object persists shuffled session state across instance restart', async () => {
  const storage = new FakeStorage();
  let session = new TarotSession({ storage }, {});

  let result = await json(await session.fetch(jsonRequest('/create', 'POST', undefined, {
    'X-Tarot-Session-Id': 'session-1'
  })));
  assert.equal(result.status, 201);

  result = await json(await session.fetch(jsonRequest('/shuffle')));
  assert.deepEqual(result.body.piles.map(pile => pile.count), [27, 27, 26]);
  assert.ok(storage.alarmAt > Date.now());

  session = new TarotSession({ storage }, {});

  const branchA = await json(await session.fetch(jsonRequest('/branches', 'POST', { pile: 'A' })));
  const branchB = await json(await session.fetch(jsonRequest('/branches', 'POST', { pile: 'A' })));
  assert.equal(branchA.status, 201);
  assert.equal(branchB.status, 201);

  const localA = branchA.body.branch_id.split('~')[1];
  const localB = branchB.body.branch_id.split('~')[1];

  const drawA = await json(await session.fetch(jsonRequest('/draw', 'POST', {
    branch_id: localA,
    positions: ['r0c0', 'r0c1']
  })));
  const drawB = await json(await session.fetch(jsonRequest('/draw', 'POST', {
    branch_id: localB,
    positions: ['r0c0']
  })));

  assert.deepEqual(drawA.body.positions.r0c0, drawB.body.positions.r0c0);
  assert.equal(drawA.body.remaining, 25);
  assert.equal(drawB.body.remaining, 26);
});

test('Durable Object returns explicit insufficient-card error without crossing piles', async () => {
  const storage = new FakeStorage();
  const session = new TarotSession({ storage }, {});
  await session.fetch(jsonRequest('/create', 'POST', undefined, { 'X-Tarot-Session-Id': 'session-2' }));
  await session.fetch(jsonRequest('/shuffle'));

  const branch = await json(await session.fetch(jsonRequest('/branches', 'POST', { pile: 'C' })));
  const localBranch = branch.body.branch_id.split('~')[1];
  const positions = Array.from({ length: 27 }, (_, index) => `p${index}`);

  const draw = await json(await session.fetch(jsonRequest('/draw', 'POST', {
    branch_id: localBranch,
    positions
  })));

  assert.equal(draw.status, 409);
  assert.equal(draw.body.error.code, 'INSUFFICIENT_CARDS');
  assert.deepEqual(draw.body.error.details, { requested: 27, available: 26 });
});

class FakeNamespace {
  constructor() {
    this.objects = new Map();
  }

  idFromName(name) {
    return name;
  }

  get(id) {
    if (!this.objects.has(id)) {
      const durable = new TarotSession({ storage: new FakeStorage() }, {});
      this.objects.set(id, durable);
    }
    const durable = this.objects.get(id);
    return { fetch: request => durable.fetch(request) };
  }
}

function makeEnv({ rateLimitSuccess = true } = {}) {
  return {
    TAROT_SESSIONS: new FakeNamespace(),
    TAROT_RATE_LIMITER: {
      limit: async () => ({ success: rateLimitSuccess })
    }
  };
}

test('public Worker preserves REST flow and emits Pages CORS', async () => {
  const env = makeEnv();
  const origin = 'https://kinoko34077.github.io';

  let result = await json(await worker.fetch(new Request('https://api.example/api/sessions', {
    method: 'POST',
    headers: { Origin: origin }
  }), env));
  assert.equal(result.status, 201);
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), origin);
  const sessionId = result.body.session_id;

  result = await json(await worker.fetch(new Request(
    `https://api.example/api/sessions/${encodeURIComponent(sessionId)}/shuffle`,
    { method: 'POST', headers: { Origin: origin } }
  ), env));
  assert.deepEqual(result.body.piles.map(pile => pile.count), [27, 27, 26]);

  const branch = await json(await worker.fetch(new Request(
    `https://api.example/api/sessions/${encodeURIComponent(sessionId)}/branches`,
    {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pile: 'B' })
    }
  ), env));

  const draw = await json(await worker.fetch(new Request(
    `https://api.example/api/branches/${encodeURIComponent(branch.body.branch_id)}/draw`,
    {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions: ['r0c0'] })
    }
  ), env));

  assert.equal(draw.status, 200);
  assert.ok(draw.body.positions.r0c0.card_id);
  assert.ok(['upright', 'reversed'].includes(draw.body.positions.r0c0.orientation));
});

test('public Worker rejects unapproved browser origins and supports approved preflight', async () => {
  const env = makeEnv();

  let response = await worker.fetch(new Request('https://api.example/api/health', {
    headers: { Origin: 'https://example.invalid' }
  }), env);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);

  response = await worker.fetch(new Request('https://api.example/api/sessions', {
    method: 'OPTIONS',
    headers: { Origin: 'https://kinoko34077.github.io' }
  }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://kinoko34077.github.io');
  assert.match(response.headers.get('Access-Control-Allow-Methods'), /POST/);
});

test('public Worker returns 429 when Cloudflare rate limiter rejects request', async () => {
  const env = makeEnv({ rateLimitSuccess: false });
  const response = await json(await worker.fetch(new Request('https://api.example/api/sessions', {
    method: 'POST'
  }), env));
  assert.equal(response.status, 429);
  assert.equal(response.body.error.code, 'RATE_LIMITED');
});


test('Durable Object 78-card mode excludes meta cards and rejects invalid flags', async () => {
  const storage=new FakeStorage();
  const session=new TarotSession({storage},{});
  await session.fetch(jsonRequest('/create','POST',undefined,{'X-Tarot-Session-Id':'session-78'}));
  const bad=await json(await session.fetch(jsonRequest('/shuffle','POST',{include_custom:'no'})));
  assert.equal(bad.status,400);
  assert.equal(bad.body.error.code,'INVALID_DECK_OPTIONS');
  const split=await json(await session.fetch(jsonRequest('/shuffle','POST',{include_custom:false})));
  assert.equal(split.status,200);
  assert.equal(split.body.total_cards,78);
  assert.deepEqual(split.body.piles.map(p=>p.count),[26,26,26]);
  for(const pile of ['A','B','C']){
    const branch=await json(await session.fetch(jsonRequest('/branches','POST',{pile})));
    const draw=await json(await session.fetch(jsonRequest('/draw','POST',{
      branch_id:branch.body.branch_id.split('~')[1],
      positions:Array.from({length:26},(_,i)=>'r'+i)
    })));
    assert.ok(Object.values(draw.body.positions).every(card=>!card.card_id.startsWith('meta.')));
  }
});
