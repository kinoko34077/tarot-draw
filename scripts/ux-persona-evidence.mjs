// Deterministic browser-operated UX evidence, not observations of actual people.
// UI policy: "machine-observable checks belong to the agent" (Project Source §15).
// This probe intentionally reports existing failures in --baseline mode.
// --gate fails the job when accepted machine-observable requirements are unmet.
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTarotServer } from '../src/server.js';

const CHROME_BIN = process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser']
  .map(name => spawnSync('which', [name], { encoding: 'utf8' }))
  .find(result => result.status === 0)?.stdout.trim();
if (!CHROME_BIN) throw Error('Chrome is required: set CHROME_BIN');
const mode = process.argv.includes('--gate') ? 'gate' : 'baseline';
const reportPath = process.env.UX_EVIDENCE_PATH || 'ux-persona-evidence.json';
const port = 9000 + Math.floor(Math.random() * 900);
const profile = await mkdtemp(join(tmpdir(), 'tarot-ux-personas-'));
const server = createTarotServer();
let browser;
let cdp;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class DevTools {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.pending = new Map();
    this.nextId = 0;
    this.socket.onmessage = event => {
      const response = JSON.parse(event.data);
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.error) pending.reject(Error(JSON.stringify(response.error)));
      else pending.resolve(response.result);
    };
  }
  async ready() {
    await new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = reject;
    });
  }
  async call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.socket.close(); }
}

async function evaluate(fn) {
  const expression = '(' + fn.toString() + ')()';
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const reply = await cdp.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (!reply.exceptionDetails) return reply.result.value;
      const message = reply.exceptionDetails.exception?.description || 'Unknown Chrome exception';
      if (!message.includes('Cannot find default execution context') || attempt === 39) throw Error(message);
    } catch (error) {
      // CDP can reject at transport/protocol level while the first page context
      // is being replaced; it need not return exceptionDetails.
      if (!String(error.message).includes('Cannot find default execution context') || attempt === 39) throw error;
    }
    await sleep(100);
  }
}

async function waitForAppReady() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(() => Boolean(document.querySelector('.reading-workbench .axis-add-header .axis-add-button')))) return;
    await sleep(100);
  }
  throw Error('Application did not render its first reading after the browser connected');
}

const report = {
  schema: 'tarot-ux-persona-evidence.v1',
  mode,
  executable: CHROME_BIN,
  origin: 'real local Chromium + local Node API; synthetic scripted actions, NOT actual children, novices or experts',
  policy: ['03_Development_Specification_Principles.md §15', '利用者起点 UI-UX 設計原則', 'devflow#161/#176/#177', '.ai-guidelines#23'],
  commit: process.env.UX_HEAD_SHA || process.env.GITHUB_SHA || 'LOCAL_HEAD_UNSPECIFIED',
  timestamp: new Date().toISOString(),
  scenarios: [],
  checks: [],
  unverified: ['Actual child, novice or expert comprehension', 'Real screen-reader spoken Japanese', 'Physical motor accessibility'],
  verdict: 'UNVERIFIED'
};
function check(scenario, metric, observed, expected, pass) {
  report.checks.push({ scenario, metric, observed, expected, verdict: pass ? 'PASS' : 'FAIL' });
}
function result(id, personaProxy, data) {
  report.scenarios.push({ id, personaProxy, method: 'scripted browser operations', ...data });
}

async function waitForBrowser(url) {
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/json/list');
      if (response.ok) {
        const pages = await response.json();
        const tab = pages.find(page => page.type === 'page' && page.url.startsWith(url));
        if (tab) return tab;
      }
    } catch {}
    await sleep(200);
  }
  throw Error('Local Chrome did not expose application tab');
}

