import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('page hosts append-only reading history and no longer exposes numeric dimensions or top reset', async () => {
  const html = await read('../web/index.html');
  assert.ok(html.includes('id="readings"'));
  assert.ok(html.includes('id="newReadingButton"'));
  assert.ok(!html.includes('id="rowCount"'));
  assert.ok(!html.includes('id="columnCount"'));
  assert.ok(!html.includes('id="resetButton"'));
});

test('one reading exposes one strongest primary action per phase and secondary copy', async () => {
  const app = await read('../web/app.js');
  assert.ok(app.includes('class="copy-button secondary hidden"'));
  assert.ok(app.includes('class="shuffle-button primary"'));
  assert.ok(app.includes('class="draw-button primary hidden"'));
  assert.ok(!app.includes('copy-button primary'));
});

test('question context appears before the matrix and is owned per reading', async () => {
  const app = await read('../web/app.js');
  assert.ok(app.includes('class="question-field"'));
  assert.ok(app.includes('class="question-prefix">Q.</span>'));
  assert.ok(app.includes("state.question = event.target.value"));
  assert.ok(app.includes('question: state.question'));
});

test('matrix uses direct plus controls and contextual axis deletion', async () => {
  const app = await read('../web/app.js');
  assert.ok(app.includes("addColumn.textContent = '＋'"));
  assert.ok(app.includes("button.textContent = '＋'"));
  assert.ok(app.includes('LONG_PRESS_MS = 520'));
  assert.ok(app.includes("target.addEventListener('contextmenu'"));
  assert.ok(app.includes("menuButton.textContent = '⠿'"));
  // Global capture follows a drag across cells even if grip-level capture is lost.
  assert.ok(app.includes("window.addEventListener('pointermove', onPointerMove, true)"));
  assert.ok(app.includes("window.addEventListener('pointerup', onPointerUp, true)"));
  assert.ok(app.includes("stopTracking();"));
  assert.ok(app.includes("menuButton.addEventListener('keydown'"));
  assert.ok(app.includes('moveAxis(kind, index, index + 1)'));
  assert.ok(app.includes("removeAxisLabel(state.rowLabels, index)"));
  assert.ok(app.includes("removeAxisLabel(state.columnLabels, index)"));
});

test('matrix remains semantic and narrow layouts preserve geometry', async () => {
  const [app, css] = await Promise.all([read('../web/app.js'), read('../web/styles.css')]);
  assert.ok(app.includes("document.createElement('table')"));
  assert.ok(app.includes("table.className = 'reading-table'"));
  assert.ok(app.includes("th.scope = 'col'"));
  assert.ok(app.includes("rowHeader.scope = 'row'"));
  assert.ok(css.includes('overflow-x: auto'));
  assert.ok(css.includes('.matrix-section { min-width: 0; }'));
  assert.ok(css.includes('max-width: 100%'));
  assert.ok(css.includes('.reading-table {\n  width: max-content;\n  min-width: 0;'));
  assert.ok(css.includes('.row-header {'));
  assert.ok(css.includes('position: sticky'));
  assert.ok(!/\.reading-table\s*\{[^}]*grid-template-columns/s.test(css));
});

test('result cells use compact title/orientation lines and tap/click detail triggers', async () => {
  const [app, css] = await Promise.all([read('../web/app.js'), read('../web/styles.css')]);
  assert.ok(app.includes("document.createElement('button')"));
  assert.ok(app.includes("title.className = 'card-title'"));
  assert.ok(app.includes("orientation.className = 'card-orientation'"));
  assert.ok(app.includes("openCardDetail(card, result)"));
  assert.ok(css.includes('min-width: 108px'));
  assert.ok(css.includes('.card-title'));
  assert.ok(css.includes('.card-orientation'));
});

test('standard cards render lightweight Commons RWS art and reversed art rotates without rotating label text', async () => {
  const [app, css] = await Promise.all([read('../web/app.js'), read('../web/styles.css')]);
  assert.ok(app.includes('rwsImageUrl(card, detail ? 224 : 128)'));
  assert.ok(app.includes("image.classList.add('is-reversed')"));
  assert.ok(app.includes("image.addEventListener('error'"));
  assert.ok(app.includes("face.classList.add('is-reversed')"));
  assert.ok(css.includes('.card-art.is-reversed { transform: rotate(180deg); }'));
  assert.ok(css.includes('.custom-card-face.is-reversed { transform: rotate(180deg); }'));
  assert.ok(css.includes('.card-result-text'));
});

