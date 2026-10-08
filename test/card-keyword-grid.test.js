import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CARD_CATALOG } from '../src/cards.js';
import { CARD_KEYWORD_GRIDS, KEYWORD_GRID_DRAFTS, keywordGridDraft } from '../web/card-keyword-grid.js';

const specimenIds = [
  'major.fool', 'major.death', 'major.devil',
  'minor.swords.3', 'minor.cups.ace'
];

test('issue #26 sources all 78 standard cards exactly once; custom cards excluded', () => {
  assert.deepEqual(Object.keys(KEYWORD_GRID_DRAFTS).sort(), [...specimenIds].sort());
  const standard = CARD_CATALOG.filter(card => card.arcana !== 'meta');
  assert.equal(standard.length, 78);
  assert.equal(Object.keys(CARD_KEYWORD_GRIDS).length, 78);
  assert.deepEqual(
    Object.keys(CARD_KEYWORD_GRIDS).sort(),
    standard.map(card => card.card_id).sort()
  );
  assert.equal(Object.keys(CARD_KEYWORD_GRIDS).filter(id => id.startsWith('major.')).length, 22);
  assert.equal(Object.keys(CARD_KEYWORD_GRIDS).filter(id => id.startsWith('minor.')).length, 56);
  assert.equal(keywordGridDraft('meta.title'), null);
  assert.equal(keywordGridDraft('meta.guarantee'), null);
  assert.equal(keywordGridDraft('__proto__'), null);
  assert.equal(keywordGridDraft('constructor'), null);
});

test('every standard card has five readable independent headings with four unique terms', () => {
  let threeOrFewer = 0;
  let checkedLabels = 0;
  const countLength = label => {
    const chars = [...label].length;
    checkedLabels++;
    if (chars <= 3) threeOrFewer++;
    assert.ok(!label.includes(' '), `keyword has a space: ${label}`);
  };
  for (const { card_id: cardId, arcana } of CARD_CATALOG.filter(card => card.arcana !== 'meta')) {
    const groups = keywordGridDraft(cardId);
    assert.ok(groups, cardId);
    assert.equal(groups.length, 5, cardId);
    const headings = groups.map(group => group.heading);
    assert.equal(new Set(headings).size, 5, cardId);
    const allTerms = [];
    for (const group of groups) {
      assert.ok(group.heading.trim());
      assert.equal(group.heading, group.heading.trim(), cardId + ': heading whitespace');
      assert.ok([...group.heading].length >= 2 && [...group.heading].length <= 6, cardId + ': heading must be 2–6 characters');
      countLength(group.heading);
      assert.equal(group.terms.length, 4, cardId + ':' + group.heading);
      for (const term of group.terms) {
        assert.ok(term.trim().length > 0, cardId + ': empty term');
        assert.equal(term, term.trim(), cardId + ': term whitespace');
        assert.ok([...term].length >= 2 && [...term].length <= 6, cardId + ': term must be 2–6 characters ' + term);
        countLength(term);
        assert.ok(!/[\r\n\t]/.test(term), cardId + ': control whitespace');
        assert.notEqual(term, group.heading, cardId + ': term duplicates heading');
        allTerms.push(term);
      }
    }
    assert.equal(new Set(allTerms).size, 20, cardId + ': duplicated terms across columns');
    assert.ok(arcana === 'major' || arcana === 'minor');
  }
  assert.equal(checkedLabels, 1950, '78 cards x (5 headings + 20 terms)');
  assert.ok(threeOrFewer / checkedLabels >= 0.95, 'at least 95% of labels should be 2–3 characters');
});

test('lookup supplies a defensive copy and does not invent unknown data', () => {
  assert.equal(keywordGridDraft('major.nonexistent'), null);
  const first = keywordGridDraft('major.fool');
  first[0].terms[0] = 'mutated';
  first[0].heading = 'changed';
  assert.notEqual(keywordGridDraft('major.fool')[0].terms[0], 'mutated');
  assert.notEqual(keywordGridDraft('major.fool')[0].heading, 'changed');
});

test('prototype is browser text, keeps RWS artwork and puts explanations below the grid', async () => {
  const [html, app, css, notice] = await Promise.all([
    readFile(new URL('../web/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../web/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../web/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../docs/third-party/TAROTOO-LICENSE.txt', import.meta.url), 'utf8')
  ]);
  assert.ok(html.includes('id="cardDetailVisual"'));
  assert.ok(html.includes('id="cardDetailKeywordGrid"'));
  assert.ok(html.indexOf('id="cardDetailVisual"') < html.indexOf('id="cardDetailKeywordGrid"'));
  assert.ok(html.indexOf('id="cardDetailKeywordGrid"') < html.indexOf('class="card-detail-copy"'));
  assert.ok(html.includes('id="cardDetailKeywordRows"'));
  assert.ok(html.includes('id="cardDetailSourceInfo"'));
  assert.ok(html.includes('class="keyword-grid-note"'));
  assert.ok(html.includes('正位置・逆位置の両面を含む'));
  assert.ok(html.includes('Tarotooのデータ・ライセンス'));
  assert.ok(css.includes('.keyword-grid-rows'));
  assert.ok(css.includes('grid-template-columns: repeat(4, minmax(0, 1fr))'));
  assert.ok(css.includes('overflow-x: clip'));
  assert.ok(css.includes('height: min(94dvh, 960px)'));
  assert.ok(css.includes('width: 190px;'));
  assert.ok(css.includes('width: 146px;'));
  assert.ok(css.includes('#cardDetailEssence'));
  assert.ok(css.includes('font-size: .98rem'));
  assert.ok(css.includes('grid-column: 1 / -1'));
  assert.ok(!css.includes('.keyword-grid-columns'));
  assert.ok(!app.includes('keyword-grid-source'));
  assert.ok(app.includes("rows.append(group)"));
  assert.ok(app.includes("item.textContent = term"));
  assert.ok(app.includes("label.textContent = heading"));
  assert.ok(app.includes("renderKeywordGrid(detail ? card.card_id : null)"));
  assert.ok(app.includes("createCardVisual(card, { detail: true })"));
  assert.ok(notice.includes('MIT License') && notice.includes('Copyright (c) 2026 Tarotoo'));
});
