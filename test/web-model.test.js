import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendAxisLabel,
  buildPositionIds,
  cardDisplayParts,
  cardDisplayText,
  customCardNotesForResults,
  formatReadingText,
  removeAxisLabel,
  rwsImageUrl
} from '../web/model.js';

test('position IDs are row-major and opaque to API semantics', () => {
  assert.deepEqual(buildPositionIds(2, 3), ['r0c0', 'r0c1', 'r0c2', 'r1c0', 'r1c1', 'r1c2']);
});

test('axis helpers append and remove without destroying unaffected labels', () => {
  assert.deepEqual(appendAxisLabel(['A', 'B']), ['A', 'B', '']);
  assert.deepEqual(removeAxisLabel(['A', 'B', 'C'], 1), ['A', 'C']);
  assert.deepEqual(removeAxisLabel(['only'], 0), ['only']);
  assert.deepEqual(removeAxisLabel(['A', 'B'], 99), ['A', 'B']);
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
});

test('card display parts separate title and orientation for visual rendering', () => {
  assert.deepEqual(
    cardDisplayParts({ card_id: 'major.hanged-man', name_ja: '吊るされた男', orientation: 'reversed' }),
    { title: 'XII 吊るされた男', orientation: '逆位置' }
  );
});

test('RWS image URLs use self-hosted WebP assets and omit custom cards', () => {
  assert.equal(
    rwsImageUrl({ card_id: 'meta.title', name_en: 'Title Card' }),
    null
  );
  assert.equal(
    rwsImageUrl({ card_id: 'major.fool', name_en: 'The Fool' }),
    './assets/cards/grid/major-fool.webp'
  );
  assert.equal(
    rwsImageUrl({ card_id: 'major.fool', name_en: 'The Fool' }, 224),
    './assets/cards/detail/major-fool.webp'
  );
  assert.equal(
    rwsImageUrl({ card_id: 'minor.pentacles.ace', name_en: 'Ace of Pentacles' }),
    './assets/cards/grid/minor-pentacles-ace.webp'
  );
  assert.equal(
    rwsImageUrl({ card_id: 'minor.swords.ace', name_en: 'Ace of Swords' }),
    './assets/cards/grid/minor-swords-ace.webp'
  );
});

test('custom-card notes include only custom cards that occurred', () => {
  const title = { positions: { r0c0: { card_id: 'meta.title' } } };
  const normal = { positions: { r0c0: { card_id: 'major.sun' } } };
  assert.deepEqual(customCardNotesForResults(normal), []);
  assert.deepEqual(customCardNotesForResults(title), [
    'タイトルカード: 愚者（0）より前に位置づける独自カード。正位置・逆位置あり。'
  ]);
});

test('bulk copy starts with question, preserves TSV geometry, and appends custom notes', () => {
  const result = {
    positions: {
      r0c0: { card_id: 'major.hanged-man', name_ja: '吊るされた男', orientation: 'reversed' },
      r0c1: { card_id: 'meta.guarantee', name_ja: 'GUARANTEE（保証カード）', orientation: 'upright' },
      r1c0: { card_id: 'meta.title', name_ja: 'タイトルカード', orientation: 'reversed' },
      r1c1: { card_id: 'major.tower', name_ja: '塔', orientation: 'upright' }
    }
  };

  const text = formatReadingText({
    question: '今後の活動をどう進める？',
    rowCount: 2,
    columnCount: 2,
    rowLabels: ['優先度', '現状'],
    columnLabels: ['開発', '作品'],
    primary: result,
    parallel: null
  });

  assert.match(text, /^Q\. 今後の活動をどう進める？\n\n【Primary】/);
  assert.match(text, /\t開発\t作品/);
  assert.match(text, /優先度\tXII 吊るされた男 逆位置\tGUARANTEE 正位置/);
  assert.match(text, /【独自カード説明】/);
  assert.match(text, /タイトルカード: 愚者（0）より前/);
  assert.match(text, /GUARANTEE: 世界（XXI）の後、22に対応づける/);
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
    question: '活動の優先順位は？',
    rowCount: 3,
    columnCount: 6,
    rowLabels: ['優先度 (上段)', '現状 (中段)', '付き合い方 (下段)'],
    columnLabels: ['開発系', '行政書士勉強', '語学勉強', '作品作る系', 'それ以外', 'アドバイスカード'],
    primary: { positions },
    parallel: null
  });

  const lines = text.split('\n');
  assert.equal(lines[0], 'Q. 活動の優先順位は？');
  assert.equal(lines[3].split('\t').length, 7);
  assert.equal(lines[4].split('\t').length, 7);
  assert.equal(lines[6].split('\t').length, 7);
});
