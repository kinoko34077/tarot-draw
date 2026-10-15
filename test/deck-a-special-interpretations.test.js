import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createTarotServer } from '../src/server.js';
import { deckASpecialInterpretation } from '../web/deck-a-special-interpretations.js';
import { keywordGridDraft } from '../web/card-keyword-grid.js';
import { cardDetail } from '../web/card-details.js';
import { cardDisplayParts, cardDisplayText, customCardPresentation, customCardNotesForResults } from '../web/model.js';

const TITLE = 'meta.title';
const INTRO = 'meta.introduction';

test('only Deck A title and introduction have special meanings (Deck B is untouched)', () => {
  const title = deckASpecialInterpretation(TITLE, 'A');
  const intro = deckASpecialInterpretation(INTRO, 'A');
  assert.ok(title);
  assert.ok(intro);
  assert.match(title.essence, /ウロボロス（境界の鏡）/);
  assert.match(title.upright, /終わりの始まり/);
  assert.match(title.reversed, /始まりの終わり/);
  assert.match(intro.essence, /創り手（遺されるもの）/);
  assert.match(intro.upright, /創造の継承/);
  assert.match(intro.reversed, /埋もれた創造/);
  for (const id of [TITLE, INTRO, 'meta.guarantee']) {
    assert.equal(deckASpecialInterpretation(id, 'B'), null, id);
  }
  assert.equal(deckASpecialInterpretation('meta.guarantee', 'A'), null);
  assert.equal(deckASpecialInterpretation('major.world', 'A'), null);
  assert.equal(deckASpecialInterpretation('__proto__', 'A'), null);
  assert.equal(deckASpecialInterpretation('constructor', 'A'), null);
  assert.equal(cardDetail(TITLE), null, 'standard 78-card meanings remain separate');
  assert.equal(cardDetail(INTRO), null);
  assert.equal(keywordGridDraft(TITLE), null, 'standard 78-card keyword corpus remains separate');
  assert.equal(keywordGridDraft(INTRO), null);
});

test('Deck A additions each supply independent five-row, four-term keyword tables', () => {
  for (const id of [TITLE, INTRO]) {
    const data = deckASpecialInterpretation(id, 'A');
    assert.equal(data.keywords.length, 5, id);
    assert.equal(new Set(data.keywords.map(row => row.heading)).size, 5, id);
    const terms = [];
    for (const { heading, terms: words } of data.keywords) {
      assert.ok([...heading].length >= 2 && [...heading].length <= 6);
      assert.equal(words.length, 4);
      for (const word of words) {
        assert.ok([...word].length >= 2 && [...word].length <= 6, id + ': ' + word);
        assert.notEqual(word, heading);
        terms.push(word);
      }
    }
    assert.equal(new Set(terms).size, 20);
    const copy = deckASpecialInterpretation(id, 'A');
    copy.keywords[0].heading = '改変';
    copy.keywords[0].terms[0] = '改変';
    assert.notEqual(deckASpecialInterpretation(id, 'A').keywords[0].heading, '改変');
    assert.notEqual(deckASpecialInterpretation(id, 'A').keywords[0].terms[0], '改変');
  }
});

test('user interpretation omits World comparison and unsupported attribution', () => {
  for (const id of [TITLE, INTRO]) {
    const data = deckASpecialInterpretation(id, 'A');
    const text = [data.essence, data.upright, data.reversed,
      ...data.keywords.flatMap(group => [group.heading, ...group.terms])].join(' ');
    assert.doesNotMatch(text, /世界|XXI|Tarotoo|GUARANTEE/);
  }
});

test('detail UI switches special data and attribution by actual deck identity', async () => {
  const [app, html] = await Promise.all([
    readFile(new URL('../web/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../web/index.html', import.meta.url), 'utf8')
  ]);
  assert.ok(app.includes('deckASpecialInterpretation(card.card_id, deckId)'));
  assert.ok(app.includes('specialInterpretation ?? cardDetail(card.card_id)'));
  assert.ok(app.includes('specialInterpretation?.keywords ?? (cardId ? keywordGridDraft(cardId) : null)'));
  assert.ok(app.includes("page.cardDetailTarotooSource.classList.toggle('hidden', !groups || Boolean(specialInterpretation))"));
  assert.ok(app.includes("page.cardDetailDeckASource.classList.toggle('hidden', !specialInterpretation)"));
  assert.ok(app.includes('renderKeywordGrid(detail ? card.card_id : null, specialInterpretation)'));
  assert.ok(html.includes('id="cardDetailTarotooSource"'));
  assert.ok(html.includes('id="cardDetailDeckASource" class="hidden"'));
  assert.ok(html.includes('出典：デッキA独自解釈（利用者提供）'));
});

test('local HTTP server serves Deck A detail module as JavaScript', async () => {
  const server = createTarotServer();
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/deck-a-special-interpretations.js');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/javascript/);
    assert.match(await response.text(), /deckASpecialInterpretation/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('Deck A visible names are ウロボロス/創り手 without renaming Deck B or settings', async () => {
  const aTitle = { card_id: TITLE, name_ja: 'タイトルカード', orientation: 'upright' };
  const aIntro = { card_id: INTRO, name_ja: 'パメラ・コールマン・スミス紹介カード', orientation: 'reversed' };
  assert.equal(cardDisplayParts(aTitle, 'A').title, '22 ウロボロス');
  assert.equal(cardDisplayParts(aIntro, 'A').title, '23 創り手');
  assert.equal(cardDisplayText(aTitle, 'A'), '22 ウロボロス 正位置');
  assert.equal(cardDisplayText(aIntro, 'A'), '23 創り手 逆位置');
  assert.equal(customCardPresentation(TITLE, 'A').faceTitle, '22 ウロボロス');
  assert.equal(customCardPresentation(INTRO, 'A').faceTitle, '23 創り手');
  const copiedNotes=customCardNotesForResults({ positions: { r0c0: aTitle, r0c1: aIntro } }, null, 'A');
  assert.equal(copiedNotes.length,2);
  assert.match(copiedNotes[0], /22 ウロボロス：[\\s\\S]*本質：[\\s\\S]*正位置：[\\s\\S]*逆位置：/);
  assert.match(copiedNotes[1], /23 創り手：[\\s\\S]*本質：[\\s\\S]*正位置：[\\s\\S]*逆位置：/);
  assert.equal(cardDisplayParts(aTitle, 'B').title, '22 タイトルカード');
  assert.equal(cardDisplayParts({ card_id: 'meta.guarantee', name_ja: 'GUARANTEE', orientation: 'upright' }, 'B').title, '23 GUARANTEE');
  assert.equal(cardDisplayParts(aIntro, 'B').title, '23 パメラ・コールマン・スミス紹介カード');
  const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.match(html, /class="deck-preview-name">タイトルカード<\/span>/);
  assert.match(html, /class="deck-preview-name">紹介カード<\/span>/);
  assert.match(html, /aria-label="デッキAのタイトルカードを抽選に含める"/);
  assert.match(html, /aria-label="デッキAの紹介カードを抽選に含める"/);
});
