import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('initial page exposes one strongest primary action and keeps copy/draw hidden', async () => {
  const html = await read('../web/index.html');
  assert.match(html, /id="shuffleButton" class="primary"/);
  assert.match(html, /id="drawButton" class="primary hidden"/);
  assert.match(html, /id="copyButton" class="secondary hidden"/);
  assert.doesNotMatch(html, /id="copyButton" class="primary"/);
});

test('matrix is the central work surface with compact dimensions and semantic table construction', async () => {
  const [html, app] = await Promise.all([read('../web/index.html'), read('../web/app.js')]);
  assert.match(html, /id="primaryMatrix" class="table-scroll"/);
  assert.match(html, /id="rowCount"/);
  assert.match(html, /id="columnCount"/);
  assert.doesNotMatch(html, /id="rowLabels"|id="columnLabels"|result-grid/);
  assert.match(app, /document.createElement('table')/);
  assert.match(app, /table.className = 'reading-table'/);
  assert.match(app, /th.scope = 'col'/);
  assert.match(app, /rowHeader.scope = 'row'/);
  assert.match(app, /createAxisEditor('column'/);
  assert.match(app, /createAxisEditor('row'/);
});

test('narrow layout preserves matrix geometry with horizontal scrolling instead of one-column collapse', async () => {
  const css = await read('../web/styles.css');
  assert.match(css, /.table-scrolls*{[sS]*overflow-x: auto/);
  assert.match(css, /.row-headers*{[sS]*position: sticky/);
  assert.match(css, /@media (max-width: 720px)/);
  assert.doesNotMatch(css, /.result-grids*{s*grid-template-columns:s*1fr/);
  assert.doesNotMatch(css, /.reading-tables*{[^}]*display:s*block/);
});

test('pile selection is compact and result UI remains result-only', async () => {
  const [css, app] = await Promise.all([read('../web/styles.css'), read('../web/app.js')]);
  assert.match(css, /.pile-buttons*{[sS]*min-height: 34px/);
  assert.match(app, /cardDisplayText(card)/);
  assert.doesNotMatch(app, /card.meaning|card.interpretation|meaning_up|meaning_rev/);
});

test('UI contract includes accessible status and pile-selection semantics', async () => {
  const [html, app] = await Promise.all([read('../web/index.html'), read('../web/app.js')]);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /<button id="resetButton"/);
  assert.match(app, /setAttribute('aria-pressed'/);
  assert.match(app, /setAttribute('aria-label'/);
  assert.match(app, /table.setAttribute('aria-label'/);
});

test('Pages assets are relative and runtime config loads before app module', async () => {
  const html = await read('../web/index.html');
  assert.match(html, /href="./styles.css"/);
  assert.match(html, /src="./config.js"/);
  assert.match(html, /type="module" src="./app.js"/);
  assert.ok(html.indexOf('src="./config.js"') < html.indexOf('src="./app.js"'));
});

test('Pages-safe UI disables authoritative drawing when external API is unconfigured', async () => {
  const app = await read('../web/app.js');
  assert.match(app, /!runtime.apiAvailable/);
  assert.match(app, /API未接続/);
  assert.doesNotMatch(app, /Math.random|crypto.getRandomValues/);
});
