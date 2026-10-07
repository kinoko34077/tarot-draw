import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('initial page exposes one strongest primary action and keeps copy/draw hidden', async () => {
  const html = await read('../web/index.html');
  assert.ok(html.includes('id="shuffleButton" class="primary"'));
  assert.ok(html.includes('id="drawButton" class="primary hidden"'));
  assert.ok(html.includes('id="copyButton" class="secondary hidden"'));
  assert.ok(!html.includes('id="copyButton" class="primary"'));
});

test('matrix is the central work surface with compact dimensions and semantic table construction', async () => {
  const [html, app] = await Promise.all([read('../web/index.html'), read('../web/app.js')]);
  assert.ok(html.includes('id="primaryMatrix" class="table-scroll"'));
  assert.ok(html.includes('id="rowCount"'));
  assert.ok(html.includes('id="columnCount"'));
  assert.ok(!html.includes('id="rowLabels"'));
  assert.ok(!html.includes('id="columnLabels"'));
  assert.ok(!html.includes('result-grid'));
  assert.ok(app.includes("document.createElement('table')"));
  assert.ok(app.includes("table.className = 'reading-table'"));
  assert.ok(app.includes("th.scope = 'col'"));
  assert.ok(app.includes("rowHeader.scope = 'row'"));
  assert.ok(app.includes("createAxisEditor('column'"));
  assert.ok(app.includes("createAxisEditor('row'"));
});

test('narrow layout preserves matrix geometry with horizontal scrolling instead of one-column collapse', async () => {
  const css = await read('../web/styles.css');
  assert.ok(css.includes('overflow-x: auto'));
  assert.ok(css.includes('.row-header {'));
  assert.ok(css.includes('position: sticky'));
  assert.ok(css.includes('@media (max-width: 720px)'));
  assert.ok(!css.includes('.result-grid'));
  assert.ok(!css.includes('grid-template-columns: 1fr'));
});

test('pile selection is compact and result UI remains result-only', async () => {
  const [css, app] = await Promise.all([read('../web/styles.css'), read('../web/app.js')]);
  assert.ok(css.includes('min-height: 34px'));
  assert.ok(app.includes('cardDisplayText(card)'));
  assert.ok(!app.includes('card.meaning'));
  assert.ok(!app.includes('card.interpretation'));
  assert.ok(!app.includes('meaning_up'));
  assert.ok(!app.includes('meaning_rev'));
});

test('UI contract includes accessible status and pile-selection semantics', async () => {
  const [html, app] = await Promise.all([read('../web/index.html'), read('../web/app.js')]);
  assert.ok(html.includes('role="status" aria-live="polite"'));
  assert.ok(html.includes('<button id="resetButton"'));
  assert.ok(app.includes("setAttribute('aria-pressed'"));
  assert.ok(app.includes("setAttribute('aria-label'"));
  assert.ok(app.includes("table.setAttribute('aria-label'"));
});

test('Pages assets are relative and runtime config loads before app module', async () => {
  const html = await read('../web/index.html');
  assert.ok(html.includes('href="./styles.css"'));
  assert.ok(html.includes('src="./config.js"'));
  assert.ok(html.includes('type="module" src="./app.js"'));
  assert.ok(html.indexOf('src="./config.js"') < html.indexOf('src="./app.js"'));
});

test('Pages-safe UI disables authoritative drawing when external API is unconfigured', async () => {
  const app = await read('../web/app.js');
  assert.ok(app.includes('!runtime.apiAvailable'));
  assert.ok(app.includes('API未接続'));
  assert.ok(!app.includes('Math.random'));
  assert.ok(!app.includes('crypto.getRandomValues'));
});
