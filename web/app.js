import {
  appendAxisLabel,
  buildPositionIds,
  cardDisplayParts,
  cardDisplayText,
  customCardPresentation,
  formatReadingMarkdown,
  labelOrFallback,
  moveAxisLabel,
  planPileDraws,
  removeAxisLabel,
  rwsImageUrl
} from './model.js';
import { cardDetail } from './card-details.js';
import { keywordGridDraft } from './card-keyword-grid.js';
import { buildApiUrl, resolveRuntimeConfig } from './runtime-config.js';

const runtime = resolveRuntimeConfig(globalThis.__TAROT_DRAW_CONFIG__ ?? {});
const LONG_PRESS_MS = 520;

const page = {
  readings: document.querySelector('#readings'),
  newReadingButton: document.querySelector('#newReadingButton'),
  shuffleButton: document.querySelector('#shuffleButton'),
  drawButton: document.querySelector('#drawButton'),
  axisMenu: document.querySelector('#axisMenu'),
  deleteAxisButton: document.querySelector('#deleteAxisButton'),
  moveAxisBeforeButton: document.querySelector('#moveAxisBeforeButton'),
  moveAxisAfterButton: document.querySelector('#moveAxisAfterButton'),
  cardDetailDialog: document.querySelector('#cardDetailDialog'),
  cardDetailClose: document.querySelector('#cardDetailClose'),
  cardDetailTitle: document.querySelector('#cardDetailTitle'),
  cardDetailOrientation: document.querySelector('#cardDetailOrientation'),
  cardDetailVisual: document.querySelector('#cardDetailVisual'),
  cardDetailKeywordGrid: document.querySelector('#cardDetailKeywordGrid'),
  cardDetailKeywordRows: document.querySelector('#cardDetailKeywordRows'),
  cardDetailSourceInfo: document.querySelector('#cardDetailSourceInfo'),
  cardDetailReference: document.querySelector('#cardDetailReference'),
  cardDetailEssence: document.querySelector('#cardDetailEssence'),
  cardDetailUpright: document.querySelector('#cardDetailUpright'),
  cardDetailReversed: document.querySelector('#cardDetailReversed'),
  cardDetailUprightBlock: document.querySelector('#cardDetailUprightBlock'),
  cardDetailReversedBlock: document.querySelector('#cardDetailReversedBlock'),
  cardDetailCustom: document.querySelector('#cardDetailCustom'),
  cardDetailCustomText: document.querySelector('#cardDetailCustomText'),
  settingsButton: document.querySelector('#settingsButton'),
  settingsDialog: document.querySelector('#settingsDialog'),
  settingsClose: document.querySelector('#settingsClose'),
  settingsDone: document.querySelector('#settingsDone'),
  settingsScope: document.querySelector('#settingsScope'),
  includeTitleCard: document.querySelector('#includeTitleCard'),
  includeSecondaryCard: document.querySelector('#includeSecondaryCard'),
  secondaryCardName: document.querySelector('#secondaryCardName'),
  selectedDeckCount: document.querySelector('#selectedDeckCount')
};

const readings = [];
let nextReadingNumber = 1;
let axisMenuContext = null;
let lastCardTrigger = null;
const chosenSettings = { deckId: 'B', includeTitle: true, includeSecondary: true };
function deckCardCount(value) {
  return 78 + Number(value.includeTitle) + Number(value.includeSecondary);
}
function describeDeckChoice(value) {
  return `デッキ${value.deckId}・${deckCardCount(value)}枚`;
}
function renderSettingsSummary() {
  page.secondaryCardName.textContent = chosenSettings.deckId === 'A'
    ? 'パメラ・コールマン・スミス紹介カード' : '保証カード';
  page.selectedDeckCount.textContent = `${deckCardCount(chosenSettings)}枚（通常78枚＋独自カード${deckCardCount(chosenSettings) - 78}枚）`;
}
function applySettingsToCurrent() {
  renderSettingsSummary();
  const current = readings.at(-1);
  const applied = current?.applyDeckSettings(chosenSettings) ?? false;
  page.settingsScope.textContent = applied
    ? 'この設定で次のシャッフルを行います。'
    : 'この設定は次の新しい占いから反映されます。進行中・完了済みの抽選は変更しません。';
}
page.settingsButton.addEventListener('click', () => {
  const current = readings.at(-1);
  const canApplyNow = current?.state.phase === 'editing' && !current?.state.pendingOperation;
  const currentCount = canApplyNow ? current.state.rowLabels.length * current.state.columnLabels.length : 0;
  page.settingsScope.textContent = !canApplyNow
    ? 'この設定は次の新しい占いから反映されます。進行中・完了済みの抽選は変更しません。'
    : currentCount > deckCardCount(chosenSettings)
      ? '現在の配置マスが設定した枚数を超えています。先に配置を減らしてください。'
      : 'この設定で次のシャッフルを行います。';
  page.settingsDialog.showModal();
  page.settingsDialog.querySelector('input[name="deckId"]:checked')?.focus({ preventScroll: true });
});
function closeSettings() { page.settingsDialog.close(); }
page.settingsClose.addEventListener('click', closeSettings);
page.settingsDone.addEventListener('click', closeSettings);
page.settingsDialog.addEventListener('click', event => {
  if (event.target === page.settingsDialog) closeSettings();
});
page.settingsDialog.addEventListener('close', () => page.settingsButton.focus({ preventScroll: true }));
page.settingsDialog.addEventListener('change', event => {
  const next = { ...chosenSettings };
  if (event.target.name === 'deckId') next.deckId = event.target.value;
  if (event.target === page.includeTitleCard) next.includeTitle = event.target.checked;
  if (event.target === page.includeSecondaryCard) next.includeSecondary = event.target.checked;
  const current = readings.at(-1);
  if (current?.state.phase === 'editing' && current?.state.rowLabels.length * current?.state.columnLabels.length > deckCardCount(next)) {
    if (event.target.type === 'checkbox') event.target.checked = !event.target.checked;
    if (event.target.type === 'radio') page.settingsDialog.querySelector('input[name="deckId"][value="' + chosenSettings.deckId + '"]').checked = true;
    page.settingsScope.textContent = '現在の配置は' + deckCardCount(next) + 'マスを超えています。先に配置を減らしてください。';
    return;
  }
  Object.assign(chosenSettings, next);
  applySettingsToCurrent();
});
renderSettingsSummary();
for (const slot of page.settingsDialog.querySelectorAll('[data-deck-a-image]')) {
  const image = document.createElement('img');
  image.className = 'settings-deck-preview-image';
  image.alt = '';
  // The preview is off-DOM until load; a lazy image would never begin fetching.
  image.loading = 'eager';
  image.src = './assets/cards/grid/' + slot.dataset.deckAImage;
  image.addEventListener('load', () => slot.replaceChildren(image), { once: true });
  image.addEventListener('error', () => { slot.textContent = '画像未登録'; }, { once: true });
}

function createCardVisual(card, { detail = false, deckId = 'B' } = {}) {
  const visual = document.createElement('div');
  visual.className = detail ? 'card-visual detail-card-visual' : 'card-visual';

  const imageUrl = rwsImageUrl(card, detail ? 224 : 128, deckId);
  if (imageUrl) {
    const image = document.createElement('img');
    image.className = detail ? 'card-art detail-card-art' : 'card-art';
    if (card.orientation === 'reversed') image.classList.add('is-reversed');
    image.src = imageUrl;
    image.alt = '';
    image.loading = detail ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      visual.classList.add('art-failed');
      image.remove();
      if (detail) {
        const fallback = document.createElement('span');
        fallback.className = 'detail-art-fallback';
        fallback.textContent = '画像を表示できません';
        visual.append(fallback);
      }
    }, { once: true });
    visual.append(image);
    return visual;
  }

  const face = document.createElement('div');
  face.className = detail ? 'custom-card-face detail-custom-card-face' : 'custom-card-face';
  if (card.orientation === 'reversed') face.classList.add('is-reversed');

  face.dataset.deck = deckId;
  const eyebrow = document.createElement('span');
  eyebrow.textContent = deckId === 'A' ? 'DECK A · 画像準備中' : 'CUSTOM';

  const title = document.createElement('strong');
  title.textContent = customCardPresentation(card.card_id, deckId)?.faceTitle ?? 'CARD';

  face.append(eyebrow, title);
  visual.append(face);
  return visual;
}

