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
  const [html, app] = await Promise.all([read('../web/index.html'), read('../web/app.js')]);
  assert.ok(app.includes('class="copy-button secondary hidden"'));
  assert.ok(app.includes('結果をコピー</button>'));
  assert.ok(!app.includes('tsv-copy-button'));
  assert.ok(!app.includes('結果をコピー（Markdown）'));
  assert.ok(app.includes('parallelPile: state.parallelPile'));
  assert.ok(html.includes('id="shuffleButton"'));
  assert.ok(html.includes('id="drawButton"'));
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
  assert.ok(app.includes("removeRow.textContent = '−'"));
  assert.ok(app.includes("removeColumn.textContent = '−'"));
  assert.ok(app.includes("window.confirm('削除しますか？')"));
  assert.ok(app.includes('axis-drag-ghost'));
  assert.ok(app.includes('axis-drop-preview'));
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
  assert.ok(css.includes('width: 100%; min-width: 0; table-layout: fixed;'));
  assert.ok(css.includes('.row-header {'));
  assert.ok(css.includes('position: sticky'));
  assert.ok(!/\.reading-table\s*\{[^}]*grid-template-columns/s.test(css));
});

test('result cells use compact title/orientation lines and tap/click detail triggers', async () => {
  const [app, css] = await Promise.all([read('../web/app.js'), read('../web/styles.css')]);
  assert.ok(app.includes("document.createElement('button')"));
  assert.ok(app.includes("title.className = 'card-title'"));
  assert.ok(app.includes("orientation.className = 'card-orientation'"));
  assert.ok(app.includes("openCardDetail(card, result, state.deckId)"));
  assert.ok(app.includes("table.style.minWidth = "));
  assert.ok(css.includes('grid-template-rows: 33px 14px'));
  assert.ok(css.includes('.card-title'));
  assert.ok(css.includes('.card-orientation'));
});

test('UX72: selected piles remain removable in done phase, and footer messaging cannot displace controls', async () => {
  const [app, css] = await Promise.all([read('../web/app.js'), read('../web/styles.css')]);
  const selection = app.slice(app.indexOf('  function selectPile(pileId) {'), app.indexOf('  function updateDrawAction() {'));
  assert.ok(!selection.includes("if (stage === 'done') return;"));
  assert.ok(selection.includes("if (parallelIndex >= 0)"));
  assert.ok(selection.includes("else if (mainIndex >= 0)"));
  assert.ok(selection.includes('state.parallelPiles = [];'));
  assert.ok(app.indexOf('class="result-action-line"') < app.indexOf('class="heading-right-controls"'));
  assert.ok(app.indexOf('class="heading-right-controls"') < app.indexOf('class="primary-matrix table-scroll"'));
  assert.ok(app.indexOf('class="primary-matrix table-scroll"') < app.indexOf('class="axis-history-actions"'));
  assert.ok(css.includes('.heading-right-controls .copy-button.hidden'));
  assert.ok(css.includes('.heading-right-controls .copy-button.hidden { display: none !important; }'));
  assert.ok(css.includes('.axis-add-actions-column { flex-direction: column'));
});

test('UX75: grid distributes remaining space uniformly and keeps min 96px with horizontal scroll', async () => {
  const [app, css] = await Promise.all([read('../web/app.js'), read('../web/styles.css')]);
  assert.ok(app.includes("document.createElement('colgroup')"));
  assert.ok(app.includes("rowCol.style.width = '62px'"));
  assert.ok(app.includes("actionsCol.style.width = '32px'"));
  assert.ok(app.includes("table.style.minWidth = `${62 + state.columnLabels.length * 96 + (canEditStructure ? 32 : 0)}px`"));
  assert.ok(css.includes('width: 100%; min-width: 0; table-layout: fixed;'));
  assert.ok(css.includes('.table-scroll { scrollbar-gutter: auto; }'));
  assert.ok(css.includes('.axis-add-actions-column .axis-add-button'));
  assert.ok(css.includes('width: 32px; min-width: 32px; max-width: 32px;'));
  assert.ok(css.includes('height: 36px; max-height: 36px;'));
});

test('UX75: Parallel is a direct label edit surface using identical shared metadata', async () => {
  const app = await read('../web/app.js');
  const parallel = app.slice(app.indexOf('  function renderParallelMatrix() {'), app.indexOf('  function capacityOf('));
  assert.ok(parallel.includes('editableHeaders: true'));
  assert.ok(app.includes('function syncOtherHeading()'));
  assert.ok(app.includes('for (const matrix of [refs.primaryMatrix, refs.parallelMatrix])'));
  assert.ok(app.includes("matrix.querySelectorAll(selector)[index]"));
  assert.ok(app.includes("input.addEventListener('blur', () => finish(true))"));
});

test('UX72: result-only ruby has out-of-flow reading; vertical digits are display-only', async () => {
  const [app, css, model] = await Promise.all([
    read('../web/app.js'), read('../web/styles.css'), read('../web/model.js')
  ]);
  assert.ok(app.includes("setCardTitle(title, parts, { floatingRuby: true })"));
  assert.ok(app.includes("phonetic.className = 'ruby-float'"));
  assert.ok(app.includes("base.className = 'ruby-base'"));
  assert.ok(app.includes("phonetic.setAttribute('aria-hidden', 'true')"));
  assert.ok(css.includes('.card-title .ruby-float'));
  assert.ok(css.includes('position: absolute; bottom: calc(100% - 1px)'));
  assert.ok(app.includes("return kind === 'row' ? label.replace(/[0-9]/g"));
  assert.ok(app.includes("displayAxisLabel(state.rowLabels, row, 'row')"));
  assert.ok(model.includes("labelOrFallback(rowLabels, row, 'row')"));
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
  assert.ok(app.includes('createCardVisual(card, { detail: true, deckId })'));
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
  assert.ok(app.includes('setCardTitle(title, parts, { floatingRuby: true })'));
  assert.ok(app.includes('element.innerHTML = parts.titleHtml'));
  assert.ok(style.includes('.card-title rt'));
  assert.match(generated, /Generated by scripts\/generate-card-name-ruby\.mjs using aozora-wasm 0\.5\.0/);
  assert.ok(generated.includes('<rt>カップ</rt>'));
  assert.ok(generated.includes('<rt>騎士</rt>') === false);
  assert.ok(!model.includes('referenceImageUrl'));
  assert.ok(!app.includes('detail-reference-art'));
});


test('UX78: visible settings affordance and 4 special-card previews, square column-only actions', async () => {
  const [html,css,app]=await Promise.all([
    read('../web/index.html'),read('../web/styles.css'),read('../web/app.js')
  ]);
  assert.ok(html.includes('id="settingsButton"'));
  assert.ok(html.includes('id="settingsDialog"'));
  assert.ok(html.includes('name="deckId" value="A"'));
  assert.ok(html.includes('name="deckId" value="B"'));
  assert.ok(html.includes('id="includeCustomCards"'));
  assert.equal((html.match(/class="deck-preview-face"/g)||[]).length,4);
  assert.ok(html.includes('パメラ・コールマン・スミス紹介カード'));
  assert.ok(css.includes('height: 27px; min-height: 27px; border-radius: 4px;'));
  assert.ok(app.includes('settingsDialog.showModal()'));
  assert.ok(app.includes('state.includeCustom ? 80 : 78'));
  assert.ok(app.includes('split.include_custom'));
  assert.ok(app.includes('deckId: state.deckId'));
});
