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

test('same server serves the append-only workspace and self-hosted WebP assets', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Tarot Draw/);
    assert.match(html, /id="readings"/);
    assert.match(html, /id="newReadingButton"/);
    assert.match(html, /id="axisMenu"/);

    const csp = response.headers.get('content-security-policy') ?? '';
    assert.match(csp, /img-src 'self' data:;/);
    assert.doesNotMatch(csp, /commons\.wikimedia\.org|thumb\.wikimedia\.org|upload\.wikimedia\.org/);

    const [grid, detail] = await Promise.all([
      fetch(`${base}/assets/cards/grid/major-fool.webp`),
      fetch(`${base}/assets/cards/detail/major-fool.webp`)
    ]);
    assert.equal(grid.status, 200);
    assert.equal(detail.status, 200);
    assert.match(grid.headers.get('content-type') ?? '', /image\/webp/);
    assert.match(detail.headers.get('content-type') ?? '', /image\/webp/);
    assert.match(grid.headers.get('cache-control') ?? '', /immutable/);
    assert.ok((await grid.arrayBuffer()).byteLength <= 24 * 1024);
    assert.ok((await detail.arrayBuffer()).byteLength <= 56 * 1024);
  });
});


test('local server exposes runtime configuration modules', async () => {
  await withServer(async base => {
    const [configResponse, runtimeResponse] = await Promise.all([
      fetch(`${base}/config.js`),
      fetch(`${base}/runtime-config.js`)
    ]);
    assert.equal(configResponse.status, 200);
    assert.equal(runtimeResponse.status, 200);
    assert.match(await configResponse.text(), /same-origin/);
    assert.match(await runtimeResponse.text(), /resolveRuntimeConfig/);
  });
});

test('local server serves generated static ruby module without external image assets', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/card-name-ruby.js`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/javascript/);
    const content = await response.text();
    assert.match(content, /MINOR_CARD_DISPLAY/);
    assert.match(content, /aozora-wasm 0\.5\.0/);
  });
});

test('local server serves the complete two-module 78-card keyword corpus', async () => {
  await withServer(async base => {
    const [app, keywords, corpus] = await Promise.all([
      fetch(`${base}/app.js`),
      fetch(`${base}/card-keyword-grid.js`),
      fetch(`${base}/card-keyword-corpus.js`)
    ]);
    assert.equal(app.status, 200);
    assert.equal(keywords.status, 200);
    assert.equal(corpus.status, 200);
    assert.ok((keywords.headers.get('content-type') ?? '').includes('text/javascript'));
    assert.ok((corpus.headers.get('content-type') ?? '').includes('text/javascript'));
    assert.ok((await app.text()).includes("from './card-keyword-grid.js'"));
    const entry = await keywords.text();
    assert.ok(entry.includes("from './card-keyword-corpus.js'"));
    assert.ok(entry.includes('CARD_KEYWORD_GRIDS'));
    assert.ok(entry.includes('keywordGridDraft'));
    const expansion = await corpus.text();
    assert.ok(expansion.includes('REMAINING_KEYWORD_GRIDS'));
    assert.ok(expansion.includes("'major.magician'"));
    assert.ok(expansion.includes("'minor.pentacles.king'"));
  });
});


test('HTTP API supports 78-only shuffle and rejects wrong option types', async () => {
  await withServer(async base => {
    const session = await jsonRequest(base+'/api/sessions',{method:'POST',body:'{}'});
    const id = session.body.session_id;
    const invalid = await jsonRequest(base+'/api/sessions/'+id+'/shuffle',{
      method:'POST', body:JSON.stringify({include_custom:'false'})
    });
    assert.equal(invalid.response.status,400);
    assert.equal(invalid.body.error.code,'INVALID_DECK_OPTIONS');
    const valid=await jsonRequest(base+'/api/sessions/'+id+'/shuffle',{
      method:'POST', body:JSON.stringify({include_custom:false})
    });
    assert.equal(valid.response.status,200);
    assert.deepEqual(valid.body.piles.map(p=>p.count),[26,26,26]);
    assert.equal(valid.body.total_cards,78);
  });
});
