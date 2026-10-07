import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPositionIds, cardDisplayText, formatReadingText } from '../web/model.js';

test('position IDs are row-major and opaque to API semantics', () => {
  assert.deepEqual(buildPositionIds(2, 3), ['r0c0', 'r0c1', 'r0c2', 'r1c0', 'r1c1', 'r1c2']);
});

test('card display text is compact and uses major roman numerals where available', () => {
  assert.equal(
    cardDisplayText({ card_id: 'major.hanged-man', name_ja: '吊るされた男', orientation: 'reversed' }),
    'XII 吊るされた男 逆位置'
  );
  assert.equal(
    cardDisplayText({ card_id: 'meta.guarantee', name_ja: 'GUARANTEE（保証カード）', orientation: 'upright' }),
    'GUARANTEE 正位置'
  );
  assert.equal(
    cardDisplayText({ card_id: 'minor.cups.2', name_ja: 'カップの2', orientation: 'upright' }),
    'カップの2 正位置'
  );
});

test('bulk copy preserves matrix geometry as TSV', () => {
  const result = {
    positions: {
      r0c0: { card_id: 'major.hanged-man', name_ja: '吊るされた男', orientation: 'reversed' },
      r0c1: { card_id: 'major.moon', name_ja: '月', orientation: 'reversed' },
      r1c0: { card_id: 'meta.title', name_ja: 'タイトルカード', orientation: 'reversed' },
      r1c1: { card_id: 'major.tower', name_ja: '塔', orientation: 'upright' }
    }
  };

  const text = formatReadingText({
    rowCount: 2,
    columnCount: 2,
    rowLabels: ['優先度 (上段)', '現状 (中段)'],
    columnLabels: ['開発系', '行政書士勉強'],
    primary: result,
    parallel: null
  });

  assert.equal(
    text,
    '【Primary】\n\t開発系\t行政書士勉強\n優先度 (上段)\tXII 吊るされた男 逆位置\tXVIII 月 逆位置\n現状 (中段)\tタイトルカード 逆位置\tXVI 塔 正位置'
  );
  assert.doesNotMatch(text, /card_id|major.|session|meaning|解釈/);
});

test('bulk copy supports the user-facing 3x6 table shape without flattening', () => {
  const positions = {};
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      positions[`r${row}c${column}`] = {
        card_id: 'major.hermit',
        name_ja: '隠者',
        orientation: row === 0 ? 'reversed' : 'upright'
      };
    }
  }

  const text = formatReadingText({
    rowCount: 3,
    columnCount: 6,
    rowLabels: ['優先度 (上段)', '現状 (中段)', '付き合い方 (下段)'],
    columnLabels: ['開発系', '行政書士勉強', '語学勉強', '作品作る系', 'それ以外', 'アドバイスカード'],
    primary: { positions },
    parallel: null
  });

  const lines = text.split('\n');
  assert.equal(lines.length, 5);
  assert.equal(lines[1].split('\t').length, 7);
  assert.equal(lines[2].split('\t').length, 7);
  assert.equal(lines[4].split('\t').length, 7);
});

test('bulk copy uses deterministic fallback labels when labels are empty', () => {
  const result = { positions: { r0c0: { card_id: 'major.fool', name_ja: '愚者', orientation: 'upright' } } };
  assert.equal(
    formatReadingText({
      rowCount: 1,
      columnCount: 1,
      rowLabels: [''],
      columnLabels: [''],
      primary: result,
      parallel: null
    }),
    '【Primary】\n\t列1\n行1\t0 愚者 正位置'
  );
});
