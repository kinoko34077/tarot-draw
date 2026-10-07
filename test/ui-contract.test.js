import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('initial page exposes one primary action and hides later-stage primary actions', async () => {
  const html = await read('../web/index.html');
  assert.match(html, /id="shuffleButton" class="primary"/);
  assert.match(html, /id="drawButton" class="primary hidden"/);
  assert.match(html, /id="resultSection" class="panel hidden"/);
  assert.match(html, /id="copyButton" class="primary"/);
});

test('UI contract includes accessible status and pile-selection semantics', async () => {
  const [html, app] = await Promise.all([read('../web/index.html'), read('../web/app.js')]);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /<button id="resetButton"/);
  assert.match(html, /<input id="rowCount"/);
  assert.match(html, /<input id="columnCount"/);
  assert.match(app, /setAttribute\('aria-pressed'/);
  assert.match(app, /setAttribute\('aria-label'/);
});

test('narrow layout reflows piles and result matrices to one column', async () => {
  const css = await read('../web/styles.css');
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /\.pile-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.result-grid \{ grid-template-columns: 1fr; \}/);
});

test('result UI is result-only and does not render interpretation fields', async () => {
  const app = await read('../web/app.js');
  assert.match(app, /card\.name_ja/);
  assert.match(app, /orientationLabel\(card\.orientation\)/);
  assert.doesNotMatch(app, /card\.meaning|card\.interpretation|meaning_up|meaning_rev/);
});


test('Pages assets are relative and runtime config loads before app module', async () => {
  const html = await read('../web/index.html');
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/config\.js"/);
  assert.match(html, /type="module" src="\.\/app\.js"/);
  assert.ok(html.indexOf('src="./config.js"') < html.indexOf('src="./app.js"'));
});

test('Pages-safe UI disables authoritative drawing when external API is unconfigured', async () => {
  const app = await read('../web/app.js');
  assert.match(app, /!runtime\.apiAvailable/);
  assert.match(app, /API未接続/);
  assert.doesNotMatch(app, /Math\.random|crypto\.getRandomValues/);
});