test('completed readings remain while new reading appends below and each keeps copy', async () => {
  const app = await read('../web/app.js');
  assert.ok(app.includes('page.readings.append(controller.article)'));
  assert.ok(app.includes("page.newReadingButton.addEventListener('click', appendReading)"));
  assert.ok(app.includes("page.newReadingButton.classList.remove('hidden')"));
  assert.ok(!app.includes('replaceChildren(controller.article)'));
});

test('UI contract includes accessible status and alternative axis-menu paths', async () => {
  const [html, app] = await Promise.all([read('../web/index.html'), read('../web/app.js')]);
  assert.ok(html.includes('role="menu"'));
  assert.ok(html.includes('role="menuitem"'));
  assert.ok(app.includes("setAttribute('aria-label'"));
  assert.ok(app.includes("event.key === 'Escape'"));
  assert.ok(app.includes("target.addEventListener('contextmenu'"));
});

test('Pages assets remain relative and runtime config loads before app module', async () => {
  const html = await read('../web/index.html');
  assert.ok(html.includes('href="./styles.css"'));
  assert.ok(html.includes('src="./config.js"'));
  assert.ok(html.includes('type="module" src="./app.js"'));
  assert.ok(html.indexOf('src="./config.js"') < html.indexOf('src="./app.js"'));
});

test('Pages-safe UI keeps authoritative drawing server-side', async () => {
  const app = await read('../web/app.js');
  assert.ok(app.includes('!runtime.apiAvailable'));
  assert.ok(app.includes('API未接続'));
  assert.ok(!app.includes('Math.random'));
  assert.ok(!app.includes('crypto.getRandomValues'));
});


test('card detail uses an accessible native dialog with attachment-backed text and all close paths', async () => {
  const [html, app, css] = await Promise.all([
    read('../web/index.html'),
    read('../web/app.js'),
    read('../web/styles.css')
  ]);
  assert.ok(html.includes('<dialog id="cardDetailDialog"'));
  assert.ok(html.includes('aria-labelledby="cardDetailTitle"'));
  assert.ok(html.includes('id="cardDetailClose"'));
  assert.ok(html.includes('id="cardDetailEssence"'));
  assert.ok(html.includes('id="cardDetailUpright"'));
  assert.ok(html.includes('id="cardDetailReversed"'));
  assert.ok(app.includes("import { cardDetail } from './card-details.js'"));
  assert.ok(app.includes('page.cardDetailDialog.showModal()'));
  assert.ok(app.includes("event.target === page.cardDetailDialog"));
  assert.ok(app.includes("addEventListener('keydown'"));
  assert.ok(app.includes("event.key === 'Escape'"));
  assert.ok(app.includes("addEventListener('cancel'"));
  assert.ok(app.includes("addEventListener('close'"));
  assert.ok(app.includes('focus({ preventScroll: true })'));
  assert.ok(app.includes('createCardVisual(card, { detail: true })'));
  assert.ok(app.includes('rwsImageUrl(card, detail ? 224 : 128)'));
  assert.ok(css.includes('.card-detail-dialog::backdrop'));
  assert.ok(css.includes('.detail-meaning[data-active="true"]'));
});

test('Minor Arcana ruby HTML is generated by aozora-wasm and does not load reference images', async () => {
  const [app, style, generated, model] = await Promise.all([
    read('../web/app.js'),
    read('../web/styles.css'),
    read('../web/card-name-ruby.js'),
    read('../web/model.js')
  ]);
  assert.ok(app.includes('setCardTitle(title, parts)'));
  assert.ok(app.includes('element.innerHTML = parts.titleHtml'));
  assert.ok(style.includes('.card-title rt'));
  assert.match(generated, /Generated by scripts\/generate-card-name-ruby\.mjs using aozora-wasm 0\.5\.0/);
  assert.ok(generated.includes('<rt>カップ</rt>'));
  assert.ok(generated.includes('<rt>騎士</rt>') === false);
  assert.ok(!model.includes('referenceImageUrl'));
  assert.ok(!app.includes('detail-reference-art'));
});
