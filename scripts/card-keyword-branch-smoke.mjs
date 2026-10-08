// Branch-only real-browser verification of Issue #26, without touching public Pages.
// Uses the repo's actual Node HTTP server + API/draw UI and Chrome DevTools Protocol.
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTarotServer } from '../src/server.js';

const CHROME_BIN = process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser']
  .map(name => spawnSync('which', [name], { encoding: 'utf8' }))
  .find(found => found.status === 0)?.stdout.trim();
if (!CHROME_BIN) throw new Error('Chrome or Chromium not installed');
const DEBUG_PORT = 9294;
const server = createTarotServer();
const profile = await mkdtemp(join(tmpdir(), 'tarot-keyword-branch-'));
let chrome;
let cdp;

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

class DevTools {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.pending = new Map();
    this.nextId = 0;
    this.socket.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      const item = this.pending.get(msg.id);
      if (!item) return;
      this.pending.delete(msg.id);
      if (msg.error) item.reject(Error(JSON.stringify(msg.error)));
      else item.resolve(msg.result);
    };
  }
  async ready() {
    await new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = reject;
    });
  }
  call(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.socket.close(); }
}

async function evaluate(expression) {
  // A newly opened headless tab may briefly have no default JS context after Page.enable.
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      const result = await cdp.call('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? 'CDP evaluation exception');
      return result.result.value;
    } catch (error) {
      if (!String(error.message).includes('Cannot find default execution context') || attempt === 24) throw error;
      await pause(150);
    }
  }
}

async function screenshot(path) {
  const result = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(path, Buffer.from(result.data, 'base64'));
}

