import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CARD_CATALOG } from '../src/cards.js';
import { KEYWORD_GRID_DRAFTS, keywordGridDraft } from '../web/card-keyword-grid.js';

const specimenIds = [
  'major.fool', 'major.death', 'major.devil',
  'minor.swords.3', 'minor.cups.ace'
];

test('issue #26 five-card draft validates IDs, unique headings/terms and legible word lengths', () => {
  assert.deepEqual(Object.keys(KEYWORD_GRID_DRAFTS).sort(), [...specimenIds].sort());
  const ids = new Set(CARD_CATALOG.map(card => card.card_id));
  for (const cardId of specimenIds) {
    assert.ok(ids.has(cardId));
    const groups = keywordGridDraft(cardId);
    assert.equal(groups.length, 5, cardId);
    assert.equal(new Set(groups.map(group => group.heading)).size, 5, cardId);
    const allTerms = [];
    for (const group of groups) {
      assert.ok(group.heading.trim());
      assert.equal(group.heading, group.heading.trim(), cardId + ': heading whitespace');
      assert.ok(group.heading.length <= 14, cardId + ': excessively long heading');
      assert.equal(group.terms.length, 4, cardId + ':' + group.heading);
      for (const term of group.terms) {
        assert.ok(term.trim().length > 0, cardId + ': empty term');
        assert.equal(term, term.trim(), cardId + ': term whitespace');
        assert.ok(term.length <= 16, cardId + ': excessively long term ' + term);
        assert.ok(!/[\r\n\t]/.test(term), cardId + ': control whitespace');
        assert.notEqual(term, group.heading, cardId + ': term duplicates heading');
        allTerms.push(term);
      }
    }
    assert.equal(new Set(allTerms).size, 20, cardId + ': duplicated terms across columns');
  }
});

test('draft-only content does not invent reference data for the remaining cards or custom cards', () => {
  assert.equal(keywordGridDraft('meta.title'), null);
  assert.equal(keywordGridDraft('meta.guarantee'), null);
  assert.equal(keywordGridDraft('major.magician'), null);
  const first = keywordGridDraft('major.fool');
  first[0].terms[0] = 'mutated';
  assert.notEqual(keywordGridDraft('major.fool')[0].terms[0], 'mutated');
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
  assert.ok(css.includes('grid-template-columns: repeat(5, minmax(130px, 1fr))'));
  assert.ok(css.includes('.card-detail-keywords'));
  assert.ok(css.includes('overflow-x: auto'));
  assert.ok(css.includes('grid-column: 1 / -1'));
  assert.ok(app.includes("item.textContent = term"));
  assert.ok(app.includes("label.textContent = heading"));
  assert.ok(app.includes("renderKeywordGrid(detail ? card.card_id : null)"));
  assert.ok(app.includes("createCardVisual(card, { detail: true })"));
  assert.ok(notice.includes('MIT License') && notice.includes('Copyright (c) 2026 Tarotoo'));
});