function setCardTitle(element, parts, { floatingRuby = false } = {}) {
  element.replaceChildren();
  if (parts.titleHtml && floatingRuby) {
    // The phonetic label is absolute, never a line box or anonymous flex item.
    // Keep plain text (e.g. 「の」) and ruby bases on exactly the same baseline.
    const template = document.createElement('template');
    template.innerHTML = parts.titleHtml;
    for (const node of [...template.content.childNodes]) {
      if (node.nodeType !== 1 || node.localName !== 'ruby') {
        element.append(node);
        continue;
      }
      const wrapper = document.createElement('span');
      wrapper.className = 'ruby-token';
      const base = document.createElement('span');
      base.className = 'ruby-base';
      const clone = node.cloneNode(true);
      clone.querySelectorAll('rt, rp').forEach(item => item.remove());
      base.textContent = clone.textContent;
      const phonetic = document.createElement('span');
      phonetic.className = 'ruby-float';
      phonetic.textContent = node.querySelector('rt')?.textContent ?? '';
      phonetic.setAttribute('aria-hidden', 'true');
      wrapper.append(base, phonetic);
      element.append(wrapper);
    }
  } else if (parts.titleHtml) {
    element.innerHTML = parts.titleHtml;
  } else {
    element.textContent = parts.title;
  }
  element.setAttribute('aria-label', parts.plainTitle);
}

function closeCardDetail() {
  if (page.cardDetailDialog.open) page.cardDetailDialog.close();
}

function renderKeywordGrid(cardId) {
  const groups = cardId ? keywordGridDraft(cardId) : null;
  const body = page.cardDetailKeywordRows.tBodies[0];
  body.replaceChildren();
  page.cardDetailSourceInfo.open = false;
  page.cardDetailSourceInfo.classList.toggle('hidden', !groups);
  page.cardDetailKeywordGrid.classList.toggle('hidden', !groups);
  if (!groups) return;

  for (const { heading, terms } of groups) {
    const row = document.createElement('tr');
    row.className = 'keyword-grid-group';
    const label = document.createElement('th');
    label.scope = 'row';
    label.textContent = heading;
    row.append(label);
    for (const term of terms) {
      const item = document.createElement('td');
      item.textContent = term;
      row.append(item);
    }
    body.append(row);
  }
}

function openCardDetail(card, trigger, deckId = 'B') {
  const parts = cardDisplayParts(card, deckId);
  const detail = cardDetail(card.card_id);
  lastCardTrigger = trigger;

  setCardTitle(page.cardDetailTitle, parts);
  page.cardDetailOrientation.textContent = parts.orientation;
  page.cardDetailVisual.replaceChildren(createCardVisual(card, { detail: true, deckId }));
  renderKeywordGrid(detail ? card.card_id : null);

  if (detail) {
    page.cardDetailReference.classList.remove('hidden');
    page.cardDetailCustom.classList.add('hidden');
    page.cardDetailEssence.textContent = detail.essence;
    page.cardDetailUpright.textContent = detail.upright;
    page.cardDetailReversed.textContent = detail.reversed;
    const isUpright = card.orientation === 'upright';
    page.cardDetailUprightBlock.dataset.active = String(isUpright);
    page.cardDetailReversedBlock.dataset.active = String(!isUpright);
    page.cardDetailUprightBlock.setAttribute('aria-label', isUpright ? '正位置（今回の抽選結果）' : '正位置');
    page.cardDetailReversedBlock.setAttribute('aria-label', isUpright ? '逆位置' : '逆位置（今回の抽選結果）');
    page.cardDetailUprightBlock.querySelector('.detail-picked-label')?.classList.toggle('hidden', !isUpright);
    page.cardDetailReversedBlock.querySelector('.detail-picked-label')?.classList.toggle('hidden', isUpright);
  } else {
    page.cardDetailReference.classList.add('hidden');
    page.cardDetailCustom.classList.remove('hidden');
    page.cardDetailCustomText.textContent = customCardPresentation(card.card_id, deckId)?.note ?? '独自カード';
  }

  page.cardDetailDialog.showModal();
  // The popup always begins closed; keywords now fit the available width without panning.
  page.cardDetailDialog.scrollTop = 0;
}

page.cardDetailClose.addEventListener('click', closeCardDetail);
page.cardDetailDialog.addEventListener('click', event => {
  if (page.cardDetailSourceInfo.open && !page.cardDetailSourceInfo.contains(event.target)) {
    page.cardDetailSourceInfo.open = false;
  }
  if (event.target === page.cardDetailDialog) closeCardDetail();
});
page.cardDetailDialog.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (page.cardDetailSourceInfo.open) {
      page.cardDetailSourceInfo.open = false;
      page.cardDetailSourceInfo.querySelector('summary')?.focus({ preventScroll: true });
    } else {
      closeCardDetail();
    }
  }
});
page.cardDetailDialog.addEventListener('cancel', () => {
  // Native cancel remains as a browser-level fallback.
});
page.cardDetailDialog.addEventListener('close', () => {
  const trigger = lastCardTrigger;
  lastCardTrigger = null;
  trigger?.focus({ preventScroll: true });
});

function setTextStatus(element, message, kind = 'info') {
  element.textContent = message;
  element.dataset.kind = kind;
}

function requiredCards(state) {
  return buildPositionIds(state.rowLabels.length, state.columnLabels.length)
    .filter(id => !state.inactivePositions.has(id)).length;
}

function canAddRow(state) {
  return (state.rowLabels.length + 1) * state.columnLabels.length <= deckCardCount(state);
}

function canAddColumn(state) {
  return state.rowLabels.length * (state.columnLabels.length + 1) <= deckCardCount(state);
}

async function api(path, options = {}) {
  const response = await fetch(buildApiUrl(path, runtime), {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) }
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error?.message ?? 'API error');
    error.code = data.error?.code;
    error.details = data.error?.details;
    throw error;
  }
  return data;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.remove();
  if (!ok) throw new Error('クリップボードへコピーできませんでした。');
}

function closeAxisMenu({ restoreFocus = false } = {}) {
  const previous = axisMenuContext;
  axisMenuContext = null;
  page.axisMenu.classList.add('hidden');
  page.axisMenu.removeAttribute('style');
  if (restoreFocus) previous?.trigger?.focus();
}

function openAxisMenu(controller, kind, index, trigger, point = null) {
  if (controller.state.pendingOperation || !['editing', 'choosing'].includes(controller.state.phase)) return;

  axisMenuContext = { controller, kind, index, trigger };
  const count = kind === 'row'
    ? controller.state.rowLabels.length
    : controller.state.columnLabels.length;

  const row = kind === 'row';
  page.moveAxisBeforeButton.textContent = row ? 'この行を上へ' : 'この列を左へ';
  page.moveAxisAfterButton.textContent = row ? 'この行を下へ' : 'この列を右へ';
  page.moveAxisBeforeButton.disabled = index === 0;
  page.moveAxisAfterButton.disabled = index === count - 1;
  page.deleteAxisButton.textContent = row ? 'この行を削除' : 'この列を削除';
  page.deleteAxisButton.classList.toggle('hidden', controller.state.phase !== 'editing');
  page.deleteAxisButton.disabled = count <= 1;
  page.deleteAxisButton.title = count <= 1 ? '最低1つの行・列が必要です' : '';

  const rect = trigger.getBoundingClientRect();
  const left = point?.x ?? Math.min(window.innerWidth - 180, Math.max(8, rect.left));
  const top = point?.y ?? Math.min(window.innerHeight - 128, rect.bottom + 4);

  page.axisMenu.style.left = `${left}px`;
  page.axisMenu.style.top = `${top}px`;
  page.axisMenu.classList.remove('hidden');
  requestAnimationFrame(() => {
    if (!page.moveAxisBeforeButton.disabled) page.moveAxisBeforeButton.focus();
    else if (!page.moveAxisAfterButton.disabled) page.moveAxisAfterButton.focus();
    else if (!page.deleteAxisButton.classList.contains('hidden')) page.deleteAxisButton.focus();
  });
}

