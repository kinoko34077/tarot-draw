// Branch-only real-browser verification of Issues #26/#28/#30, without touching public Pages.
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
    if (all('.keyword-grid-group').length !== 5 || all('.keyword-grid-group li').length !== 20) throw Error('Missing 5 rows and 20 terms');
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
    if (!(gridRect.left > visualRect.left && Math.abs(gridRect.top - visualRect.top) <= 3)) throw Error('Desktop artwork not left of keyword rows');
    if (visualRect.width < 180) throw Error('Desktop artwork not enlarged');
    const groupRows = all('.keyword-grid-group');
    if (!groupRows.every((row, index) => index === 0 || row.getBoundingClientRect().top > groupRows[index - 1].getBoundingClientRect().top)) throw Error('Five headings are not vertically stacked');
    if (!groupRows.every(row => row.querySelector('h3').getBoundingClientRect().right < row.querySelector('li').getBoundingClientRect().left)) throw Error('Rows do not place four terms after their heading');
    const dialog = one('#cardDetailDialog');
    if (dialog.getBoundingClientRect().height < window.innerHeight * .85) throw Error('Dialog height not expanded');
    if (!one('.keyword-grid-note').textContent.includes('正位置・逆位置の両面')) throw Error('Missing keyword scope note');
    if (one('#cardDetailSourceInfo').open) throw Error('Source info shown by default');
    const essenceSize = parseFloat(getComputedStyle(one('#cardDetailEssence')).fontSize);
    const uprightSize = parseFloat(getComputedStyle(one('#cardDetailUpright')).fontSize);
    if (essenceSize <= uprightSize) throw Error('Essence is not larger than upright/reversed descriptions');
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
    const rows = [...host.querySelectorAll('.keyword-grid-group')];
    if (!host || !image || rows.length !== 5) throw Error('Missing mobile portrait rows');
    if (host.scrollWidth > host.clientWidth + 1) throw Error('Keyword area still overflows horizontally');
    host.scrollLeft = 999;
    if (host.scrollLeft !== 0) throw Error('Keyword area is still horizontally scrollable');
    const bounds = host.getBoundingClientRect();
    if (rows.some(row => row.getBoundingClientRect().right > bounds.right + 1)) throw Error('Keyword row clipped on mobile');
    if (image.querySelector('img')?.getBoundingClientRect().width < 130) throw Error('Mobile card art not enlarged');
    if (image.getBoundingClientRect().top >= host.getBoundingClientRect().top) throw Error('Mobile card image not above keyword rows');
    const visibleText = [...host.querySelectorAll('li')].every(el => el.textContent.trim().length > 0);
    if (!visibleText) throw Error('Mobile keywords missing text');
    const shortLabels = [...host.querySelectorAll('h3, li')];
    if (shortLabels.some(el => [...el.textContent.trim()].length > 6)) throw Error('Keyword too long in browser');
    if (shortLabels.some(el => el.getBoundingClientRect().height > 40)) throw Error('Keyword wraps visually');
    if (!one('#cardDetailDialog').open) throw Error('Mobile resize closed dialog');
    return {width: window.innerWidth, scrollWidth: host.scrollWidth, clientWidth: host.clientWidth, horizontalScrollLeft: host.scrollLeft, artworkWidth: image.querySelector('img')?.getBoundingClientRect().width, termsVisibleInDOM: visibleText};
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
  // Exercise the complete data module in the browser and every real API-drawn
  // trigger present in this two-pile reading, rather than only one prototype.
  const coverage = await evaluate(`(async () => {
    const { CARD_KEYWORD_GRIDS, keywordGridDraft } =
      await import(window.location.origin + '/card-keyword-grid.js');
    const ids = Object.keys(CARD_KEYWORD_GRIDS);
    if (ids.length !== 78) throw Error('Browser module has ' + ids.length + ' cards');
    for (const id of ids) {
      const groups = keywordGridDraft(id);
      if (groups?.length !== 5 || groups.some(group => group.terms.length !== 4)) {
        throw Error('Invalid browser keyword record: ' + id);
      }
    }
    if (keywordGridDraft('meta.title') || keywordGridDraft('meta.guarantee')) {
      throw Error('Custom card keywords are forbidden');
    }
    const dialog = document.querySelector('#cardDetailDialog');
    const host = document.querySelector('#cardDetailKeywordGrid');
    const triggers = [...document.querySelectorAll('.card-detail-trigger')];
    if (triggers.length < 27) throw Error('Not enough real card results for UI coverage');
    let standard = 0;
    let custom = 0;
    for (const trigger of triggers) {
      const hasImage = Boolean(trigger.querySelector('img.card-art'));
      const hasCustomFace = Boolean(trigger.querySelector('.custom-card-face'));
      if (!hasImage && !hasCustomFace) throw Error('Card result has no visual');
      trigger.click();
      if (!dialog.open) throw Error('Card detail failed to open in coverage iteration');
      if (hasImage) {
        const groups = host.querySelectorAll('.keyword-grid-group');
        const terms = host.querySelectorAll('.keyword-grid-group li');
        if (host.classList.contains('hidden') || groups.length !== 5 || terms.length !== 20) {
          throw Error('Rendered grid missing on ' + trigger.getAttribute('aria-label'));
        }
        if (host.scrollWidth > host.clientWidth + 1 || host.scrollLeft !== 0) throw Error('Opened card has horizontal keyword overflow');
        if (document.querySelector('#cardDetailSourceInfo').open) throw Error('Source popover leaked between cards');
        if (!document.querySelector('#cardDetailEssence').textContent) throw Error('Legacy card meaning missing');
        const detailImage = document.querySelector('#cardDetailVisual img.detail-card-art');
        if (!detailImage) throw Error('Detail artwork missing');
        if (detailImage.classList.contains('is-reversed') !==
          trigger.querySelector('img.card-art').classList.contains('is-reversed')) {
          throw Error('Reverse artwork state mismatch');
        }
        standard += 1;
      } else {
        if (!host.classList.contains('hidden')) throw Error('Custom card leaked standard keywords');
        custom += 1;
      }
      document.querySelector('#cardDetailClose').click();
      // The native 'close' event (where focus is restored) is dispatched async.
      for (let attempt = 0; attempt < 20 &&
        (dialog.open || document.activeElement !== trigger); attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      if (dialog.open || document.activeElement !== trigger) {
        throw Error('Dialog close/focus return regression: ' + trigger.getAttribute('aria-label'));
      }
    }
    return {records: ids.length, actualResultTriggers: triggers.length, standardDetails: standard, customDetails: custom};
  })()`);
  // Exercise native keyboard interaction for the source disclosure and ensure that
  // horizontal touch panning does not move the keyword area in the row layout.
  const infoTrigger = await evaluate(`(() => {
    const trigger = [...document.querySelectorAll('.card-detail-trigger')]
      .find(button => button.querySelector('img.card-art'));
    if (!trigger) throw Error('No standard result for source-info check');
    trigger.click();
    const info = document.querySelector('#cardDetailSourceInfo');
    if (info.open) throw Error('Source panel already open');
    const summary = info.querySelector('summary');
    summary.focus();
    const rect = document.querySelector('#cardDetailKeywordGrid').getBoundingClientRect();
    return {
      focusable: document.activeElement === summary,
      x: Math.round(rect.right - 24),
      y: Math.round(Math.min(rect.bottom - 12, rect.top + 94))
    };
  })()`);
  if (!infoTrigger.focusable) throw Error('Source-info button cannot receive keyboard focus');
  await cdp.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  const popup = await evaluate(`(() => {
    const info = document.querySelector('#cardDetailSourceInfo');
    const surface = info.querySelector('.keyword-source-popover');
    const r = surface.getBoundingClientRect();
    return {
      open: info.open,
      link: info.querySelector('a')?.href,
      content: surface.textContent,
      fitsViewport: r.left >= 0 && r.right <= window.innerWidth + 1
    };
  })()`);
  if (!popup.open || !popup.link?.includes('Tarotoo-com') || !popup.content.includes('MIT') || !popup.fitsViewport) {
    throw Error('Source popup failed: ' + JSON.stringify(popup));
  }
  await cdp.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const escapePopup = await evaluate(`(() => ({
    popupClosed: !document.querySelector('#cardDetailSourceInfo').open,
    dialogStayedOpen: document.querySelector('#cardDetailDialog').open,
    summaryFocused: document.activeElement === document.querySelector('#cardDetailSourceInfo summary')
  }))()`);
  if (!escapePopup.popupClosed || !escapePopup.dialogStayedOpen || !escapePopup.summaryFocused) {
    throw Error('Escape failed to dismiss only the source popup and restore its focus');
  }
  const outside = await evaluate(`(() => {
    const info = document.querySelector('#cardDetailSourceInfo');
    info.querySelector('summary').click();
    if (!info.open) throw Error('Click failed to reopen source popup');
    document.querySelector('.keyword-grid-note').click();
    return {dismissed: !info.open,dialogOpen: document.querySelector('#cardDetailDialog').open};
  })()`);
  if (!outside.dismissed || !outside.dialogOpen) throw Error('Click outside did not dismiss source popup');

  await cdp.call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const touch = (x, y) => ({x, y});
  const startX = infoTrigger.x;
  const y = infoTrigger.y;
  await cdp.call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(startX, y)] });
  for (let delta = 30; delta <= 180; delta += 30) {
    await cdp.call('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [touch(startX - delta, y)]
    });
    await pause(30);
  }
  await cdp.call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pause(200);
  const touchScroll = await evaluate("document.querySelector('#cardDetailKeywordGrid').scrollLeft");
  await cdp.call('Emulation.setTouchEmulationEnabled', { enabled: false });
  if (touchScroll !== 0) throw Error('Horizontal touch pan moved the keyword area');

  await cdp.call('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await pause(100);
  const zoom = await evaluate(`(() => ({
    scale: window.visualViewport?.scale ?? 1,
    scrollWidth: document.querySelector('#cardDetailKeywordGrid').scrollWidth,
    clientWidth: document.querySelector('#cardDetailKeywordGrid').clientWidth,
    detailOpen: document.querySelector('#cardDetailDialog').open
  }))()`);
  if (!zoom.detailOpen || zoom.scale < 1.9 || zoom.scrollWidth > zoom.clientWidth + 1) {
    throw Error('200% mobile zoom introduces keyword horizontal overflow or obscures the dialog');
  }
  await cdp.call('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await cdp.call('Emulation.setDeviceMetricsOverride', {
    width: 320, height: 720, deviceScaleFactor: 1, mobile: true
  });
  await pause(120);
  const narrow = await evaluate(`(() => {
    const host = document.querySelector('#cardDetailKeywordGrid');
    const image = document.querySelector('#cardDetailVisual img.detail-card-art');
    const dialog = document.querySelector('#cardDetailDialog');
    return {
      viewportWidth: window.innerWidth,
      clientWidth: host.clientWidth,
      scrollWidth: host.scrollWidth,
      cardWidth: image.getBoundingClientRect().width,
      groupCount: document.querySelectorAll('.keyword-grid-group').length,
      dialogHeight: dialog.getBoundingClientRect().height
    };
  })()`);
  if (narrow.viewportWidth !== 320 || narrow.scrollWidth > narrow.clientWidth + 1 ||
    narrow.cardWidth < 130 || narrow.groupCount !== 5 || narrow.dialogHeight < 680) {
    throw Error('320px portrait reflow fails no-horizontal-scroll, image size or dialog height');
  }
  await evaluate("document.querySelector('#cardDetailClose').click()");
  console.log('KEYWORD_GRID_BROWSER=' + JSON.stringify({
    sample: picked, mobile, close, coverage,
    inputModes: {popup, escapePopup, outside, touchScroll, zoom, narrow}
  }));
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
