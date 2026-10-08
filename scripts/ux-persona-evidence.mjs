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
  for (let attempt = 0; attempt < 25; attempt++) {
    const reply = await cdp.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (!reply.exceptionDetails) return reply.result.value;
    const message = reply.exceptionDetails.exception?.description || 'Unknown Chrome exception';
    if (!message.includes('Cannot find default execution context') || attempt === 24) throw Error(message);
    await sleep(100);
  }
}

const report = {
  schema: 'tarot-ux-persona-evidence.v1',
  mode,
  origin: 'real local Chromium + local Node API; synthetic scripted actions, NOT actual children, novices or experts',
  policy: ['03_Development_Specification_Principles.md §15', '利用者起点 UI-UX 設計原則', 'devflow#161/#176/#177', '.ai-guidelines#23'],
  commit: process.env.GITHUB_SHA || 'LOCAL_HEAD_UNSPECIFIED',
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
    sameSurfaceEditor: Boolean($('.column-header [contenteditable],.column-header .axis-inline-edit')),
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
  const col = $('.column-header .axis-input');
  if (col) {
    col.value = '過去';
    col.dispatchEvent(new Event('input', { bubbles: true }));
    actions.push('type:col');
  }
  click('.axis-add-row-header .axis-add-button');
  const focus = $('.column-header .axis-input');
  focus?.focus();
  const focusBefore = document.activeElement === focus;
  click('.axis-add-header .axis-add-button');
  const focusAfter = document.activeElement === focus;
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
    resultCanEditHeader: Boolean(reading.querySelector('.primary-matrix .column-header input,.primary-matrix .column-header [contenteditable],.primary-matrix .column-header .axis-inline-edit')),
    inputFocusBeforeRerender: focusBefore,
    inputFocusAfterRerender: focusAfter
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
  const key = {
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
  pick('.shuffle-button').click();
  actions++;
  await poll(() => [...reading.querySelectorAll('.pile-button')].filter(el => !el.disabled).length >= 2, 'piles ready');
  const piles = [...reading.querySelectorAll('.pile-button')].filter(el => !el.disabled);
  piles[0].click();
  piles[1].click();
  actions += 2;
  pick('.draw-button').click();
  actions++;
  await poll(() => pick('.reading-status')?.textContent === '抽選完了', 'two-pile draw');
  const main = pick('.primary-matrix');
  const parallel = pick('.parallel-matrix');
  return {
    actions,
    layout: { rows: reading.querySelectorAll('.primary-matrix .row-header').length,
      columns: reading.querySelectorAll('.primary-matrix .column-header').length },
    results: { primary: main.querySelectorAll('.card-detail-trigger').length,
      parallel: parallel.querySelectorAll('.card-detail-trigger').length },
    independentScrollRegions: Number(getComputedStyle(main).overflowX === 'auto') +
      Number(getComputedStyle(parallel).overflowX === 'auto'),
    copyAtTopToolbar: Boolean(pick('.reading-toolbar .copy-button:not(.hidden)')),
    copyNearCompletion: Boolean(pick('.reading-status .copy-button'))
  };
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
  for (const width of [1440, 390, 320]) {
    await cdp.call('Emulation.setDeviceMetricsOverride', { width, height: 880, deviceScaleFactor: 1, mobile: width < 600 });
    const data = await evaluate(discoverabilityProbe);
    result('first-use-layout-' + width, 'child-like/novice proxy (NO child participant)', data);
    check('first-use-layout-' + width, 'no duplicate static caption+input', data.splitCaptionAndInput, false, !data.splitCaptionAndInput);
    check('first-use-layout-' + width, 'card count inside layout context', data.countAtLayout, true, data.countAtLayout);
    check('first-use-layout-' + width, 'minimum add control hit area 40x40', data.addControlRect,
      'width>=40,height>=40', Boolean(data.addControlRect && data.addControlRect.width >= 40 && data.addControlRect.height >= 40));
  }
  await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const novice = await evaluate(noviceTask);
  result('novice-complete-first-reading', 'first-time novice scripted proxy', novice);
  check('novice-complete-first-reading', 'six-card draw result', novice.focus.cards, 6, novice.focus.cards === 6);
  check('novice-complete-first-reading', 'caret focus stable across structural update',
    novice.focus.inputFocusAfterRerender, true, novice.focus.inputFocusAfterRerender);
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
  check('novice-detail', 'single continuous table without tile spacing',
    { collapse: novice.keyword.borderCollapse, spacing: novice.keyword.cellSpacing },
    'collapse', novice.keyword.borderCollapse === 'collapse');
  check('novice-detail', 'side-by-side orientation explanations', novice.keyword.orientationSideBySide, true, novice.keyword.orientationSideBySide);
  check('novice-detail', 'compact same-line title/orientation', novice.keyword.titleAndOrientationSingleLine, true, novice.keyword.titleAndOrientationSingleLine);
  check('novice-detail', 'vertical Japanese keyword writing', novice.keyword.textWritingMode, true, novice.keyword.textWritingMode);

  const expert = await evaluate(expertTask);
  result('expert-27x2', 'repeat/expert scripted proxy', expert);
  check('expert-27x2', '3x9 two independent piles', { layout: expert.layout, results: expert.results },
    '3x9, 27 primary +27 parallel', expert.layout.rows === 3 && expert.layout.columns === 9 &&
      expert.results.primary === 27 && expert.results.parallel === 27);
  check('expert-27x2', 'one coordinated result scroll region', expert.independentScrollRegions, 1,
    expert.independentScrollRegions <= 1);
  check('expert-27x2', 'copy action at completion', expert.copyNearCompletion, true, expert.copyNearCompletion);

  const failures = report.checks.filter(item => item.verdict === 'FAIL');
  report.summary = { passes: report.checks.length - failures.length, failures: failures.length,
    unverified: report.unverified.length, checks: report.checks.length };
  report.verdict = failures.length ? 'FAIL' : 'PASS';
} catch (error) {
  report.verdict = 'ERROR';
  report.runtimeError = String(error?.stack || error);
} finally {
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log('UX_PERSONA_EVIDENCE=' + JSON.stringify({ reportPath, mode, verdict: report.verdict, summary: report.summary }));
  cdp?.close();
  browser?.kill();
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
if (report.verdict === 'ERROR' || (mode === 'gate' && report.verdict !== 'PASS')) process.exitCode = 1;