page.moveAxisBeforeButton.addEventListener('click', () => {
  if (!axisMenuContext) return;
  const { controller, kind, index } = axisMenuContext;
  controller.moveAxis(kind, index, index - 1);
  closeAxisMenu();
});

page.moveAxisAfterButton.addEventListener('click', () => {
  if (!axisMenuContext) return;
  const { controller, kind, index } = axisMenuContext;
  controller.moveAxis(kind, index, index + 1);
  closeAxisMenu();
});

page.deleteAxisButton.addEventListener('click', () => {
  if (!axisMenuContext) return;
  const { controller, kind, index } = axisMenuContext;
  controller.removeAxis(kind, index);
  closeAxisMenu();
});

page.axisMenu.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeAxisMenu({ restoreFocus: true });
  }
});

document.addEventListener('pointerdown', event => {
  if (!page.axisMenu.classList.contains('hidden') && !page.axisMenu.contains(event.target)) {
    closeAxisMenu();
  }
});

window.addEventListener('blur', () => closeAxisMenu());

function bindAxisContextMenu(target, controller, kind, index, trigger) {
  let timer = null;
  let startX = 0;
  let startY = 0;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  target.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !['editing', 'choosing'].includes(controller.state.phase)) return;
    startX = event.clientX;
    startY = event.clientY;
    cancel();
    timer = setTimeout(() => {
      timer = null;
      openAxisMenu(controller, kind, index, trigger, { x: event.clientX, y: event.clientY });
    }, LONG_PRESS_MS);
  });

  target.addEventListener('pointermove', event => {
    if (Math.abs(event.clientX - startX) > 8 || Math.abs(event.clientY - startY) > 8) cancel();
  });
  target.addEventListener('pointerup', cancel);
  target.addEventListener('pointercancel', cancel);
  target.addEventListener('pointerleave', cancel);

  target.addEventListener('contextmenu', event => {
    if (!['editing', 'choosing'].includes(controller.state.phase)) return;
    event.preventDefault();
    cancel();
    openAxisMenu(controller, kind, index, trigger, { x: event.clientX, y: event.clientY });
  });

  trigger.addEventListener('click', event => {
    event.stopPropagation();
    openAxisMenu(controller, kind, index, trigger);
  });
}

// Keep row/column widths fixed: shrink long names inside the existing area.
// The full label remains available via title and the accessible DOM text.
function displayAxisLabel(labels, index, kind) {
  const label = labelOrFallback(labels, index, kind);
  // Display-only correction for vertical Japanese headings. Do not change
  // stored labels, editor input, Markdown export, or positional IDs.
  return kind === 'row' ? label.replace(/[0-9]/g, digit =>
    String.fromCharCode(digit.charCodeAt(0) + 0xFEE0)) : label;
}

function fitAxisText(node) {
  if (!node?.isConnected) return;
  for (let size = 13; size >= 5.5; size -= 0.5) {
    node.style.fontSize = `${size}px`;
    if (node.scrollWidth <= node.clientWidth + 1 &&
        node.scrollHeight <= node.clientHeight + 1) break;
  }
}

function fitMatrixAxes(root) {
  for (const node of root.querySelectorAll('.axis-inline-label, .axis-readonly-label')) {
    fitAxisText(node);
  }
}