function discoverabilityProbe() {
  const $ = q => document.querySelector(q);
  const rect = el => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  return {
    width: innerWidth,
    hasQuestionPrefix: $('.question-prefix')?.textContent === 'Q.',
    hasVisibleQuestionLabel: Boolean([...document.querySelectorAll('label span')]
      .find(el => el.textContent.includes('今回の問い'))),
    countAtReading: Boolean($('.reading-toolbar .card-count')),
    countAtLayout: Boolean($('.matrix-heading .card-count')),
    splitCaptionAndInput: Boolean($('.axis-caption') && $('.axis-input')),
    sameSurfaceEditor: Boolean($('.column-header [contenteditable],.column-header .axis-inline-label')),
    editInputRect: rect($('.column-header .axis-input')),
    leftHeaderRect: rect($('.row-header')),
    columnRect: rect($('.column-header')),
    addControlRect: rect($('.axis-add-header .axis-add-button')),
    visibleAddText: $('.axis-add-header .axis-add-button')?.textContent?.trim(),
    visibleDetailCue: Boolean($('.card-detail-trigger .detail-affordance')),
    horizontalOverflow: $('.primary-matrix')?.scrollWidth > $('.primary-matrix')?.clientWidth
  };
}

async function noviceTask() {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const $ = q => document.querySelector(q);
  const $$ = q => [...document.querySelectorAll(q)];
  const actions = [];
  const click = q => {
    const el = $(q);
    if (!el) throw Error('Action missing ' + q);
    el.click();
    actions.push('click:' + q);
  };
  const poll = async (fn, message) => {
    for (let i = 0; i < 120; i++) {
      if (fn()) return;
      await sleep(100);
    }
    throw Error('Scenario timeout: ' + message);
  };
  await poll(() => $('.shuffle-button'), 'app startup');
  const q = $('.question-input');
  q.value = '初回操作テスト';
  q.dispatchEvent(new Event('input', { bubbles: true }));
  actions.push('type:question');
  const colButton = $('.column-header .axis-inline-label');
  let headingCommitted = false;
  let headingFocusRestored = false;
  if (colButton) {
    colButton.click();
    const inline = $('.column-header .axis-inline-input');
    if (!inline) throw Error('Clicking heading did not edit the same cell');
    inline.value = '過去';
    inline.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    headingCommitted = colButton.textContent === '過去';
    headingFocusRestored = document.activeElement === colButton;
    actions.push('type:col-in-place');
  }
  click('.axis-add-row-header .axis-add-button');
  click('.axis-add-header .axis-add-button');
  click('.shuffle-button');
  await poll(() => $$('.pile-button').filter(el => !el.disabled).length >= 2, 'shuffled piles');
  click('.pile-button:not([disabled])');
  click('.draw-button');
  await poll(() => $('.reading-status')?.textContent === '抽選完了', 'draw completed');
  const reading = $('.reading-workbench');
  const copy = reading.querySelector('.copy-button');
  const completed = reading.querySelector('.reading-status');
  const copyRect = copy.getBoundingClientRect();
  const completeRect = completed.getBoundingClientRect();
  const counts = {
    cards: $$('.primary-matrix .card-detail-trigger').length,
    copyVisible: !copy.classList.contains('hidden'),
    feedbackDistancePx: Math.round(Math.abs(copyRect.y - completeRect.y)),
    withinSameViewport: Math.abs(copyRect.y - completeRect.y) < innerHeight,
    resultCanEditHeader: Boolean(reading.querySelector('.primary-matrix .column-header input,.primary-matrix .column-header [contenteditable],.primary-matrix .column-header .axis-inline-label')),
    inlineHeaderCommitted: headingCommitted,
    inlineHeaderFocusRestored: headingFocusRestored
  };
  const detail = $$('.primary-matrix .card-detail-trigger').find(button => button.querySelector('img'));
  if (!detail) throw Error('No regular RWS card among six; synthetic task cannot inspect standard detail');
  detail.click();
  actions.push('open:card-detail');
  await poll(() => $('#cardDetailDialog')?.open, 'detail open');
  const th = $$('#cardDetailKeywordRows tbody tr');
  const cells = $$('#cardDetailKeywordRows tbody tr:first-child > *');
  const head = $('#cardDetailKeywordRows thead');
  const grid = $('#cardDetailKeywordRows');
  const css = getComputedStyle(grid);
  const proseUp = $('#cardDetailUprightBlock')?.getBoundingClientRect();
  const proseRev = $('#cardDetailReversedBlock')?.getBoundingClientRect();
  const title = $('#cardDetailTitle')?.getBoundingClientRect();
  const orientation = $('#cardDetailOrientation')?.getBoundingClientRect();
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = 1;
  const colorContext = colorCanvas.getContext('2d');
  const sampleRGB = color => {
    colorContext.fillStyle = color;
    colorContext.fillRect(0, 0, 1, 1);
    return [...colorContext.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };
  const colorDistance = (x, y) => {
    const a = sampleRGB(x), b = sampleRGB(y);
    return Math.hypot(...a.map((v, i) => v - b[i]));
  };
  const baseSurface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  const termStyle = getComputedStyle(cells[1]);
  const themeStyle = getComputedStyle(cells[0]);
  const contrast = {
    horizontal: colorDistance(termStyle.borderBottomColor, baseSurface),
    vertical: colorDistance(termStyle.borderRightColor, baseSurface),
    theme: colorDistance(themeStyle.borderRightColor, baseSurface)
  };
  const key = {
    borderContrast: contrast, 
    guidesSubordinate: contrast.vertical >= 5 &&
      contrast.horizontal >= contrast.vertical * 2.5 &&
      contrast.theme >= contrast.vertical * 1.25 &&
      contrast.horizontal >= contrast.theme * 1.25,
    groups: th.length,
    cols: cells.length,
    headerInsideTable: Boolean(head && head.querySelector('th')?.textContent.includes('キーワード')),
    cellSpacing: css.borderSpacing,
    borderCollapse: css.borderCollapse,
    internalVerticalLines: cells.slice(0, -1).every(el => parseFloat(getComputedStyle(el).borderRightWidth) >= 1),
    allHorizontalLines: th.slice(0, -1).every(el => [...el.children].every(cell => parseFloat(getComputedStyle(cell).borderBottomWidth) >= 1)),
    orientationSideBySide: Boolean(proseUp && proseRev && Math.abs(proseUp.y - proseRev.y) < 10 && proseUp.x < proseRev.x),
    titleAndOrientationSingleLine: Boolean(title && orientation && Math.abs(title.y - orientation.y) < 12),
    textWritingMode: cells.every(el => getComputedStyle(el).writingMode === 'vertical-rl')
  };
  click('#cardDetailClose');
  return { actions: actions.length, actionTrace: actions, focus: counts, keyword: key };
}

async function expertTask() {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const $ = q => document.querySelector(q);
  const $$ = q => [...document.querySelectorAll(q)];
  const poll = async (fn, why) => {
    for (let i = 0; i < 120; i++) {
      if (fn()) return;
      await sleep(100);
    }
    throw Error('Scenario timeout: ' + why);
  };
  $('#newReadingButton').click();
  const reading = $$('.reading-workbench').at(-1);
  const pick = sel => reading.querySelector(sel);
  let actions = 1;
  for (let i = 0; i < 6; i++) {
    pick('.axis-add-header .axis-add-button').click();
    actions++;
  }
  for (let i = 0; i < 2; i++) {
    pick('.axis-add-row-header .axis-add-button').click();
    actions++;
  }

  // Test an actual grid, without replacing the user's name with a separate
  // permanent field or asking a person to perform the manipulation.
  const columnNames = () => [...reading.querySelectorAll('.primary-matrix .column-header .axis-inline-label')]
    .map(label => label.textContent);
  const rowNames = () => [...reading.querySelectorAll('.primary-matrix .row-header .axis-inline-label')]
    .map(label => label.textContent);
  const rename = (selector, name) => {
    const control = pick(selector);
    if (!control) throw Error('Heading missing: ' + selector);
    control.click();
    const input = control.parentElement?.querySelector('.axis-inline-input')
      || pick('.axis-inline-input');
    if (!input) throw Error('Same-surface editing did not open');
    input.value = name;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    actions++;
  };
  rename('.column-header .axis-inline-label', '甲');
  rename('.column-header:nth-child(3) .axis-inline-label', '乙');
  rename('.row-header .axis-inline-label', '上');
  const keys = (selector, key) => {
    const grip = pick(selector);
    if (!grip) throw Error('Missing drag grip ' + selector);
    grip.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    actions++;
  };

  keys('.column-header .axis-menu-trigger', 'ArrowRight');
  const keyboardColumnMoved = columnNames()[0] === '乙' && columnNames()[1] === '甲';
  const undo = () => {
    const button = pick('.axis-undo-button');
    if (!button || button.classList.contains('hidden')) throw Error('Visible Undo absent');
    button.click();
    actions++;
  };
  const redo = () => {
    const button = pick('.axis-redo-button');
    if (!button || button.classList.contains('hidden')) throw Error('Visible Redo absent');
    button.click();
    actions++;
  };
  undo();
  const undoRestored = columnNames()[0] === '甲' && columnNames()[1] === '乙';
  redo();
  const redoReapplied = columnNames()[0] === '乙' && columnNames()[1] === '甲';
  undo();

  keys('.row-header .axis-menu-trigger', 'ArrowDown');
  const keyboardRowMoved = rowNames()[0] === '行2' && rowNames()[1] === '上';
  undo();

  // Scripted touch-pointer contract (NOT a physical touchscreen study).
  const grip = pick('.column-header .axis-menu-trigger');
  const destination = reading.querySelectorAll('.primary-matrix .column-header')[2];
  const start = grip.getBoundingClientRect();
  const end = destination.getBoundingClientRect();
  const pointer = (type, x, y) => grip.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 71, isPrimary: true,
    pointerType: 'touch', button: 0, buttons: type === 'pointerup' ? 0 : 1,
    clientX: x, clientY: y
  }));
  pointer('pointerdown', start.x + start.width / 2, start.y + start.height / 2);
  pointer('pointermove', end.x + end.width / 2, end.y + end.height / 2);
  pointer('pointerup', end.x + end.width / 2, end.y + end.height / 2);
  actions++;
  const touchColumnMoved = columnNames()[2] === '甲';
  if (touchColumnMoved) undo();

  const rowGrip = reading.querySelectorAll('.primary-matrix .row-header .axis-menu-trigger')[2];
  rowGrip.click();
  actions++;
  const deleteButton = document.querySelector('#deleteAxisButton');
  if (!deleteButton || deleteButton.classList.contains('hidden')) throw Error('Delete was not exposed near the row');
  const originalConfirm = window.confirm;
  window.confirm = () => true;
  deleteButton.click();
  window.confirm = originalConfirm;
  actions++;
  const removedRow = reading.querySelectorAll('.primary-matrix .row-header').length === 2;
  undo();
  const deleteUndoRestored = reading.querySelectorAll('.primary-matrix .row-header').length === 3;

  document.querySelector('.shuffle-button').click();
  actions++;
  await poll(() => [...reading.querySelectorAll('.pile-button')].filter(el => !el.disabled).length >= 2, 'piles ready');
  const piles = [...reading.querySelectorAll('.pile-button')].filter(el => !el.disabled);
  piles[0].click();
  piles[1].click();
  actions += 2;
  document.querySelector('.draw-button').click();
  actions++;
  await poll(() => pick('.reading-status')?.textContent === '抽選完了', 'two-pile draw');
  const main = pick('.primary-matrix');
  const parallel = pick('.parallel-matrix');
  const cardsBefore = [...main.querySelectorAll('.card-result-block'), ...parallel.querySelectorAll('.card-result-block')]
    .map(el => el.textContent);
  const label = pick('.primary-matrix .column-header .axis-inline-label');
  let completedRename = false;
  let unchangedCardsAfterRename = false;
  let parallelLabelMatches = false;
  if (label) {
    label.click();
    const editor = pick('.primary-matrix .column-header .axis-inline-input');
    if (!editor) throw Error('Completed heading did not become editable in same place');
    editor.value = '訂正した列名';
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    completedRename = label.textContent === '訂正した列名';
    parallelLabelMatches = parallel.querySelector('.column-header')?.textContent === '訂正した列名';
    const cardsAfter = [...main.querySelectorAll('.card-result-block'), ...parallel.querySelectorAll('.card-result-block')]
      .map(el => el.textContent);
    unchangedCardsAfterRename = JSON.stringify(cardsBefore) === JSON.stringify(cardsAfter);
  }
  return {
    keyboardColumnMoved, keyboardRowMoved, undoRestored, redoReapplied,
    touchColumnMoved, removedRow, deleteUndoRestored,
    completedRename, parallelLabelMatches, unchangedCardsAfterRename,
    actions,
    layout: { rows: reading.querySelectorAll('.primary-matrix .row-header').length,
      columns: reading.querySelectorAll('.primary-matrix .column-header').length },
    results: { primary: main.querySelectorAll('.card-detail-trigger').length,
      parallel: parallel.querySelectorAll('.card-detail-trigger').length },
    independentScrollRegions: Number(getComputedStyle(main).overflowX === 'auto') +
      Number(getComputedStyle(parallel).overflowX === 'auto'),
    copyAtTopToolbar: Boolean(pick('.reading-toolbar .copy-button:not(.hidden)')),
    copyNearCompletion: Boolean(pick('.heading-right-controls .copy-button:not(.hidden)') &&
      pick('.result-action-line .reading-status')?.textContent === '抽選完了'),
    copyFeedbackReady: Boolean(pick('.result-action-line .copy-feedback'))
  };
}

