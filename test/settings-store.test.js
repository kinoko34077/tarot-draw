import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SETTINGS_STORAGE_KEY, defaultSettings, parseSavedSettings, loadSettings, saveSettings
} from '../web/settings-store.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    raw: map
  };
}

test('fresh preferences default to Deck A with both specials and no major-only filter', () => {
  const value = loadSettings(memoryStorage());
  assert.deepEqual(value, {
    deckId: 'A', majorOnly: false,
    selections: {
      A: { includeTitle: true, includeSecondary: true },
      B: { includeTitle: true, includeSecondary: true }
    }
  });
  assert.notStrictEqual(value, defaultSettings());
});

test('settings persist both decks independently and survive reload', () => {
  const store = memoryStorage();
  const values = defaultSettings();
  values.deckId = 'B';
  values.majorOnly = true;
  values.selections.A.includeTitle = false;
  values.selections.B.includeSecondary = false;
  assert.equal(saveSettings(store, values), true);
  assert.equal(store.raw.size, 1);
  assert.ok(store.raw.has(SETTINGS_STORAGE_KEY));
  const next = loadSettings(store);
  assert.deepEqual(next, values);
  next.selections.A.includeTitle = true;
  assert.equal(loadSettings(store).selections.A.includeTitle, false);
  assert.doesNotMatch(store.raw.get(SETTINGS_STORAGE_KEY), /question|sessionId|positions|reading/i);
});

test('malformed, old and malicious settings are rejected without leaking into defaults', () => {
  for (const raw of [
    '', 'garbage', '{}', '{"version":2,"deckId":"B"}',
    '{"version":1,"deckId":"X","majorOnly":false,"selections":{}}',
    '{"version":1,"deckId":"A","majorOnly":"yes","selections":{}}',
    '{"version":1,"deckId":"A","majorOnly":false,"selections":{"A":{},"B":{}}}',
    'x'.repeat(2049),
    '{"__proto__":{"polluted":true}}'
  ]) assert.equal(parseSavedSettings(raw), null, raw.slice(0, 50));
});

test('disabled storage is non-fatal and does not stop settings changes', () => {
  const blocked = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); }
  };
  assert.deepEqual(loadSettings(blocked), defaultSettings());
  assert.equal(saveSettings(blocked, defaultSettings()), false);
  assert.equal(saveSettings(null, defaultSettings()), false);
  assert.equal(saveSettings(memoryStorage(), { deckId: 'B', majorOnly: false }), false);
});

test('Node dev server serves persistence module as JavaScript', async () => {
  const { createTarotServer } = await import('../src/server.js');
  const { once } = await import('node:events');
  const server = createTarotServer();
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/settings-store.js');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.match(await response.text(), /SETTINGS_STORAGE_KEY/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