function createReadingController(number) {
  const state = {
    number,
    phase: 'editing',
    question: '',
    deckId: chosenSettings.deckId,
    includeTitle: chosenSettings.includeTitle,
    includeSecondary: chosenSettings.includeSecondary,
    inactivePositions: new Set(),
    rowLabels: [''],
    columnLabels: ['', '', ''],
    sessionId: null,
    piles: [],
    primaryPile: null,
    parallelPile: null,
    primaryPiles: [],
    parallelPiles: [],
    primaryResult: null,
    parallelResult: null,
    pendingOperation: null,
    drawOutcome: null,
    undoStack: [],
    redoStack: []
  };

  const article = document.createElement('article');
  article.className = 'reading-workbench';
  article.dataset.reading = String(number);

  article.innerHTML = `
    <div class="reading-toolbar">
      <span class="reading-index">Reading ${number}</span>
      <span class="reading-deck-summary" aria-label="使用デッキ"></span>
      <label class="question-field">
        <span class="question-prefix">Q.</span>
        <input class="question-input" type="text" autocomplete="off" aria-label="今回の問い" placeholder="今回の問い">
      </label>
    </div>

    <p class="layout-message helper" role="status"></p>

    <div class="pile-panel hidden" aria-label="山選択">
      <span class="pile-label">山</span>
      <div class="pile-set pile-set-primary">
        <span class="pile-set-title">Primary（メイン）</span>
        <div class="pile-options primary-pile-options" aria-label="Primaryの山を選択"></div>
      </div>
      <div class="pile-set pile-set-parallel">
        <span class="pile-set-title">Parallel（別の選び方・任意）</span>
        <div class="pile-options parallel-pile-options" aria-label="Parallelの山を選択"></div>
      </div>
      <p class="selection-message helper pile-status" role="status" aria-live="polite"></p>
    </div>

    <div class="matrix-stack">
      <section class="matrix-section">
        <div class="matrix-heading">
          <h2 class="primary-title">配置</h2>
          <span class="primary-pile-label branch-meta"></span>
          <div class="result-action-line">
            <p class="reading-status status" role="status" aria-live="polite"></p>
            <span class="copy-feedback" role="status" aria-live="polite"></span>
          </div>
          <div class="heading-right-controls">
            <span class="card-count layout-count" aria-live="polite">計3枚</span>
            <button class="copy-button secondary hidden" type="button" title="Markdown形式の表をコピー">結果をコピー</button>
          </div>
        </div>
        <div class="primary-matrix table-scroll"></div>
        <div class="axis-history-actions" aria-label="配置編集履歴">
          <button class="axis-undo-button secondary hidden" type="button" title="直前の編集を元に戻す">戻す</button>
          <button class="axis-redo-button secondary hidden" type="button" title="取り消した編集をやり直す">やり直す</button>
        </div>
      </section>

      <section class="parallel-section matrix-section hidden">
        <div class="matrix-heading">
          <h2>Parallel</h2>
          <span class="parallel-pile-label branch-meta"></span>
        </div>
        <div class="parallel-matrix table-scroll"></div>
      </section>
    </div>
  
  `;

  const refs = {
    cardCount: article.querySelector('.card-count'),
    deckSummary: article.querySelector('.reading-deck-summary'),
    copyButton: article.querySelector('.copy-button'),
    copyFeedback: article.querySelector('.copy-feedback'),
    shuffleButton: page.shuffleButton,
    drawButton: page.drawButton,
    questionInput: article.querySelector('.question-input'),
    layoutMessage: article.querySelector('.layout-message'),
    pilePanel: article.querySelector('.pile-panel'),
    pileOptions: article.querySelector('.primary-pile-options'),
    parallelPileOptions: article.querySelector('.parallel-pile-options'),
    selectionMessage: article.querySelector('.selection-message'),
    primaryTitle: article.querySelector('.primary-title'),
    primaryPileLabel: article.querySelector('.primary-pile-label'),
    historyActions: article.querySelector('.axis-history-actions'),
    undoButton: article.querySelector('.axis-undo-button'),
    redoButton: article.querySelector('.axis-redo-button'),
    primaryMatrix: article.querySelector('.primary-matrix'),
    parallelSection: article.querySelector('.parallel-section'),
    parallelPileLabel: article.querySelector('.parallel-pile-label'),
    parallelMatrix: article.querySelector('.parallel-matrix'),
    status: article.querySelector('.reading-status')
  };

  const controller = {
    state,
    article,
    refs,
    addAxis,
    removeAxis,
    moveAxis,
    render,
    focusQuestion,
    shuffle,
    draw,
    applyDeckSettings
  };

  function applyDeckSettings(settings) {
    if (state.phase !== 'editing' || state.pendingOperation) return false;
    const max = deckCardCount(settings);
    if (state.rowLabels.length * state.columnLabels.length > max) return false;
    state.deckId = settings.deckId;
    state.includeTitle = settings.includeTitle;
    state.includeSecondary = settings.includeSecondary;
    render();
    return true;
  }

  refs.questionInput.addEventListener('input', event => {
    if (state.pendingOperation || state.phase === 'draw-uncertain' || state.phase === 'completed') return;
    state.question = event.target.value;
  });
  refs.copyButton.addEventListener('click', copyReading);
  refs.undoButton.addEventListener('click', undoAxis);
  refs.redoButton.addEventListener('click', redoAxis);

  function focusQuestion() {
    refs.questionInput.focus();
  }

  function snapshotAxes() {
    return { rowLabels: [...state.rowLabels], columnLabels: [...state.columnLabels],
      inactivePositions: [...state.inactivePositions] };
  }

  function recordAxisHistory() {
    state.undoStack.push(snapshotAxes());
    if (state.undoStack.length > 40) state.undoStack.shift();
    state.redoStack.length = 0;
  }

  function applyAxes(snapshot) {
    state.rowLabels = [...snapshot.rowLabels];
    state.columnLabels = [...snapshot.columnLabels];
    state.inactivePositions = new Set(snapshot.inactivePositions ?? []);
  }

  function canEditAxes() {
    return !state.pendingOperation && (state.phase === 'editing' || state.phase === 'choosing');
  }

  function undoAxis() {
    if (!canEditAxes() || !state.undoStack.length) return;
    state.redoStack.push(snapshotAxes());
    applyAxes(state.undoStack.pop());
    render();
    setTextStatus(refs.layoutMessage, '元に戻しました。');
  }

  function redoAxis() {
    if (!canEditAxes() || !state.redoStack.length) return;
    state.undoStack.push(snapshotAxes());
    applyAxes(state.redoStack.pop());
    render();
    setTextStatus(refs.layoutMessage, 'やり直しました。');
  }

  function moveAxis(kind, from, to) {
    if (!canEditAxes()) return false;
    const stateKey = kind === 'row' ? 'rowLabels' : 'columnLabels';
    const values = state[stateKey];
    if (![from, to].every(index => Number.isInteger(index) && index >= 0 && index < values.length)) return false;
    if (from === to) return false;
    recordAxisHistory();
    state[stateKey] = moveAxisLabel(values, from, to);
    const order = moveAxisLabel(values.map((_, i) => i), from, to);
    state.inactivePositions = new Set([...state.inactivePositions].map(id => {
      const match = /^r(\d+)c(\d+)$/.exec(id);
      if (!match) return id;
      let row = Number(match[1]), col = Number(match[2]);
      if (kind === 'row') row = order.indexOf(row);
      else col = order.indexOf(col);
      return `r${row}c${col}`;
    }));
    render();
    const selector = kind === 'row' ? '.row-header' : '.column-header';
    const target = refs.primaryMatrix.querySelectorAll(selector)[to]?.querySelector('.axis-menu-trigger');
    target?.focus({ preventScroll: true });
    setTextStatus(refs.layoutMessage, `${kind === 'row' ? '行' : '列'}の順番を変えました。`);
    return true;
  }

  function addAxis(kind) {
    if (state.phase !== 'editing' || state.pendingOperation) return;

    if (kind === 'row') {
      if (!canAddRow(state)) {
        setTextStatus(refs.layoutMessage, `配置は最大${state.includeCustom ? 80 : 78}枚です。これ以上行を追加できません。`, 'error');
        return;
      }
      recordAxisHistory();
      state.rowLabels = appendAxisLabel(state.rowLabels);
    } else {
      if (!canAddColumn(state)) {
        setTextStatus(refs.layoutMessage, `配置は最大${state.includeCustom ? 80 : 78}枚です。これ以上列を追加できません。`, 'error');
        return;
      }
      recordAxisHistory();
      state.columnLabels = appendAxisLabel(state.columnLabels);
    }
    render();
  }

  function removeAxis(kind, index) {
    if (state.phase !== 'editing' || state.pendingOperation) return;
    const labels = kind === 'row' ? state.rowLabels : state.columnLabels;
    if (labels.length <= 1 || index < 0 || index >= labels.length) return;
    if (labels[index].trim() && !window.confirm('削除しますか？')) return;
    recordAxisHistory();
    if (kind === 'row') {
      state.rowLabels = removeAxisLabel(state.rowLabels, index);
    } else {
      state.columnLabels = removeAxisLabel(state.columnLabels, index);
    }
    state.inactivePositions = new Set([...state.inactivePositions].flatMap(id => {
      const match = /^r(\d+)c(\d+)$/.exec(id);
      if (!match) return [];
      let row = Number(match[1]), col = Number(match[2]);
      if ((kind === 'row' ? row : col) === index) return [];
      if (kind === 'row' && row > index) row--;
      if (kind === 'column' && col > index) col--;
      return [`r${row}c${col}`];
    }));
    render();
  }

  function createAxisEditor(kind, index, stateKey) {
    const wrapper = document.createElement('div');
    wrapper.className = 'axis-editor';
    const handle = document.createElement('div');
    handle.className = 'axis-handle';
    const axisName = kind === 'row' ? '行' : '列';

    // The actual visible heading is the edit target. No duplicate caption,
    // permanent input field, or separate editing row at rest.
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'axis-inline-label';
    label.textContent = displayAxisLabel(state[stateKey], index, kind);
    label.setAttribute('aria-label', axisName + (index + 1) + 'の名前を編集');
    label.title = `${label.textContent}（名前を編集）`;
    label.disabled = Boolean(state.pendingOperation) || state.phase === 'draw-uncertain';

    const menuButton = document.createElement('button');
    menuButton.className = 'axis-menu-trigger';
    menuButton.type = 'button';
    menuButton.textContent = '⠿';
    menuButton.title = 'ドラッグして順番を変更／押して操作／矢印キーでも移動';
    menuButton.setAttribute('aria-label', axisName + (index + 1) + 'を移動・操作');

    function syncOtherHeading() {
      // Both branches show the SAME user-owned row/column metadata. Update the
      // opposite branch in place to preserve scroll, focus and frozen card IDs.
      const selector = kind === 'row' ? '.row-header' : '.column-header';
      for (const matrix of [refs.primaryMatrix, refs.parallelMatrix]) {
        const matching = matrix.querySelectorAll(selector)[index];
        const updated = matching?.querySelector('.axis-inline-label, .axis-readonly-label');
        if (!updated || updated === label) continue;
        updated.textContent = displayAxisLabel(state[stateKey], index, kind);
        updated.title = `${updated.textContent}（名前を編集）`;
        fitAxisText(updated);
      }
    }

    function beginEdit() {
      if (state.pendingOperation || state.phase === 'draw-uncertain') return;
      const previousValue = state[stateKey][index] ?? '';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'axis-inline-input';
      input.autocomplete = 'off';
      input.value = previousValue;
      input.placeholder = axisName + '名';
      input.setAttribute('aria-label', axisName + (index + 1) + 'の名前');
      let isComposing = false;
      let finished = false;
      const finish = (commit, restoreFocus = false) => {
        if (finished) return;
        finished = true;
        const values = [...state[stateKey]];
        values[index] = commit ? input.value : previousValue;
        if (commit && values[index] !== previousValue && canEditAxes()) recordAxisHistory();
        state[stateKey] = values;
        label.textContent = displayAxisLabel(values, index, kind);
        label.title = `${label.textContent}（名前を編集）`;
        input.replaceWith(label);
        fitAxisText(label);
        syncOtherHeading();
        renderLayoutState();
        if (restoreFocus) label.focus({ preventScroll: true });
      };
      input.addEventListener('compositionstart', () => { isComposing = true; });
      input.addEventListener('compositionend', () => { isComposing = false; });
      input.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(false, true);
        } else if (event.key === 'Enter' && !event.isComposing && !isComposing) {
          event.preventDefault();
          finish(true, true);
        }
      });
      input.addEventListener('blur', () => finish(true));
      label.replaceWith(input);
      input.focus({ preventScroll: true });
      input.select();
    }

    label.addEventListener('click', beginEdit);

    // Reuse the existing secondary-action button as a drag grip. The name
    // itself remains a pure edit surface, never a hidden dragging target.
    if (canEditAxes()) {
      let pointerId = null;
      let originX = 0;
      let originY = 0;
      let dragged = false;
      const table = () => refs.primaryMatrix.querySelector('.reading-table');
      const axisCells = axisIndex => {
        const current = table();
        if (!current) return [];
        if (kind === 'row') return [...(current.tBodies[0]?.rows[axisIndex]?.cells ?? [])];
        return [...current.querySelectorAll('thead tr, tbody tr:not(.axis-add-row)')]
          .map(row => row.cells[axisIndex + 1]).filter(Boolean);
      };
      let ghost = null;
      let hoveredIndex = -1;
      const clearDragPreview = () => {
        refs.primaryMatrix.querySelectorAll('.axis-dragging-source, .axis-drop-preview')
          .forEach(cell => cell.classList.remove('axis-dragging-source', 'axis-drop-preview'));
        ghost?.remove();
        ghost = null;
        hoveredIndex = -1;
      };
      const dropIndexAt = (x, y) => {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !refs.primaryMatrix.contains(hit)) return -1;
        if (kind === 'row') {
          const target = hit.closest('tbody tr:not(.axis-add-row)');
          return target ? [...table().tBodies[0].rows].indexOf(target) : -1;
        }
        const cell = hit.closest('td, th');
        const index = cell ? cell.cellIndex - 1 : -1;
        return index >= 0 && index < state.columnLabels.length ? index : -1;
      };
      const showDragPreview = (x, y) => {
        if (!ghost) {
          ghost = document.createElement('div');
          ghost.className = 'axis-drag-ghost';
          ghost.setAttribute('aria-hidden', 'true');
          const heading = document.createElement('strong');
          heading.textContent = `${axisName}${index + 1}を移動`;
          ghost.append(heading);
          axisCells(index).map(cell => cell.textContent?.trim()).filter(Boolean).slice(0, 4)
            .forEach(value => {
              const item = document.createElement('span');
              item.textContent = value;
              ghost.append(item);
            });
          document.body.append(ghost);
        }
        ghost.style.left = `${Math.max(4, Math.min(window.innerWidth - 150, x + 12))}px`;
        ghost.style.top = `${Math.max(4, Math.min(window.innerHeight - 80, y + 12))}px`;
        const destination = dropIndexAt(x, y);
        if (destination === hoveredIndex) return;
        refs.primaryMatrix.querySelectorAll('.axis-drop-preview')
          .forEach(cell => cell.classList.remove('axis-drop-preview'));
        hoveredIndex = destination;
        axisCells(index).forEach(cell => cell.classList.add('axis-dragging-source'));
        if (destination >= 0 && destination !== index) {
          axisCells(destination).forEach(cell => cell.classList.add('axis-drop-preview'));
        }
      };
      const stopTracking = () => {
        window.removeEventListener('pointermove', onPointerMove, true);
        window.removeEventListener('pointerup', onPointerUp, true);
        window.removeEventListener('pointercancel', onPointerCancel, true);
      };
      const onPointerMove = event => {
        if (event.pointerId !== pointerId) return;
        if (!dragged && Math.hypot(event.clientX - originX, event.clientY - originY) < 7) return;
        dragged = true;
        showDragPreview(event.clientX, event.clientY);
      };
      const onPointerUp = event => {
        if (event.pointerId !== pointerId) return;
        const didDrag = dragged;
        const to = didDrag ? dropIndexAt(event.clientX, event.clientY) : -1;
        stopTracking();
        pointerId = null;
        clearDragPreview();
        if (didDrag) {
          event.preventDefault();
          if (to >= 0) moveAxis(kind, index, to);
        }
      };
      const onPointerCancel = event => {
        if (event.pointerId !== pointerId) return;
        stopTracking();
        pointerId = null;
        dragged = false;
        clearDragPreview();
      };
      menuButton.addEventListener('pointerdown', event => {
        if (!canEditAxes() || event.button !== 0) return;
        event.stopPropagation();
        pointerId = event.pointerId;
        originX = event.clientX;
        originY = event.clientY;
        dragged = false;
        window.addEventListener('pointermove', onPointerMove, true);
        window.addEventListener('pointerup', onPointerUp, true);
        window.addEventListener('pointercancel', onPointerCancel, true);
        try { menuButton.setPointerCapture(event.pointerId); } catch {}
      });
      menuButton.addEventListener('click', event => {
        if (!dragged) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        dragged = false;
      }, true);
      menuButton.addEventListener('keydown', event => {
        if (!canEditAxes()) return;
        const before = kind === 'row' ? 'ArrowUp' : 'ArrowLeft';
        const after = kind === 'row' ? 'ArrowDown' : 'ArrowRight';
        if (event.key !== before && event.key !== after) return;
        event.preventDefault();
        event.stopPropagation();
        moveAxis(kind, index, index + (event.key === before ? -1 : 1));
      });
    }

    handle.append(label, menuButton);
    wrapper.append(handle);
    return { wrapper, handle, menuButton };
  }

  function createCardResult(card) {
    const result = document.createElement('button');
    result.type = 'button';
    result.className = 'card-result-block card-detail-trigger';

    const visual = createCardVisual(card, { deckId: state.deckId });
    const parts = cardDisplayParts(card, state.deckId);

    const label = document.createElement('span');
    label.className = 'card-result-text';

    const title = document.createElement('span');
    title.className = 'card-title';
    setCardTitle(title, parts, { floatingRuby: true });

    const orientation = document.createElement('span');
    orientation.className = 'card-orientation';
    orientation.textContent = parts.orientation;

    label.append(title, orientation);
    result.append(visual, label);
    result.setAttribute('aria-label', `${parts.plainTitle} ${parts.orientation}の詳細を表示`);
    result.addEventListener('click', () => openCardDetail(card, result, state.deckId));
    return result;
  }

  function toggleCell(positionId) {
    if (state.pendingOperation || !['editing', 'choosing'].includes(state.phase)) return;
    recordAxisHistory();
    if (state.inactivePositions.has(positionId)) state.inactivePositions.delete(positionId);
    else state.inactivePositions.add(positionId);
    render();
  }

  function createMatrixTable({ result = null, editableHeaders = false, label }) {
    const table = document.createElement('table');
    table.className = 'reading-table';
    table.setAttribute('aria-label', label);

    const canEditStructure = state.phase === 'editing' && !state.pendingOperation;
    // A fixed-layout table with flexible, equal-weight data columns fills the
    // scrollport; its minimum is the legacy 96px cell width. Once the minimum
    // exceeds the viewport, the matrix scrolls rather than shrinking cards.
    const colgroup = document.createElement('colgroup');
    const rowCol = document.createElement('col');
    rowCol.style.width = '62px';
    colgroup.append(rowCol);
    for (let column = 0; column < state.columnLabels.length; column += 1) {
      colgroup.append(document.createElement('col'));
    }
    if (canEditStructure) {
      const actionsCol = document.createElement('col');
      actionsCol.style.width = '32px';
      colgroup.append(actionsCol);
    }
    table.append(colgroup);
    table.style.minWidth = `${62 + state.columnLabels.length * 96 + (canEditStructure ? 32 : 0)}px`;
    const canReorder = canEditAxes();
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const corner = document.createElement('th');
    corner.className = 'corner-header';
    corner.scope = 'col';
    corner.textContent = '行 / 列';
    headerRow.append(corner);

    for (let column = 0; column < state.columnLabels.length; column += 1) {
      const th = document.createElement('th');
      th.className = 'column-header';
      th.scope = 'col';

      if (editableHeaders) {
        const editor = createAxisEditor('column', column, 'columnLabels');
        th.append(editor.wrapper);
        if (canReorder) bindAxisContextMenu(editor.handle, controller, 'column', column, editor.menuButton);
        if (!canReorder) editor.menuButton.classList.add('hidden');
      } else {
        const text = document.createElement('span');
        text.className = 'axis-readonly-label';
        text.textContent = labelOrFallback(state.columnLabels, column, 'column');
        text.title = text.textContent;
        th.append(text);
      }
      headerRow.append(th);
    }

    if (canEditStructure) {
      const addColumnHeader = document.createElement('th');
      addColumnHeader.className = 'axis-add-header';
      addColumnHeader.scope = 'col';
      const addColumn = document.createElement('button');
      addColumn.className = 'axis-add-button';
      addColumn.type = 'button';
      addColumn.textContent = '＋';
      addColumn.title = '列を追加';
      addColumn.setAttribute('aria-label', '列を追加');
      addColumn.disabled = !canAddColumn(state);
      addColumn.addEventListener('click', () => addAxis('column'));
      const removeColumn = document.createElement('button');
      removeColumn.className = 'axis-add-button axis-remove-button';
      removeColumn.type = 'button';
      removeColumn.textContent = '−';
      removeColumn.title = '最後の列を削除';
      removeColumn.setAttribute('aria-label', '最後の列を削除');
      removeColumn.disabled = state.columnLabels.length <= 1;
      removeColumn.addEventListener('click', () => removeAxis('column', state.columnLabels.length - 1));
      const columnActions = document.createElement('div');
      columnActions.className = 'axis-add-actions axis-add-actions-column';
      columnActions.append(addColumn, removeColumn);
      addColumnHeader.append(columnActions);
      headerRow.append(addColumnHeader);
    }

    thead.append(headerRow);
    table.append(thead);

    const tbody = document.createElement('tbody');
    for (let row = 0; row < state.rowLabels.length; row += 1) {
      const tr = document.createElement('tr');

      const rowHeader = document.createElement('th');
      rowHeader.className = 'row-header';
      rowHeader.scope = 'row';

      if (editableHeaders) {
        const editor = createAxisEditor('row', row, 'rowLabels');
        rowHeader.append(editor.wrapper);
        if (canReorder) bindAxisContextMenu(editor.handle, controller, 'row', row, editor.menuButton);
        if (!canReorder) editor.menuButton.classList.add('hidden');
      } else {
        const text = document.createElement('span');
        text.className = 'axis-readonly-label';
        text.textContent = displayAxisLabel(state.rowLabels, row, 'row');
        text.title = text.textContent;
        rowHeader.append(text);
      }
      tr.append(rowHeader);

      for (let column = 0; column < state.columnLabels.length; column += 1) {
        const positionId = `r${row}c${column}`;
        const td = document.createElement('td');
        td.className = 'reading-cell';
        td.dataset.position = positionId;

        const card = result?.positions?.[positionId];
        if (state.inactivePositions.has(positionId)) {
          td.classList.add('cell-inactive');
          if ((state.phase === 'editing' || state.phase === 'choosing') && !state.pendingOperation) {
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'cell-mask-toggle';
            toggle.textContent = '×';
            toggle.title = 'このマスを使用する';
            toggle.setAttribute('aria-label', `行${row + 1}列${column + 1}を使用する（現在×）`);
            toggle.setAttribute('aria-pressed', 'true');
            toggle.addEventListener('click', () => toggleCell(positionId));
            td.append(toggle);
          } else {
            const cross = document.createElement('span');
            cross.className = 'cell-mask-excluded';
            cross.textContent = '×';
            cross.setAttribute('aria-label', '使用しないマス');
            td.append(cross);
          }
        } else if (card) {
          td.append(createCardResult(card));
        } else if ((state.phase === 'editing' || state.phase === 'choosing') && !state.pendingOperation) {
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'cell-mask-toggle';
          toggle.textContent = '○';
          toggle.title = 'このマスを使わない';
          toggle.setAttribute('aria-label', `行${row + 1}列${column + 1}を使わない（現在○）`);
          toggle.setAttribute('aria-pressed', 'false');
          toggle.addEventListener('click', () => toggleCell(positionId));
          td.append(toggle);
        } else {
          const placeholder = document.createElement('span');
          placeholder.className = 'cell-placeholder';
          placeholder.textContent = '—';
          td.append(placeholder);
        }
        tr.append(td);
      }

      if (canEditStructure) {
        const tail = document.createElement('td');
        tail.className = 'axis-add-tail';
        tail.setAttribute('aria-hidden', 'true');
        tr.append(tail);
      }

      tbody.append(tr);
    }

    if (canEditStructure) {
      const addRow = document.createElement('tr');
      addRow.className = 'axis-add-row';

      const addCell = document.createElement('th');
      addCell.className = 'axis-add-row-header';
      addCell.scope = 'row';
      const button = document.createElement('button');
      button.className = 'axis-add-button';
      button.type = 'button';
      button.textContent = '＋';
      button.title = '行を追加';
      button.setAttribute('aria-label', '行を追加');
      button.disabled = !canAddRow(state);
      button.addEventListener('click', () => addAxis('row'));
      const removeRow = document.createElement('button');
      removeRow.className = 'axis-add-button axis-remove-button';
      removeRow.type = 'button';
      removeRow.textContent = '−';
      removeRow.title = '最後の行を削除';
      removeRow.setAttribute('aria-label', '最後の行を削除');
      removeRow.disabled = state.rowLabels.length <= 1;
      removeRow.addEventListener('click', () => removeAxis('row', state.rowLabels.length - 1));
      const rowActions = document.createElement('div');
      rowActions.className = 'axis-add-actions';
      rowActions.append(button, removeRow);
      addCell.append(rowActions);
      addRow.append(addCell);

      const filler = document.createElement('td');
      filler.className = 'axis-add-row-fill';
      filler.colSpan = state.columnLabels.length + 1;
      addRow.append(filler);
      tbody.append(addRow);
    }

    table.append(tbody);
    return table;
  }

  function renderPrimaryMatrix() {
    const completed = state.phase === 'completed' || state.phase === 'draw-uncertain';
    refs.primaryTitle.textContent = completed ? 'Primary' : '配置';
    refs.primaryPileLabel.textContent = state.primaryPiles.length ? `山 ${state.primaryPiles.join(' → ')}` : '';
    const left = refs.primaryMatrix.scrollLeft;
    const top = refs.primaryMatrix.scrollTop;
    refs.primaryMatrix.replaceChildren(createMatrixTable({
      result: state.primaryResult,
      editableHeaders: true,
      label: completed ? `Reading ${state.number} Primary結果` : `Reading ${state.number} 配置`
    }));
    refs.primaryMatrix.scrollLeft = left;
    refs.primaryMatrix.scrollTop = top;
    fitMatrixAxes(refs.primaryMatrix);
  }

  function renderParallelMatrix() {
    if (!state.parallelResult) {
      refs.parallelSection.classList.add('hidden');
      refs.parallelMatrix.replaceChildren();
      refs.parallelPileLabel.textContent = '';
      return;
    }

    refs.parallelSection.classList.remove('hidden');
    refs.parallelPileLabel.textContent = state.parallelPiles.length ? `山 ${state.parallelPiles.join(' → ')}` : '';
    refs.parallelMatrix.replaceChildren(createMatrixTable({
      result: state.parallelResult,
      editableHeaders: true,
      label: `Reading ${state.number} Parallel結果`
    }));
    fitMatrixAxes(refs.parallelMatrix);
  }

  function capacityOf(pileIds) {
    return pileIds.reduce((sum, id) =>
      sum + (state.piles.find(pile => pile.pile_id === id)?.count ?? 0), 0);
  }

  function mainReady() {
    return state.primaryPiles.length > 0 &&
      capacityOf(state.primaryPiles) >= requiredCards(state);
  }

  function parallelReady() {
    return state.parallelPiles.length === 0 ||
      capacityOf(state.parallelPiles) >= requiredCards(state);
  }

  function pileHint() {
    const needed = requiredCards(state);
    if (!needed) return '○のマスがありません。少なくとも1マスを使用してください。';
    if (!state.primaryPiles.length) return 'Primaryで山を選択してください。順番どおりに配ります。';
    const mainCount = capacityOf(state.primaryPiles);
    if (mainCount < needed) return `Primaryの山 ${state.primaryPiles.join(' → ')}（${mainCount}/${needed}枚）。枚数確保の為次の山を選択してください。`;
    if (state.parallelPiles.length && !parallelReady()) {
      return `Parallelの山 ${state.parallelPiles.join(' → ')}（${capacityOf(state.parallelPiles)}/${needed}枚）。枚数確保の為次の山を選択してください。`;
    }
    if (state.parallelPiles.length) return `Primary ${state.primaryPiles.join(' → ')}／Parallel ${state.parallelPiles.join(' → ')}：引けます。`;
    return 'Primaryは準備できました。別の引き方を比べる場合はParallel側で山を選択できます。';
  }

  function pileButtons(side) {
    const selected = side === 'primary' ? state.primaryPiles : state.parallelPiles;
    const ready = capacityOf(selected) >= requiredCards(state);
    const canStart = side === 'primary' || mainReady();
    return state.piles.map(pile => {
      const isSelected = selected.includes(pile.pile_id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pile-button';
      button.dataset.pile = pile.pile_id;
      button.dataset.branch = side;
      button.setAttribute('aria-pressed', String(isSelected));
      button.disabled = Boolean(state.pendingOperation) ||
        (!isSelected && (!canStart || ready || requiredCards(state) === 0));
      const name = document.createElement('span');
      name.className = 'pile-name';
      name.textContent = `山 ${pile.pile_id}`;
      const amount = document.createElement('span');
      amount.className = 'pile-count';
      amount.textContent = `${pile.count}枚`;
      const role = document.createElement('span');
      role.className = 'pile-role';
      role.textContent = isSelected ? `${selected.indexOf(pile.pile_id) + 1}番目` : '';
      button.setAttribute('aria-label', `${side === 'primary' ? 'Primary' : 'Parallel'} 山${pile.pile_id} ${pile.count}枚 ${role.textContent || '未選択'}`);
      button.append(name, amount, role);
      button.addEventListener('click', () => selectPile(pile.pile_id, side));
      return button;
    });
  }

  function renderPiles() {
    refs.pileOptions.replaceChildren(...(state.piles.length ? pileButtons('primary') : []));
    refs.parallelPileOptions.replaceChildren(...(state.piles.length ? pileButtons('parallel') : []));
    refs.parallelPileOptions.closest('.pile-set-parallel')?.classList.toggle('pile-set-awaiting', !mainReady());
    if (state.piles.length) setTextStatus(refs.selectionMessage, pileHint());
  }

  function selectPile(pileId, side) {
    if (state.phase !== 'choosing' || state.pendingOperation) return;
    if (side === 'parallel' && !mainReady()) return;
    const selected = side === 'primary' ? state.primaryPiles : state.parallelPiles;
    const index = selected.indexOf(pileId);
    if (index >= 0) selected.splice(index, 1);
    else if (capacityOf(selected) < requiredCards(state)) selected.push(pileId);
    else return;
    state.primaryPile = state.primaryPiles[0] ?? null;
    state.parallelPile = state.parallelPiles[0] ?? null;
    render();
  }

  function updateDrawAction() {
    const choosing = state.phase === 'choosing';
    if (!readings.length || readings.at(-1) === controller) {
      refs.drawButton.classList.toggle('hidden', !choosing);
      refs.drawButton.disabled = !choosing || Boolean(state.pendingOperation) ||
        requiredCards(state) === 0 || !mainReady() || !parallelReady();
    }
  }

  function renderLayoutState() {
    const count = requiredCards(state);
    const canUndo = canEditAxes();
    refs.undoButton.classList.toggle('hidden', !canUndo || state.undoStack.length === 0);
    refs.redoButton.classList.toggle('hidden', !canUndo || state.redoStack.length === 0);
    refs.historyActions.classList.toggle('hidden', !canUndo || (state.undoStack.length === 0 && state.redoStack.length === 0));
    refs.cardCount.textContent = `計${count}枚`;
    refs.deckSummary.textContent = describeDeckChoice(state);

    if (state.phase === 'editing') {
      if (!canAddRow(state) && !canAddColumn(state)) {
        setTextStatus(refs.layoutMessage, 'この配置ではこれ以上行・列を追加できません。');
      } else {
        setTextStatus(refs.layoutMessage, '');
      }
    }

    if (count === 0 && state.phase === 'editing') {
      setTextStatus(refs.layoutMessage, '○のマスがありません。少なくとも1つを使用してください。', 'error');
    }

    if (!readings.length || readings.at(-1) === controller) {
      refs.shuffleButton.disabled = !runtime.apiAvailable || state.phase !== 'editing' ||
        Boolean(state.pendingOperation) || count === 0;
      refs.shuffleButton.classList.toggle('hidden', state.phase !== 'editing');
    }
    refs.copyButton.classList.toggle('hidden', state.phase !== 'completed');
    refs.questionInput.readOnly = state.phase === 'completed' || state.phase === 'draw-uncertain' || Boolean(state.pendingOperation);
  }

  function render() {
    renderLayoutState();
    renderPrimaryMatrix();
    renderParallelMatrix();
    renderPiles();
    updateDrawAction();
  }

  // Once an operation is sent, rendering must derive all button states from
  // this synchronous guard. This prevents event re-entry even if a stale DOM
  // element or rerender tries to invoke a handler while the response is late.
  async function shuffle() {
    if (state.phase !== 'editing' || state.pendingOperation) return;

    state.pendingOperation = 'shuffle';
    render();
    setTextStatus(refs.status, 'シャッフル中…');

    try {
      const session = await api('/api/sessions', { method: 'POST', body: '{}' });
      state.sessionId = session.session_id;
      const split = await api(`/api/sessions/${encodeURIComponent(session.session_id)}/shuffle`, {
        method: 'POST', body: JSON.stringify({
          include_title: state.includeTitle, include_secondary: state.includeSecondary, deck_id: state.deckId
        })
      });
      const actualCounts = split.piles?.map(pile => pile.count);
      const expectedCounts = deckCardCount(state) === 80 ? [27, 27, 26]
        : deckCardCount(state) === 79 ? [27, 26, 26] : [26, 26, 26];
      if (!actualCounts || actualCounts.length !== 3 ||
          expectedCounts.some((count, index) => actualCounts[index] !== count) ||
          (split.include_title !== state.includeTitle || split.include_secondary !== state.includeSecondary) ||
          (state.deckId === 'A' && split.deck_id !== 'A') ||
          (split.deck_id !== undefined && split.deck_id !== state.deckId)) {
        throw new Error('選んだ78/80枚設定を抽選APIが確認できませんでした。現在の結果は使わず、新しい占いからやり直してください。');
      }
      state.piles = split.piles;
      state.primaryPile = null;
      state.parallelPile = null;
      state.primaryPiles = [];
      state.parallelPiles = [];
      state.phase = 'choosing';
      // No size changes after shuffle: pre-shuffle structural snapshots must not
      // be replayed into the fixed server session. New moves remain undoable.
      state.undoStack.length = 0;
      state.redoStack.length = 0;
      refs.pilePanel.classList.remove('hidden');
      setTextStatus(refs.selectionMessage, 'メインの山を選択してください。');
      setTextStatus(refs.status, '山を選択');
    } catch (error) {
      setTextStatus(refs.status, `シャッフル結果を確認できませんでした。未完成の山は使用しません。${error.message}`, 'error');
    } finally {
      state.pendingOperation = null;
      renderPiles();
      render();
    }
  }

  async function createBranchAndDraw(sessionId, pileId, positions) {
    const branch = await api(`/api/sessions/${encodeURIComponent(sessionId)}/branches`, {
      method: 'POST', body: JSON.stringify({ pile: pileId })
    });
    if (branch.pile_id !== pileId) throw new Error('選択した山とAPIの分岐応答が一致しません。');
    const result = await api(`/api/branches/${encodeURIComponent(branch.branch_id)}/draw`, {
      method: 'POST', body: JSON.stringify({ positions })
    });
    if (result.pile_id !== pileId || !result.positions ||
        positions.some(position => !result.positions[position])) {
      throw new Error('抽選結果の山または配置位置が要求と一致しません。');
    }
    return result;
  }

  async function drawPileSequence(intent, pileIds) {
    if (!pileIds.length || new Set(pileIds).size !== pileIds.length) {
      throw new Error('選択した山の順番が不正です。');
    }
    const tasks = planPileDraws(pileIds, intent.piles, intent.positions)
      .map(({ pileId, positions }) => ({ pileId, batch: positions }));

    // Every pile is a separate immutable backend branch from the same shuffled
    // snapshot. Never retry an unknown network outcome or silently change piles.
    const outcomes = await Promise.allSettled(tasks.map(part =>
      createBranchAndDraw(intent.sessionId, part.pileId, part.batch)));
    if (outcomes.some(outcome => outcome.status === 'rejected')) {
      throw new Error('複数の山の一部の抽選結果が不明です。二重抽選を避けるため再試行しません。');
    }
    const positions = Object.assign({}, ...outcomes.map(outcome => outcome.value.positions));
    if (Object.keys(positions).length !== intent.positions.length ||
        intent.positions.some(id => !positions[id])) {
      throw new Error('複数の山を結合した結果が完全ではありません。');
    }
    return { pile_id: pileIds[0], piles: [...pileIds], positions };
  }

  function snapshotDrawIntent() {
    return Object.freeze({
      sessionId: state.sessionId,
      deckId: state.deckId,
      includeTitle: state.includeTitle,
      includeSecondary: state.includeSecondary,
      question: state.question,
      rowLabels: Object.freeze([...state.rowLabels]),
      columnLabels: Object.freeze([...state.columnLabels]),
      primaryPile: state.primaryPile,
      parallelPile: state.parallelPile,
      primaryPiles: Object.freeze([...state.primaryPiles]),
      parallelPiles: Object.freeze([...state.parallelPiles]),
      piles: Object.freeze(state.piles.map(p => Object.freeze({ pile_id: p.pile_id, count: p.count }))),
      positions: Object.freeze(buildPositionIds(state.rowLabels.length, state.columnLabels.length)
        .filter(id => !state.inactivePositions.has(id))),
      inactivePositions: Object.freeze([...state.inactivePositions])
    });
  }

  async function draw() {
    if (state.phase !== 'choosing' || !mainReady() || !parallelReady() ||
        !state.sessionId || state.pendingOperation || state.drawOutcome || requiredCards(state) === 0) return;

    const intent = snapshotDrawIntent();
    state.pendingOperation = 'draw';
    renderPiles();
    render();
    setTextStatus(refs.status, '抽選中…');

    try {
      const outcomes = await Promise.allSettled([
        drawPileSequence(intent, intent.primaryPiles),
        intent.parallelPiles.length
          ? drawPileSequence(intent, intent.parallelPiles)
          : Promise.resolve(null)
      ]);
      const primary = outcomes[0].status === 'fulfilled' ? outcomes[0].value : null;
      const parallel = outcomes[1].status === 'fulfilled' ? outcomes[1].value : null;
      const failed = outcomes.some(outcome => outcome.status === 'rejected');

      // Display metadata must belong to the request that actually produced
      // the result, never a mutable selection changed during a pending fetch.
      state.question = intent.question;
      state.rowLabels = [...intent.rowLabels];
      state.columnLabels = [...intent.columnLabels];
      state.inactivePositions = new Set(intent.inactivePositions);
      state.primaryPile = intent.primaryPile;
      state.parallelPile = intent.parallelPile;
      state.primaryPiles = [...intent.primaryPiles];
      state.parallelPiles = [...intent.parallelPiles];
      state.primaryResult = primary;
      state.parallelResult = parallel;

      if (failed) {
        // The remote branch may already have committed; no implicit DELETE,
        // retry or replacement random draw is safe without a server receipt.
        state.drawOutcome = 'unknown';
        state.phase = 'draw-uncertain';
        const got = [primary && `Primary 山${intent.primaryPiles.join(' → ')}`,
          parallel && `Parallel 山${intent.parallelPiles.join(' → ')}`].filter(Boolean).join('・');
        setTextStatus(refs.status, got
          ? `${got} の結果は取得できました。ほかの抽選は確定状況が不明です。二重抽選を避けるため、この占いの再試行を停止しました。`
          : '抽選結果を確認できませんでした。サーバー側で確定済みの可能性があるため、同じ抽選の再試行は停止しました。', 'error');
        page.newReadingButton.classList.remove('hidden');
      } else {
        state.drawOutcome = 'completed';
        state.phase = 'completed';
        setTextStatus(refs.status, '抽選完了');
        page.newReadingButton.classList.remove('hidden');
        const completedSession = intent.sessionId;
        state.sessionId = null;
        if (completedSession) {
          api(`/api/sessions/${encodeURIComponent(completedSession)}`, { method: 'DELETE' }).catch(() => {});
        }
      }
      refs.pilePanel.classList.add('hidden');
    } catch (error) {
      // Even unexpected response-processing errors may follow an already
      // committed server draw, so do not restore an actionable Draw button.
      state.drawOutcome = 'unknown';
      state.phase = 'draw-uncertain';
      refs.pilePanel.classList.add('hidden');
      page.newReadingButton.classList.remove('hidden');
      setTextStatus(refs.status,
        `結果を安全に確定できませんでした。再抽選せず新しい占いからやり直してください。（${error.message}）`, 'error');
    } finally {
      state.pendingOperation = null;
      renderPiles();
      render();
    }
  }

  async function copyReading() {
    const text = formatReadingMarkdown({
      question: state.question,
      deckId: state.deckId,
      rowCount: state.rowLabels.length,
      columnCount: state.columnLabels.length,
      rowLabels: state.rowLabels,
      columnLabels: state.columnLabels,
      inactivePositions: [...state.inactivePositions],
      primary: state.primaryResult,
      parallel: state.parallelResult,
      primaryPile: state.primaryPiles.join(' → '),
      parallelPile: state.parallelPiles.join(' → ')
    });

    try {
      await copyText(text);
      setTextStatus(refs.copyFeedback, 'コピーしました。');
    } catch (error) {
      setTextStatus(refs.copyFeedback, error.message, 'error');
    }
  }

  render();
  if (runtime.apiAvailable) {
    setTextStatus(refs.status, '問いと配置を編集');
  } else {
    refs.shuffleButton.disabled = true;
    setTextStatus(refs.status, 'API未接続のため抽選できません。', 'error');
  }

  return controller;
}

function appendReading() {
  const controller = createReadingController(nextReadingNumber++);
  readings.push(controller);
  page.readings.append(controller.article);
  controller.render();
  page.newReadingButton.classList.add('hidden');
  controller.focusQuestion();
  controller.article.scrollIntoView({ block: 'start' });
}

page.shuffleButton.addEventListener('click', () => readings.at(-1)?.shuffle());
page.drawButton.addEventListener('click', () => readings.at(-1)?.draw());
page.newReadingButton.addEventListener('click', appendReading);

appendReading();