// Machine-executed UI interactions: not a child or human usability study.
async function axisWorkflowTask() {
  const one = q => document.querySelector(q);
  const all = q => [...document.querySelectorAll(q)];
  one('#newReadingButton').click();
  const reading = all('.reading-workbench').at(-1);
  reading.scrollIntoView({ block: 'start', behavior: 'instant' });
  const pick = q => reading.querySelector(q);
  const columnNames = () => [...reading.querySelectorAll('.column-header .axis-inline-label')].map(el => el.textContent);
  const rowNames = () => [...reading.querySelectorAll('.row-header .axis-inline-label')].map(el => el.textContent);
  const rename = (kind, index, value) => {
    const header = kind === 'row' ? '.row-header' : '.column-header';
    const button = reading.querySelectorAll(header + ' .axis-inline-label')[index];
    if (!button) throw Error('Heading absent for ' + kind + index);
    const holder = button.parentElement;
    button.click();
    const input = holder?.querySelector('.axis-inline-input');
    if (!input) throw Error('Editor missing for ' + kind + index);
    input.value = value;
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  };
  ['甲','乙','丙'].forEach((name, index) => rename('column', index, name));
  pick('.axis-add-row-header .axis-add-button').click();
  ['先','後'].forEach((name, index) => rename('row', index, name));
  const before = { columns: columnNames(), rows: rowNames() };
  const grip = (kind,index) => reading.querySelectorAll((kind === 'row' ? '.row-header' : '.column-header') + ' .axis-menu-trigger')[index];
  const actKey = (el, key) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  actKey(grip('column',0),'ArrowRight');
  const keyboardColumn = columnNames();
  pick('.axis-undo-button').click();
  const keyboardUndo = columnNames();
  pick('.axis-redo-button').click();
  const keyboardRedo = columnNames();
  pick('.axis-undo-button').click();
  grip('column',0).click();
  const menuLabels = [one('#moveAxisBeforeButton').textContent, one('#moveAxisAfterButton').textContent];
  one('#moveAxisAfterButton').click();
  const menuMove = columnNames();
  pick('.axis-undo-button').click();
  grip('column',1).click();
  const originalConfirm = window.confirm;
  window.confirm = () => true;
  one('#deleteAxisButton').click();
  window.confirm = originalConfirm;
  const afterDelete = columnNames();
  pick('.axis-undo-button').click();
  const deleteUndo = columnNames();
  actKey(grip('row',0),'ArrowDown');
  const keyboardRow = rowNames();
  pick('.axis-undo-button').click();
  const rowUndo = rowNames();
  return { before, keyboardColumn, keyboardUndo, keyboardRedo, menuLabels, menuMove,
    afterDelete, deleteUndo, keyboardRow, rowUndo,
    undoAvailable: !pick('.axis-undo-button').classList.contains('hidden'),
    grip: Boolean(grip('row',0)) && Boolean(grip('column',0)) };
}

