import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { historyImportOutcome } from '../web/history-import-outcome.js';
import { saveHistoryRecords } from '../web/reading-history.js';

test('#130 denied localStorage never announces durable save and preserves source input', () => {
  const denied = { setItem() { throw Error('QuotaExceededError'); } };
  const saved = saveHistoryRecords(denied, [{id:'demo'}]);
  assert.equal(saved, false);
  const feedback = historyImportOutcome(saved);
  assert.equal(feedback.clearInput, false);
  assert.match(feedback.message, /保存できませんでした/);
  assert.doesNotMatch(feedback.message, /このブラウザに保存しました/);
});

test('#130 successful storage can acknowledge and clear the pasted source', () => {
  const storage = { setItem(_key, value) { this.value = value; }, value: '' };
  const saved = saveHistoryRecords(storage, [{id:'demo'}]);
  assert.equal(saved, true);
  assert.equal(JSON.parse(storage.value)[0].id, 'demo');
  assert.deepEqual(historyImportOutcome(saved), {
    clearInput: true, message: '読み込みました。このブラウザに保存しました。'
  });
});

test('#130 the import action consumes the return receipt instead of unconditional success', async () => {
  const source = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');
  assert.match(source, /return \{ entry, saved \};/);
  assert.match(source, /const \{ saved \} = recordHistory\(page\.loadReadingText\.value\)/);
  assert.match(source, /if \(outcome\.clearInput\) page\.loadReadingText\.value=''/);
});
