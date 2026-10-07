import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPositionIds, formatReadingText } from '../web/model.js';

test('position IDs are row-major and opaque to API semantics', () => {
  assert.deepEqual(buildPositionIds(2, 3), ['r0c0', 'r0c1', 'r0c2', 'r1c0', 'r1c1', 'r1c2']);
});

test('bulk copy includes branch, labels, card and orientation only', () => {
  const result = {
    positions: {
      r0c0: { card_id: 'major.hermit', name_ja: '隠者', orientation: 'upright' },
      r0c1: { card_id: 'major.star', name_ja: '星', orientation: 'reversed' }
    }
  };
  const text = formatReadingText({
    rowCount: 1,
    columnCount: 2,
    rowLabels: ['仕事'],
    columnLabels: ['過去', '未来'],
    primary: result,
    parallel: null
  });
  assert.equal(text, '【Primary】\n仕事 / 過去: 隠者（正位置）\n仕事 / 未来: 星（逆位置）');
  assert.doesNotMatch(text, /card_id|major\.|session|meaning|解釈/);
});

test('bulk copy uses deterministic fallback labels when labels are empty', () => {
  const result = { positions: { r0c0: { name_ja: '愚者', orientation: 'upright' } } };
  assert.equal(
    formatReadingText({ rowCount: 1, columnCount: 1, rowLabels: [''], columnLabels: [''], primary: result, parallel: null }),
    '【Primary】\n行1 / 列1: 愚者（正位置）'
  );
});
