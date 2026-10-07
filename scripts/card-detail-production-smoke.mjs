import { spawn, spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_BIN = process.env.CHROME_BIN || resolveChrome();
const DEBUG_PORT = 9233;
const PROD_ROOT = 'https://kinoko34077.github.io/tarot-draw/';
const PROD_URL = new URL(`?card-detail-smoke=${Date.now()}`, PROD_ROOT).toString();
const GRID_IMAGE_BUDGET = 64 * 1024;

function resolveChrome() {
  for (const command of ['google-chrome', 'chromium', 'chromium-browser']) {
    const found = spawnSync('which', [command], { encoding: 'utf8' });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  throw new Error('Chrome/Chromium executable not found.');
}

async function waitForTarget() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find(target => target.type === 'page');
        if (page) return page;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Chrome DevTools target did not become ready.');
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    };
  }

  async ready() {
    await new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = reject;
    });
  }

  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function mapLimited(values, limit, task) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      output[index] = await task(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return output;
}

async function verifyAllGridImageBudgets() {
  const manifestResponse = await fetch(new URL('assets/rws/manifest.json', PROD_ROOT), { cache: 'no-store' });
  if (!manifestResponse.ok) throw new Error(`Manifest fetch failed: ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  if (manifest.cards !== 78 || manifest.entries?.length !== 78) {
    throw new Error('Production WebP manifest does not contain 78 standard cards.');
  }
  if (manifest.max_bytes > GRID_IMAGE_BUDGET) {
    throw new Error(`Manifest max exceeds 64 KiB: ${manifest.max_bytes}`);
  }

  const measurements = await mapLimited(manifest.entries, 8, async entry => {
    const url = new URL(`assets/rws/${entry.file}`, PROD_ROOT);
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Asset fetch failed ${response.status}: ${url}`);
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/webp')) {
      throw new Error(`Unexpected asset type ${contentType}: ${url}`);
    }
    const bytes = (await response.arrayBuffer()).byteLength;
    return { card_id: entry.card_id, bytes, manifestBytes: entry.bytes };
  });

  for (const item of measurements) {
    if (item.bytes !== item.manifestBytes) {
      throw new Error(`Production asset size mismatch for ${item.card_id}: ${item.bytes} != ${item.manifestBytes}`);
    }
  }

  const largest = measurements.reduce((a, b) => b.bytes > a.bytes ? b : a);
  const total = measurements.reduce((sum, item) => sum + item.bytes, 0);
  const overBudget = measurements.filter(item => item.bytes > GRID_IMAGE_BUDGET);
  const summary = {
    cards: measurements.length,
    maxBytes: largest.bytes,
    maxCard: largest.card_id,
    averageBytes: Math.round(total / measurements.length),
    overBudget: overBudget.length,
    manifestAverageBytes: manifest.average_bytes,
    manifestMaxBytes: manifest.max_bytes
  };
  console.log('SELF_HOSTED_WEBP_BUDGET=' + JSON.stringify(summary));
  if (overBudget.length > 0) {
    throw new Error('Self-hosted WebP exceeds 64 KiB budget: ' + JSON.stringify(overBudget.slice(0, 10)));
  }
  return summary;
}