function axisPointerGeometry() {
  const reading = [...document.querySelectorAll('.reading-workbench')].at(-1);
  reading.scrollIntoView({ block:'start', behavior:'instant' });
  const col = [...reading.querySelectorAll('.column-header')];
  const grip = col[0].querySelector('.axis-menu-trigger').getBoundingClientRect();
  const target = col[2].getBoundingClientRect();
  const at = r => ({ x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
  return { from: at(grip), to: at(target), xViewport: innerWidth };
}
function axisPointerResult() {
  const reading = [...document.querySelectorAll('.reading-workbench')].at(-1);
  return { order: [...reading.querySelectorAll('.column-header .axis-inline-label')].map(el=>el.textContent),
    dropIndicatorCount: reading.querySelectorAll('.axis-drop-target').length,
    undoVisible: !reading.querySelector('.axis-undo-button').classList.contains('hidden') };
}
function axisResetAndShuffle() {
  const reading = [...document.querySelectorAll('.reading-workbench')].at(-1);
  reading.querySelector('.axis-undo-button').click();
  const afterUndo = [...reading.querySelectorAll('.column-header .axis-inline-label')].map(el=>el.textContent);
  document.querySelector('.shuffle-button').click();
  return { afterUndo };
}
async function axisAfterShuffle() {
  const reading = [...document.querySelectorAll('.reading-workbench')].at(-1);
  for (let i=0;i<120 && reading.querySelectorAll('.pile-button').length!==3;i++) await new Promise(r=>setTimeout(r,100));
  const current = () => [...reading.querySelectorAll('.column-header .axis-inline-label')].map(el=>el.textContent);
  const grip = reading.querySelector('.column-header .axis-menu-trigger');
  const before = current();
  grip.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight', bubbles:true, cancelable:true}));
  const after = current();
  reading.querySelector('.axis-undo-button').click();
  const undo = current();
  return { pileCount:reading.querySelectorAll('.pile-button').length, before, after, undo,
    addButtonCount:reading.querySelectorAll('.axis-add-button').length,
    canMoveAfterShuffle:before[0]!==after[0] };
}

try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  browser = spawn(CHROME_BIN, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile, '--window-size=1440,1000', url
  ], { stdio: 'ignore' });
  const target = await waitForBrowser(url);
  cdp = new DevTools(target.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.call('Runtime.enable');
  await cdp.call('Page.enable');
  // A DevTools target can exist before the first document's JS context or UI.
  // Capturing empty DOM as a persona FAIL would be false observational evidence.
  await waitForAppReady();
  for (const width of [1440, 390, 320]) {
    await cdp.call('Emulation.setDeviceMetricsOverride', { width, height: 880, deviceScaleFactor: 1, mobile: width < 600 });
    let data;
    for (let attempt = 0; attempt < 20; attempt++) {
      data = await evaluate(discoverabilityProbe);
      if (data.width === width && data.addControlRect) break;
      await sleep(75);
    }
    if (data.width !== width || !data.addControlRect) {
      throw Error('Browser instrumentation did not reach the requested responsive viewport: ' +
        JSON.stringify({ requestedWidth: width, observedWidth: data.width, mounted: Boolean(data.addControlRect) }));
    }
    result('first-use-layout-' + width, 'child-like/novice proxy (NO child participant)', data);
    check('first-use-layout-' + width, 'no duplicate static caption+input', data.splitCaptionAndInput, false, !data.splitCaptionAndInput);
    check('first-use-layout-' + width, 'same-surface header edit entry', data.sameSurfaceEditor, true, data.sameSurfaceEditor);
    check('first-use-layout-' + width, 'card count inside layout context and absent from Reading title',
      { layout: data.countAtLayout, reading: data.countAtReading }, 'layout true, reading false',
      data.countAtLayout && !data.countAtReading);
    check('first-use-layout-' + width, 'minimum add control hit area 40x40', data.addControlRect,
      'width>=40,height>=40', Boolean(data.addControlRect && data.addControlRect.width >= 40 && data.addControlRect.height >= 40));
  }
  await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const novice = await evaluate(noviceTask);
  result('novice-complete-first-reading', 'first-time novice scripted proxy', novice);
  check('novice-complete-first-reading', 'six-card draw result', novice.focus.cards, 6, novice.focus.cards === 6);
  check('novice-complete-first-reading', 'same-surface heading commit and focus return',
    { committed: novice.focus.inlineHeaderCommitted, focusRestored: novice.focus.inlineHeaderFocusRestored },
    'both true', novice.focus.inlineHeaderCommitted && novice.focus.inlineHeaderFocusRestored);
  check('novice-complete-first-reading', 'editable labels after draw', novice.focus.resultCanEditHeader, true,
    novice.focus.resultCanEditHeader);
  check('novice-complete-first-reading', 'completion and copy in same viewport', novice.focus.feedbackDistancePx,
    'distance<viewport', novice.focus.withinSameViewport);
  check('novice-detail', 'five theme rows x five columns', novice.keyword.groups + 'x' + novice.keyword.cols,
    '5x5', novice.keyword.groups === 5 && novice.keyword.cols === 5);
  check('novice-detail', 'keyword header integrated into table', novice.keyword.headerInsideTable, true, novice.keyword.headerInsideTable);
  check('novice-detail', 'all vertical separators + row separators',
    { vertical: novice.keyword.internalVerticalLines, horizontal: novice.keyword.allHorizontalLines },
    'all true', novice.keyword.internalVerticalLines && novice.keyword.allHorizontalLines);
  check('novice-detail', 'strong thematic horizontal rules, pale vertical reading guides',
    novice.keyword.borderContrast,
    'horizontal >= 2.5x vertical; theme divider between', novice.keyword.guidesSubordinate);
  check('novice-detail', 'single continuous table without tile spacing',
    { collapse: novice.keyword.borderCollapse, spacing: novice.keyword.cellSpacing },
    'collapse', novice.keyword.borderCollapse === 'collapse');
  check('novice-detail', 'side-by-side orientation explanations', novice.keyword.orientationSideBySide, true, novice.keyword.orientationSideBySide);
  check('novice-detail', 'compact same-line title/orientation', novice.keyword.titleAndOrientationSingleLine, true, novice.keyword.titleAndOrientationSingleLine);
  check('novice-detail', 'vertical Japanese keyword writing', novice.keyword.textWritingMode, true, novice.keyword.textWritingMode);

  const expert = await evaluate(expertTask);
  result('expert-27x2', 'repeat/expert scripted proxy', expert);
  check('expert-27x2', 'arrow-key row/column reorder', 
    { row: expert.keyboardRowMoved, column: expert.keyboardColumnMoved }, 'both true',
    expert.keyboardRowMoved && expert.keyboardColumnMoved);
  check('expert-27x2', 'structural Undo and Redo preserve semantic order',
    { undo: expert.undoRestored, redo: expert.redoReapplied }, 'both true',
    expert.undoRestored && expert.redoReapplied);
  check('expert-27x2', 'scripted touch pointer drop moves a whole column', expert.touchColumnMoved,
    true, expert.touchColumnMoved);
  check('expert-27x2', 'row deletion Undo fully restores 3x9 geometry',
    { removed: expert.removedRow, restored: expert.deleteUndoRestored }, 'both true',
    expert.removedRow && expert.deleteUndoRestored);
  check('expert-27x2', '3x9 two independent piles', { layout: expert.layout, results: expert.results },
    '3x9, 27 primary +27 parallel', expert.layout.rows === 3 && expert.layout.columns === 9 &&
      expert.results.primary === 27 && expert.results.parallel === 27);
  check('expert-27x2', 'one coordinated result scroll region', expert.independentScrollRegions, 1,
    expert.independentScrollRegions <= 1);
  check('expert-27x2', 'copy action at completion', expert.copyNearCompletion, true, expert.copyNearCompletion);
  check('expert-27x2', 'copy feedback is colocated and toolbar has no redundant copy',
    { feedback: expert.copyFeedbackReady, toolbarDuplicate: expert.copyAtTopToolbar },
    'feedback true, duplicate false', expert.copyFeedbackReady && !expert.copyAtTopToolbar);
  check('expert-27x2', 'post-draw heading sync without changing cards',
    { renamed: expert.completedRename, parallel: expert.parallelLabelMatches, cardsUnchanged: expert.unchangedCardsAfterRename },
    'all true', expert.completedRename && expert.parallelLabelMatches && expert.unchangedCardsAfterRename);

  // This is a third fresh reading; earlier novice/expert draw results remain intact.
  const axis = await evaluate(axisWorkflowTask);
  result('axis-edit-and-reorder', 'keyboard / menu / novice recovery scripted proxy', axis);
  const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  check('axis-workflow', 'keyboard column move, undo, redo',
    {moved:axis.keyboardColumn,undo:axis.keyboardUndo,redo:axis.keyboardRedo},
    '乙甲丙 -> 甲乙丙 -> 乙甲丙',
    eq(axis.keyboardColumn,['乙','甲','丙']) && eq(axis.keyboardUndo,['甲','乙','丙']) &&
    eq(axis.keyboardRedo,['乙','甲','丙']));
  check('axis-workflow', 'contextual menu movement', axis.menuMove,
    ['乙','甲','丙'], eq(axis.menuMove,['乙','甲','丙']));
  check('axis-workflow', 'delete row/column is undoable', {afterDelete:axis.afterDelete,undo:axis.deleteUndo},
    '甲丙 -> 甲乙丙', eq(axis.afterDelete,['甲','丙']) && eq(axis.deleteUndo,['甲','乙','丙']));
  check('axis-workflow', 'keyboard row move and undo', {moved:axis.keyboardRow,undo:axis.rowUndo},
    '後先 -> 先後',eq(axis.keyboardRow,['後','先']) && eq(axis.rowUndo,['先','後']));
  const pos = await evaluate(axisPointerGeometry);
  for (const [type,point,buttons] of [
    ['mouseMoved',pos.from,0],['mousePressed',pos.from,1],
    ['mouseMoved',{x:pos.from.x+9,y:pos.from.y},1],
    ['mouseMoved',pos.to,1],['mouseReleased',pos.to,0]]) {
    await cdp.call('Input.dispatchMouseEvent',{ type, x:point.x, y:point.y,
      button: type==='mousePressed'||type==='mouseReleased'?'left':'none', buttons,
      clickCount:type==='mousePressed'?1:0 });
  }
  const drag = await evaluate(axisPointerResult);
  result('axis-real-chrome-mouse-drag', 'actual CDP Input mouse and browser hit-test', {pos,drag});
  check('axis-workflow', 'real Chrome mouse drag reorders column',drag.order,
    ['乙','丙','甲'],eq(drag.order,['乙','丙','甲']));
  check('axis-workflow', 'drag destination indicator clears after drop',drag.dropIndicatorCount,0,
    drag.dropIndicatorCount===0);
  const shuffleStart=await evaluate(axisResetAndShuffle);
  const shuffle=await evaluate(axisAfterShuffle);
  result('axis-post-shuffle', 'same fixed session scripted keyboard alternative', {shuffleStart,shuffle});
  check('axis-workflow','undo dragged move restores original order',shuffleStart.afterUndo,
    ['甲','乙','丙'],eq(shuffleStart.afterUndo,['甲','乙','丙']));
  check('axis-workflow','reorder and undo after shuffle without new session',
    {before:shuffle.before,after:shuffle.after,undo:shuffle.undo,piles:shuffle.pileCount},
    '3 original piles / names moved and undone',
    shuffle.pileCount===3 && eq(shuffle.before,['甲','乙','丙']) &&
    eq(shuffle.after,['乙','甲','丙']) && eq(shuffle.undo,['甲','乙','丙']));
  
  const failures = report.checks.filter(item => item.verdict === 'FAIL');
  report.summary = { passes: report.checks.length - failures.length, failures: failures.length,
    unverified: report.unverified.length, checks: report.checks.length };
  report.verdict = failures.length ? 'FAIL' : 'PASS';
} catch (error) {
  report.verdict = 'ERROR';
  report.runtimeError = String(error?.stack || error);
  console.error('UX_PERSONA_RUNTIME_ERROR=' + report.runtimeError);
} finally {
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log('UX_PERSONA_EVIDENCE=' + JSON.stringify({ reportPath, mode, verdict: report.verdict, summary: report.summary }));
  cdp?.close();
  browser?.kill();
  if (browser && browser.exitCode === null && browser.signalCode === null) {
    await Promise.race([once(browser, 'exit'), sleep(1500)]);
  }
  await new Promise(resolve => server.close(resolve));
  // Chrome's child processes may still be flushing cache files immediately after kill.
  await rm(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 150 });
}
const acceptedAxisFailure = report.checks.some(item => item.scenario === 'axis-workflow' && item.verdict !== 'PASS');
if (report.verdict === 'ERROR' || acceptedAxisFailure || (mode === 'gate' && report.verdict !== 'PASS')) process.exitCode = 1;
