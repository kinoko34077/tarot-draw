import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createTarotServer } from '../src/server.js';
import { TarotStore } from '../src/store.js';

async function withServer(run) {
  let random = 0;
  let id = 0;
  const store = new TarotStore({
    randomIndex: max => (random++) % max,
    idFactory: () => `id-${++id}`
  });
  const server = createTarotServer({ store });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await run(base);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) }
  });
  return { response, body: await response.json() };
}

test('API creates session, split, branch and position mapping', async () => {
  await withServer(async base => {
    let result = await jsonRequest(`${base}/api/sessions`, { method: 'POST', body: '{}' });
    assert.equal(result.response.status, 201);
    const sessionId = result.body.session_id;

    result = await jsonRequest(`${base}/api/sessions/${sessionId}/shuffle`, { method: 'POST', body: '{}' });
    assert.deepEqual(result.body.piles.map(p => p.count), [27, 27, 26]);

    result = await jsonRequest(`${base}/api/sessions/${sessionId}/branches`, {
      method: 'POST', body: JSON.stringify({ pile: 'A' })
    });
    const branchId = result.body.branch_id;

    result = await jsonRequest(`${base}/api/branches/${branchId}/draw`, {
      method: 'POST', body: JSON.stringify({ positions: ['r0c0', 'r0c1'] })
    });
    assert.equal(result.response.status, 200);
    assert.deepEqual(Object.keys(result.body.positions), ['r0c0', 'r0c1']);
    assert.ok(result.body.positions.r0c0.card_id);
    assert.ok(['upright', 'reversed'].includes(result.body.positions.r0c0.orientation));
  });
});

test('API returns explicit insufficient-card error without crossing piles', async () => {
  await withServer(async base => {
    const session = await jsonRequest(`${base}/api/sessions`, { method: 'POST', body: '{}' });
    const sessionId = session.body.session_id;
    await jsonRequest(`${base}/api/sessions/${sessionId}/shuffle`, { method: 'POST', body: '{}' });
    const branch = await jsonRequest(`${base}/api/sessions/${sessionId}/branches`, {
      method: 'POST', body: JSON.stringify({ pile: 'C' })
    });
    const positions = Array.from({ length: 27 }, (_, i) => `p${i}`);
    const draw = await jsonRequest(`${base}/api/branches/${branch.body.branch_id}/draw`, {
      method: 'POST', body: JSON.stringify({ positions })
    });
    assert.equal(draw.response.status, 409);
    assert.equal(draw.body.error.code, 'INSUFFICIENT_CARDS');
    assert.deepEqual(draw.body.error.details, { requested: 27, available: 26 });
  });
});

test('same server serves the single-page reading workspace', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Tarot Draw/);
    assert.match(html, /id="copyButton"/);
    assert.match(html, /id="piles"/);
  });
});