const profile = await mkdtemp(join(tmpdir(), 'tarot-card-detail-smoke-'));
const chrome = spawn(CHROME_BIN, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${profile}`,
  '--window-size=1440,1000',
  PROD_URL
], { stdio: ['ignore', 'pipe', 'pipe'] });

let stderr = '';
chrome.stderr.on('data', chunk => { stderr += chunk.toString(); });

try {
  const target = await waitForTarget();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.call('Runtime.enable');
  await cdp.call('Page.enable');
  await new Promise(resolve => setTimeout(resolve, 1800));

  const expression = `(async()=> {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const one = selector => document.querySelector(selector);
    const all = selector => [...document.querySelectorAll(selector)];
    const click = selector => {
      const element = one(selector);
      if (!element) throw new Error('Missing element: ' + selector);
      element.click();
    };

    if (!one('#cardDetailDialog')) throw new Error('Card detail dialog is not deployed.');

    for (let i = 0; i < 3; i += 1) click('.axis-add-header .axis-add-button');
    for (let i = 0; i < 2; i += 1) click('.axis-add-row-header .axis-add-button');
    await sleep(100);

    const setupColumns = all('.column-header');
    if (setupColumns.length !== 6 || all('.row-header').length !== 3) throw new Error('3x6 setup failed.');

    click('.shuffle-button');
    for (let i = 0; i < 120 && all('.pile-button').length < 3; i += 1) await sleep(100);
    const pile = all('.pile-button').find(button => !button.disabled);
    if (!pile) throw new Error('No selectable pile.');
    pile.click();
    click('.draw-button');

    for (let i = 0; i < 180 && one('.reading-status').textContent !== '抽選完了'; i += 1) await sleep(100);
    if (one('.reading-status').textContent !== '抽選完了') throw new Error('Draw did not complete.');

    for (let i = 0; i < 160; i += 1) {
      const images = all('img.card-art');
      if (images.length > 0 && images.every(image => image.complete)) break;
      await sleep(100);
    }

    const cellWidths = all('.primary-matrix .reading-cell').map(cell => Math.round(cell.getBoundingClientRect().width));
    const maxCellWidth = Math.max(...cellWidths);
    if (maxCellWidth > 112) throw new Error('Result column is wider than compact contract: ' + maxCellWidth);

    const firstTitle = one('.primary-matrix .card-title');
    const firstOrientation = one('.primary-matrix .card-orientation');
    if (!firstTitle || !firstOrientation) throw new Error('Split title/orientation spans missing.');
    const titleRect = firstTitle.getBoundingClientRect();
    const orientationRect = firstOrientation.getBoundingClientRect();
    if (orientationRect.top < titleRect.bottom - 1) throw new Error('Title and orientation are not vertically separated.');

    const standardTrigger = all('.primary-matrix .card-detail-trigger')
      .find(trigger => trigger.querySelector('img.card-art'));
    if (!standardTrigger) throw new Error('No standard-card trigger found.');

    const gridImage = standardTrigger.querySelector('img.card-art');
    if (!gridImage.src.includes('/assets/rws/') || !gridImage.src.endsWith('.webp')) {
      throw new Error('Grid image is not using a self-hosted WebP asset.');
    }

    const triggerTitle = standardTrigger.querySelector('.card-title').textContent;
    const triggerOrientation = standardTrigger.querySelector('.card-orientation').textContent;

    standardTrigger.click();
    await sleep(250);
    const dialog = one('#cardDetailDialog');
    if (!dialog.open) throw new Error('Detail dialog did not open.');
    if (one('#cardDetailTitle').textContent !== triggerTitle) throw new Error('Detail title mismatch.');
    if (!one('#cardDetailEssence').textContent || !one('#cardDetailUpright').textContent || !one('#cardDetailReversed').textContent) {
      throw new Error('Attachment-backed detail text is missing.');
    }

    const active = one('.detail-meaning[data-active="true"]');
    const expectedActiveId = triggerOrientation === '逆位置' ? 'cardDetailReversedBlock' : 'cardDetailUprightBlock';
    if (active?.id !== expectedActiveId) throw new Error('Actual orientation meaning is not emphasized.');

    const detailImage = one('#cardDetailVisual img.card-art');
    if (!detailImage || detailImage.src !== gridImage.src) {
      throw new Error('Detail view did not reuse the same self-hosted WebP asset.');
    }
    for (let i = 0; i < 80 && !detailImage.complete; i += 1) await sleep(50);
    if (detailImage.naturalWidth <= 0) throw new Error('Detail image failed to load.');
    if ((triggerOrientation === '逆位置') !== detailImage.classList.contains('is-reversed')) {
      throw new Error('Detail image orientation mismatch.');
    }

    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await sleep(80);
    const backdropClosed = !dialog.open;
    const backdropFocusRestored = document.activeElement === standardTrigger;
    if (!backdropClosed || !backdropFocusRestored) throw new Error('Backdrop close/focus restore failed.');

    standardTrigger.click();
    await sleep(80);
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await sleep(80);
    const escapeClosed = !dialog.open;
    const escapeFocusRestored = document.activeElement === standardTrigger;
    if (!escapeClosed || !escapeFocusRestored) throw new Error('Escape close/focus restore failed.');

    standardTrigger.click();
    await sleep(80);
    one('#cardDetailClose').click();
    await sleep(80);
    const buttonClosed = !dialog.open;
    const buttonFocusRestored = document.activeElement === standardTrigger;
    if (!buttonClosed || !buttonFocusRestored) throw new Error('Close button/focus restore failed.');

    const resourceSizes = performance.getEntriesByType('resource')
      .filter(entry => entry.initiatorType === 'img' && entry.name.includes('/assets/rws/') && entry.name.endsWith('.webp'))
      .map(entry => entry.transferSize || entry.encodedBodySize || 0)
      .filter(size => size > 0);
    if (resourceSizes.some(size => size > 65536)) throw new Error('Browser WebP resource timing exceeded 64 KiB.');

    return {
      maxCellWidth,
      columns: setupColumns.length,
      titleOrientationSplit: true,
      backdropClosed,
      escapeClosed,
      buttonClosed,
      focusRestored: backdropFocusRestored && escapeFocusRestored && buttonFocusRestored,
      assetFormat: 'webp',
      sameAssetReused: detailImage.src === gridImage.src,
      detailTitle: triggerTitle,
      detailOrientation: triggerOrientation,
      browserMeasuredImages: resourceSizes.length,
      browserMaxImageBytes: resourceSizes.length ? Math.max(...resourceSizes) : null
    };
  })()`;

  const evaluated = await cdp.call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (evaluated.exceptionDetails) {
    throw new Error(evaluated.exceptionDetails.exception?.description || 'Card detail runtime exception.');
  }

  const browserResult = evaluated.result.value;
  console.log('CARD_DETAIL_BROWSER=' + JSON.stringify(browserResult));

  const screenshot = await cdp.call('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  });
  await writeFile('card-detail-smoke.png', Buffer.from(screenshot.data, 'base64'));

  const budgetResult = await verifyAllGridImageBudgets();
  console.log('CARD_DETAIL_SMOKE=' + JSON.stringify({ browser: browserResult, imageBudget: budgetResult }));
  cdp.close();
} catch (error) {
  console.error(error);
  if (stderr) console.error(stderr);
  process.exitCode = 1;
} finally {
  chrome.kill('SIGTERM');
}
