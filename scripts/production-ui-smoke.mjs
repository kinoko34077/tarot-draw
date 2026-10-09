import { spawn, spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_BIN = process.env.CHROME_BIN || resolveChrome();
const DEBUG_PORT = 9222;
const PROD_URL = `https://kinoko34077.github.io/tarot-draw/?smoke=${Date.now()}`;

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
        const page = targets.find(target => target.type === 'page' &&
          target.url.startsWith('https://kinoko34077.github.io/tarot-draw/'));
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

const profile = await mkdtemp(join(tmpdir(), 'tarot-prod-smoke-'));
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
  try {
    await cdp.call('Browser.grantPermissions', {
      origin: 'https://kinoko34077.github.io',
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite']
    });
  } catch {}

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

    // Connecting to Chrome or seeing the static HTML does not mean JS has
    // mounted the reading. Observe the actual ready-to-use action, not a timer.
    for (let attempt = 0; attempt < 150 && !one('.axis-add-header .axis-add-button'); attempt++) {
      await sleep(100);
    }
    if (!one('.axis-add-header .axis-add-button')) {
      throw new Error('Published UI did not render an editable reading: ' +
        JSON.stringify({ url: location.href, readyState: document.readyState,
          readingCount: all('.reading-workbench').length,
          title: document.title, bodyStart: document.body?.textContent?.slice(0, 220) }));
    }

    if (one('#rowCount') || one('#columnCount')) throw new Error('Stale numeric dimension controls are deployed.');
    if (!one('#readings') || !one('#axisMenu')) throw new Error('Expected #13 workspace is not deployed.');

    for (let i = 0; i < 3; i += 1) {
      click('.axis-add-header .axis-add-button');
      await sleep(35);
    }
    for (let i = 0; i < 2; i += 1) {
      click('.axis-add-row-header .axis-add-button');
      await sleep(35);
    }

    if (all('.column-header').length !== 6 || all('.row-header').length !== 3) {
      throw new Error('Direct sizing did not reach 3x6.');
    }

    const columnHandle = all('.column-header .axis-handle')[1];
    const columnRect = columnHandle.getBoundingClientRect();
    columnHandle.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: columnRect.left + 4,
      clientY: columnRect.top + 4
    }));
    await sleep(620);
    const longPress = !one('#axisMenu').classList.contains('hidden')
      && one('#deleteAxisButton').textContent.includes('列');
    if (!longPress) throw new Error('Column long-press menu did not open.');
    one('#deleteAxisButton').click();
    await sleep(50);
    click('.axis-add-header .axis-add-button');
    await sleep(50);

    const rowHandle = all('.row-header .axis-handle')[1];
    rowHandle.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 30,
      clientY: 30
    }));
    await sleep(80);
    const contextMenu = !one('#axisMenu').classList.contains('hidden')
      && one('#deleteAxisButton').textContent.includes('行');
    if (!contextMenu) throw new Error('Row context menu did not open.');
    one('#deleteAxisButton').click();
    await sleep(50);
    click('.axis-add-row-header .axis-add-button');
    await sleep(50);

    const question = '本番確認：今後の活動をどう進める？';
    const rows = ['優先度 (上段)', '現状 (中段)', '付き合い方 (下段)'];
    const columns = ['開発系', '行政書士勉強', '語学勉強', '作品作る系', 'それ以外', 'アドバイスカード'];

    const questionInput = one('.question-input');
    questionInput.value = question;
    questionInput.dispatchEvent(new Event('input', { bubbles: true }));

    const renameAxis = (button, value) => {
      if (!button) throw new Error('Missing direct heading edit control.');
      const holder = button.parentElement;
      if (!holder) throw new Error('Direct heading editor lost its original cell.');
      button.click();
      const input = holder.querySelector('.axis-inline-input');
      if (!input) throw new Error('Heading did not open its editor in the same cell.');
      input.value = value;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      if (button.textContent !== value || holder.querySelector('.axis-inline-input')) {
        throw new Error('Heading was not committed at the original display location.');
      }
    };
    all('.column-header .axis-inline-label').forEach((button, index) => renameAxis(button, columns[index]));
    all('.row-header .axis-inline-label').forEach((button, index) => renameAxis(button, rows[index]));

    const getColumns = () => all('.primary-matrix .column-header .axis-inline-label')
      .map(button => button.textContent);
    const keyboardMoveFirstColumnRight = () => {
      const grip = one('.primary-matrix .column-header .axis-menu-trigger');
      if (!grip) throw new Error('Keyboard-accessible reorder grip absent.');
      grip.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowRight', bubbles: true, cancelable: true
      }));
    };
    keyboardMoveFirstColumnRight();
    if (getColumns()[0] !== columns[1] || getColumns()[1] !== columns[0]) {
      throw new Error('Keyboard column reorder was not reflected in the source table.');
    }
    click('.axis-undo-button');
    if (JSON.stringify(getColumns()) !== JSON.stringify(columns)) {
      throw new Error('Undo did not restore original column order.');
    }
    click('.axis-redo-button');
    if (getColumns()[0] !== columns[1]) throw new Error('Redo did not reapply column order.');
    click('.axis-undo-button');

    click('.shuffle-button');
    for (let i = 0; i < 120 && all('.pile-button').length < 3; i += 1) await sleep(100);
    const piles = all('.pile-button').filter(button => !button.disabled);
    if (piles.length < 2) throw new Error('Two selectable piles were not available.');
    keyboardMoveFirstColumnRight();
    if (getColumns()[0] !== columns[1]) throw new Error('Reorder before Draw was lost after Shuffle.');
    click('.axis-undo-button');
    if (JSON.stringify(getColumns()) !== JSON.stringify(columns)) {
      throw new Error('Pre-draw Undo after Shuffle did not restore layout.');
    }
    piles[0].click();
    piles[1].click();
    click('.draw-button');

    for (let i = 0; i < 180 && one('.reading-status').textContent !== '抽選完了'; i += 1) {
      await sleep(100);
    }
    if (one('.reading-status').textContent !== '抽選完了') {
      throw new Error('Production draw did not complete: ' + one('.reading-status').textContent);
    }

    const beforeRenameCards = all('.primary-matrix .card-result-block')
      .concat(all('.parallel-matrix .card-result-block')).map(button => button.textContent);
    renameAxis(all('.primary-matrix .column-header .axis-inline-label')[0], '抽選後の訂正列');
    if (all('.parallel-matrix .column-header .axis-inline-label')[0]?.textContent !== '抽選後の訂正列') {
      throw new Error('Edited heading was not updated on the parallel result.');
    }
    const afterRenameCards = all('.primary-matrix .card-result-block')
      .concat(all('.parallel-matrix .card-result-block')).map(button => button.textContent);
    if (JSON.stringify(beforeRenameCards) !== JSON.stringify(afterRenameCards)) {
      throw new Error('Changing completed heading mutated server-drawn cards.');
    }

    for (let i = 0; i < 160; i += 1) {
      const images = all('img.card-art');
      if (images.length > 0 && images.every(image => image.complete)) break;
      await sleep(100);
    }

    const images = all('img.card-art');
    const loadedImages = images.filter(image => image.naturalWidth > 0).length;
    const reversedVisuals = all('.card-art.is-reversed').length + all('.custom-card-face.is-reversed').length;
    if (images.length === 0 || loadedImages !== images.length) {
      throw new Error('RWS image load mismatch: ' + loadedImages + '/' + images.length);
    }
    if (reversedVisuals === 0) throw new Error('No reversed visual was observed.');

    const completion = one('.result-action-line .reading-status');
    const copyAction = one('.heading-right-controls .copy-button');
    if (!completion || completion.textContent !== '抽選完了' || !copyAction) {
      throw new Error('Copy button and completion are not together before the result grid.');
    }
    const distance = Math.abs(completion.getBoundingClientRect().top - copyAction.getBoundingClientRect().top);
    if (distance > 16) throw new Error('Copy button and completion are not on the same row: ' + distance);
    click('.copy-button');
    for (let i = 0; i < 40 && !one('.copy-feedback').textContent.includes('コピーしました') ; i += 1) await sleep(80);
    if (!one('.copy-feedback').textContent.includes('コピーしました')) {
      throw new Error('Nearby Markdown copy feedback did not appear.');
    }
    if (one('.reading-status').textContent !== '抽選完了') throw new Error('Copy changed the draw completion state.');
    let markdown = '';
    try { markdown = await navigator.clipboard.readText(); } catch {}
    if (markdown && (!markdown.startsWith('# タロット占い結果') ||
        !markdown.includes('**問い：** ' + question) ||
        !markdown.includes('## メインリーディング（山') ||
        !markdown.includes('## パラレルリーディング（山') ||
        !markdown.includes('### パラレルリーディングについて') ||
        !markdown.includes('| --- |') || markdown.includes('\\t'))) {
      throw new Error('Markdown clipboard lost question, parallel meaning, headings, table geometry or uses TSV.');
    }

    if (one('.tsv-copy-button')) throw new Error('Deprecated TSV action remains visible in DOM.');

    const firstPrimaryCards = all('.primary-matrix .card-result-block').length;
    const firstParallelCards = all('.parallel-matrix .card-result-block').length;
    click('#newReadingButton');
    await sleep(100);

    const readingNodes = all('.reading-workbench');
    if (readingNodes.length !== 2) throw new Error('Second reading was not appended.');
    if (readingNodes[0].querySelectorAll('.primary-matrix .card-result-block').length !== firstPrimaryCards) {
      throw new Error('First reading was mutated after append.');
    }

    return {
      longPress,
      contextMenu,
      readings: readingNodes.length,
      primaryCards: firstPrimaryCards,
      parallelCards: firstParallelCards,
      imageCount: images.length,
      loadedImages,
      reversedVisuals,
      customFaces: all('.custom-card-face').length,
      firstQuestion: readingNodes[0].querySelector('.question-input').value,
      secondEditable: !readingNodes[1].querySelector('.question-input').readOnly,
      secondHasPlus: Boolean(readingNodes[1].querySelector('.axis-add-button')),
      markdownHasQuestion: markdown ? markdown.includes('**問い：** ' + question) : null,
      markdownHasTable: markdown ? markdown.includes('| --- |') : null,
      markdownExplainsParallel: markdown ? markdown.includes('### パラレルリーディングについて') : null,
      tsvActionRemoved: !one('.tsv-copy-button'),
      markdownOnly: markdown ? !markdown.includes('\\t') : null,
      apiBaseUrl: globalThis.__TAROT_DRAW_CONFIG__?.apiBaseUrl ?? null
    };
  })()`;

  const evaluated = await cdp.call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (evaluated.exceptionDetails) {
    throw new Error(evaluated.exceptionDetails.exception?.description || 'Production runtime exception.');
  }

  const result = evaluated.result.value;
  console.log(JSON.stringify(result, null, 2));

  const screenshot = await cdp.call('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  });
  await writeFile('production-smoke.png', Buffer.from(screenshot.data, 'base64'));
  cdp.close();
} catch (error) {
  console.error(error);
  if (stderr) console.error(stderr);
  process.exitCode = 1;
} finally {
  chrome.kill('SIGTERM');
}
