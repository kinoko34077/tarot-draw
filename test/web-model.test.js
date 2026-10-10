import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendAxisLabel,
  buildPositionIds,
  cardDisplayParts,
  cardDisplayText,
  customCardNotesForResults,
  formatReadingMarkdown,
  formatReadingText,
  PARALLEL_READING_NOTE,
  moveAxisLabel,
  removeAxisLabel,
  planPileDraws,
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

test('axis reorder moves exactly one whole semantic label and rejects invalid bounds', () => {
  const original = ['過去', '現在', '未来'];
  assert.deepEqual(moveAxisLabel(original, 0, 2), ['現在', '未来', '過去']);
  assert.deepEqual(moveAxisLabel(original, 2, 0), ['未来', '過去', '現在']);
  assert.deepEqual(moveAxisLabel(original, 1, 1), original);
  assert.deepEqual(moveAxisLabel(original, -1, 1), original);
  assert.deepEqual(moveAxisLabel(original, 0, 3), original);
  assert.deepEqual(original, ['過去', '現在', '未来']);
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
    { title: 'XII 吊るされた男', titleHtml: null, plainTitle: 'XII 吊るされた男', orientation: '逆位置' }
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

test('on-screen Minor Arcana ruby remains, while copied card labels omit phonetic readings', () => {
  const knight = { card_id: 'minor.wands.knight', name_ja: 'ワンドのナイト', orientation: 'reversed' };
  const parts = cardDisplayParts(knight);
  assert.equal(parts.title, '杖の騎士');
  assert.equal(parts.plainTitle, '杖（ワンド）の騎士（ナイト）');
  assert.match(parts.titleHtml, /<ruby>杖/);
  assert.match(parts.titleHtml, /<rt>ワンド<\/rt>/);
  assert.match(parts.titleHtml, /<rt>ナイト<\/rt>/);
  assert.equal(cardDisplayText(knight), '杖の騎士 逆位置');

  assert.equal(
    cardDisplayText({ card_id: 'minor.pentacles.queen', name_ja: 'ペンタクルのクイーン', orientation: 'upright' }),
    '金貨の女王 正位置'
  );
});

test('Markdown is legible 2x2 GFM, preserves orientation and conditional custom-card notes without ruby', () => {
  const primary = { positions: {
    r0c0: { card_id: 'major.sun', name_ja: '太陽', orientation: 'upright' },
    r0c1: { card_id: 'minor.wands.knight', name_ja: 'ワンドのナイト', orientation: 'reversed' },
    r1c0: { card_id: 'meta.title', orientation: 'upright' },
    r1c1: { card_id: 'major.world', name_ja: '世界', orientation: 'reversed' }
  } };
  const output = formatReadingMarkdown({
    question: 'どちらの道？',
    rowCount: 2, columnCount: 2, rowLabels: ['以前', 'これから'],
    columnLabels: ['仕事', '創作'], primary, primaryPile: 'A'
  });
  assert.match(output, /^# タロット占い結果\n\n\*\*問い：\*\* どちらの道？/);
  assert.match(output, /## メインリーディング（山A）/);
  assert.match(output, /\| 項目 \| 仕事 \| 創作 \|\n\| --- \| --- \| --- \|/);
  assert.match(output, /\| 以前 \| XIX 太陽 正位置 \| 杖の騎士 逆位置 \|/);
  assert.match(output, /\| これから \| タイトルカード 正位置 \| XXI 世界 逆位置 \|/);
  assert.match(output, /### 独自カードについて\n- タイトルカード:/);
  assert.ok(!output.includes('### パラレルリーディングについて'));
  assert.ok(!output.includes('GUARANTEE:'));
  assert.ok(!output.includes('\t'));
});

test('Markdown paired results distinguish actual and alternate pile and explain the user-defined parallel method', () => {
  const primary = { positions: { r0c0: { card_id: 'major.sun', name_ja: '太陽', orientation: 'upright' } } };
  const parallel = { positions: { r0c0: { card_id: 'meta.guarantee', orientation: 'reversed' } } };
  const data = {
    question: '進む？', rowCount: 1, columnCount: 1,
    rowLabels: ['可能性'], columnLabels: ['道A'],
    primary, parallel, primaryPile: 'A', parallelPile: 'C'
  };
  const markdown = formatReadingMarkdown(data);
  const tsv = formatReadingText(data);
  assert.match(markdown, /## メインリーディング（山A）[\s\S]*?\| 可能性 \| XIX 太陽 正位置 \|/);
  assert.match(markdown, /## パラレルリーディング（山C）[\s\S]*?\| 可能性 \| GUARANTEE 逆位置 \|/);
  assert.match(markdown, /### パラレルリーディングについて\n\n/);
  assert.ok(markdown.includes(PARALLEL_READING_NOTE));
  assert.match(markdown, /### 独自カードについて[\s\S]*- GUARANTEE:/);
  assert.match(tsv, /【Parallel】/);
  assert.match(tsv, /【パラレルリーディング説明】\n/);
  assert.ok(tsv.includes(PARALLEL_READING_NOTE));
  assert.match(tsv, /【独自カード説明】[\s\S]*GUARANTEE:/);
  assert.equal(formatReadingText({ ...data, parallel: null }).includes('【パラレルリーディング説明】'), false);
});

test('Markdown escapes user labels and question without malformed columns or injected headings', () => {
  const text = formatReadingMarkdown({
    question: '#今後 | [計画](x)\n注記',
    rowCount: 1, columnCount: 2,
    rowLabels: ['現在|未来'], columnLabels: ['方針\\比較', '**成果**\n次段'],
    primary: { positions: {
      r0c0: { card_id: 'major.sun', name_ja: '太陽', orientation: 'upright' },
      r0c1: { card_id: 'major.moon', name_ja: '月', orientation: 'reversed' }
    } }, parallel: null
  });
  assert.match(text, /\*\*問い：\*\* \\#今後 \\| \\[計画\\]/);
  const headingRow = text.split('\n').find(line => line.startsWith('| 項目'));
  assert.ok(headingRow.includes(String.raw`\*\*成果\*\*`));
  assert.ok(headingRow.includes(' / 次段 |'));
  assert.ok(headingRow.includes('方針'));
  assert.match(text, /\| 現在\\\|未来 \| XIX 太陽 正位置 \| XVIII 月 逆位置 \|/);
  assert.equal(text.split('\n').filter(line => line.startsWith('| ')).length, 3);
  assert.ok(!text.includes('【独自カード説明】'));
});

test('26, 27, 28, 53, 54, 55 and 80 cells are partitioned once in chosen pile order', () => {
  const piles = [{pile_id:'A',count:27},{pile_id:'B',count:27},{pile_id:'C',count:26}];
  const cases = [
    [26, ['C'], [26]],
    [27, ['A'], [27]],
    [28, ['C','A'], [26,2]],
    [53, ['C','A'], [26,27]],
    [54, ['A','B'], [27,27]],
    [55, ['A','B','C'], [27,27,1]],
    [80, ['A','B','C'], [27,27,26]]
  ];
  for (const [n, chosen, counts] of cases) {
    const positions = buildPositionIds(1,n);
    const batches = planPileDraws(chosen,piles,positions);
    assert.deepEqual(batches.map(b=>b.pileId),chosen, `${n} chosen order`);
    assert.deepEqual(batches.map(b=>b.positions.length),counts, `${n} exact capacity`);
    assert.deepEqual(batches.flatMap(b=>b.positions),positions, `${n} row-major positions`);
    assert.equal(new Set(batches.flatMap(b=>b.positions)).size,n);
  }
  assert.throws(()=>planPileDraws(['A'],piles,buildPositionIds(1,28)),/More piles/);
  assert.throws(()=>planPileDraws(['A','A'],piles,buildPositionIds(1,28)),/repeat/);
  assert.throws(()=>planPileDraws(['A','B','C'],piles,buildPositionIds(1,81)),/Invalid pile selection/);
});


test('Deck A introduction custom replaces Deck B guarantee only in display/notes/export', () => {
  const intro={card_id:'meta.introduction',name_ja:'パメラ・コールマン・スミス紹介カード',orientation:'upright'};
  const guarantee={card_id:'meta.guarantee',name_ja:'GUARANTEE（保証カード）',orientation:'upright'};
  const result={positions:{r0c0:intro}};
  assert.equal(cardDisplayParts(intro,'A').plainTitle,'パメラ・コールマン・スミス紹介カード');
  assert.equal(cardDisplayText(guarantee,'B'),'GUARANTEE 正位置');
  assert.equal(cardDisplayText(intro,'A'),'パメラ・コールマン・スミス紹介カード 正位置');
  assert.ok(customCardNotesForResults(result,null,'A')[0].includes('生涯'));
  assert.ok(!customCardNotesForResults(result,null,'A')[0].includes('GUARANTEE'));
  const markdown=formatReadingMarkdown({
    deckId:'A',rowCount:1,columnCount:1,rowLabels:['項'],columnLabels:['題'],primary:result
  });
  assert.match(markdown,/パメラ・コールマン・スミス紹介カード/);
  assert.doesNotMatch(markdown,/GUARANTEE/);
});