try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const localUrl = 'http://127.0.0.1:' + server.address().port + '/';
  chrome = spawn(CHROME_BIN, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=' + DEBUG_PORT,
    '--user-data-dir=' + profile, '--window-size=1440,1000', localUrl
  ], { stdio: 'ignore' });

  let target;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:' + DEBUG_PORT + '/json/list');
      const pages = response.ok ? await response.json() : [];
      target = pages.find(page => page.type === 'page' && page.url.startsWith(localUrl));
      if (target) break;
    } catch {}
    await pause(250);
  }
  if (!target) throw Error('Local Chrome tab did not start');
  cdp = new DevTools(target.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.call('Runtime.enable');
  await cdp.call('Page.enable');

  const picked = await evaluate(`(async () => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const one = q => document.querySelector(q);
    const all = q => [...document.querySelectorAll(q)];
    for (let attempt = 0; attempt < 80 && !one('.shuffle-button'); attempt++) await sleep(50);
    if (!one('.shuffle-button')) throw Error('Local JS app did not load');
    for (let i = 0; i < 6; i++) one('.axis-add-header .axis-add-button').click();
    for (let i = 0; i < 2; i++) one('.axis-add-row-header .axis-add-button').click();
    if (all('.column-header').length !== 9 || all('.row-header').length !== 3) throw Error('3x9 setup failed');
    one('.shuffle-button').click();
    for (let i = 0; i < 120 && all('.pile-button').length < 3; i++) await sleep(100);
    const piles = all('.pile-button').filter(button => !button.disabled);
    if (piles.length < 2) throw Error('Two pile choices unavailable');
    piles[0].click();
    piles[1].click();
    one('.draw-button').click();
    for (let i = 0; i < 160 && !all('.reading-status').some(el => el.textContent === '抽選完了'); i++) await sleep(100);
    if (!all('.reading-status').some(el => el.textContent === '抽選完了')) throw Error('Local draw did not complete');
    const samples = ['major-fool', 'major-death', 'major-devil', 'minor-swords-3', 'minor-cups-ace'];
    const hits = all('.card-detail-trigger').filter(button => samples.some(id =>
      button.querySelector('img.card-art')?.src.endsWith('/' + id + '.webp')));
    if (!hits.length) throw Error('No sample among 54-card two-pile reading');
    const hit = hits[0];
    const cardAsset = hit.querySelector('img.card-art').src.split('/').at(-1);
    const reversed = hit.querySelector('.card-art').classList.contains('is-reversed');
    hit.click();
    for (let i = 0; i < 80 && !one('#cardDetailDialog').open; i++) await sleep(50);
    if (!one('#cardDetailDialog').open) throw Error('Detail dialog did not open');
    if (all('.keyword-grid-group').length !== 5 || all('.keyword-grid-group li').length !== 20) throw Error('Missing 5x4 grid');
    if (!one('#cardDetailEssence').textContent || !one('#cardDetailUpright').textContent || !one('#cardDetailReversed').textContent) throw Error('Legacy meanings missing');
    const image = one('#cardDetailVisual img.detail-card-art');
    if (!image) throw Error('Detail RWS image not rendered');
    for (let i = 0; i < 50 && !image.complete; i++) await sleep(50);
    if (!image.naturalWidth) throw Error('RWS detail image failed');
    if (image.classList.contains('is-reversed') !== reversed) throw Error('Artwork reverse flag mismatch');
    const active = one('.detail-meaning[data-active="true"]');
    if (active?.id !== (reversed ? 'cardDetailReversedBlock' : 'cardDetailUprightBlock')) throw Error('Orientation highlight mismatch');
    const visualRect = one('#cardDetailVisual').getBoundingClientRect();
    const gridRect = one('#cardDetailKeywordGrid').getBoundingClientRect();
    if (!(gridRect.left > visualRect.left && Math.abs(gridRect.top - visualRect.top) <= 3)) throw Error('Desktop artwork not left of 5 columns');
    return {cardAsset, reversed, desktop: {visualLeft: visualRect.left, gridLeft: gridRect.left, columns: all('.keyword-grid-group').length, terms: all('.keyword-grid-group li').length}};
  })()`);
  await screenshot('keyword-grid-desktop.png');
  await cdp.call('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true
  });
  await pause(150);
  const mobile = await evaluate(`(() => {
    const one = q => document.querySelector(q);
    const host = one('#cardDetailKeywordGrid');
    const image = one('#cardDetailVisual');
    const column = one('.keyword-grid-group');
    if (!host || !image || !column) throw Error('Missing mobile layout');
    const before = host.scrollLeft;
    host.scrollLeft = host.scrollWidth;
    const after = host.scrollLeft;
    if (host.scrollWidth <= host.clientWidth || after <= before) throw Error('Five columns cannot scroll horizontally');
    if (image.getBoundingClientRect().width < 75) throw Error('Card artwork collapsed on mobile');
    const visibleText = [...host.querySelectorAll('li')].every(el => el.textContent.trim().length > 0);
    if (!visibleText) throw Error('Mobile keywords missing text');
    if (!one('#cardDetailDialog').open) throw Error('Mobile resize closed dialog');
    return {width: window.innerWidth, scrollWidth: host.scrollWidth, clientWidth: host.clientWidth, scrolledTo: after, artworkWidth: image.getBoundingClientRect().width, termsVisibleInDOM: visibleText};
  })()`);
  await screenshot('keyword-grid-mobile.png');
  const close = await evaluate(`(async () => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const dialog = document.querySelector('#cardDetailDialog');
    const trigger = [...document.querySelectorAll('.card-detail-trigger')].find(button => button.querySelector('img.card-art')?.src.endsWith('/' + ${JSON.stringify(picked.cardAsset)}));
    if (!trigger) throw Error('Original trigger missing');
    dialog.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true}));
    await sleep(75);
    if (dialog.open || document.activeElement !== trigger) throw Error('Escape/focus return failed');
    trigger.click();
    await sleep(75);
    document.querySelector('#cardDetailClose').click();
    await sleep(75);
    if (dialog.open || document.activeElement !== trigger) throw Error('Close button/focus return failed');
    trigger.click();
    await sleep(75);
    dialog.dispatchEvent(new MouseEvent('click', {bubbles:true}));
    await sleep(75);
    if (dialog.open || document.activeElement !== trigger) throw Error('Backdrop/focus return failed');
    return {escape:true,button:true,backdrop:true,focusReturn:true};
  })()`);
  console.log('KEYWORD_GRID_BROWSER=' + JSON.stringify({sample: picked, mobile, close}));
  cdp.close();
  cdp = null;
} finally {
  cdp?.close();
  // Chrome may still write its profile after SIGTERM; wait for child exit before removal.
  if (chrome) {
    const exit = chrome.exitCode !== null || chrome.signalCode !== null
      ? Promise.resolve()
      : once(chrome, 'exit');
    chrome.kill('SIGTERM');
    await Promise.race([exit, pause(2500)]);
    if (chrome.exitCode === null && chrome.signalCode === null) {
      const forceExit = once(chrome, 'exit');
      chrome.kill('SIGKILL');
      await Promise.race([forceExit, pause(2500)]);
    }
  }
  await new Promise(resolve => server.close(resolve));
  // Some Chrome helpers release files just after the browser process exits.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rm(profile, { recursive: true, force: true });
      break;
    } catch (error) {
      if (attempt === 5 || !['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
      await pause(250);
    }
  }
}
