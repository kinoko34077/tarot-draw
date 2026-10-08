import {
  appendAxisLabel,
  buildPositionIds,
  cardDisplayParts,
  cardDisplayText,
  CUSTOM_CARD_NOTES,
  formatReadingText,
  labelOrFallback,
  moveAxisLabel,
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
  cardDetailCustomText: document.querySelector('#cardDetailCustomText')
};

const readings = [];
let nextReadingNumber = 1;
let axisMenuContext = null;
let lastCardTrigger = null;

function createCardVisual(card, { detail = false } = {}) {
  const visual = document.createElement('div');
  visual.className = detail ? 'card-visual detail-card-visual' : 'card-visual';

  const imageUrl = rwsImageUrl(card, detail ? 224 : 128);
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

  const eyebrow = document.createElement('span');
  eyebrow.textContent = 'CUSTOM';

  const title = document.createElement('strong');
  title.textContent = card.card_id === 'meta.guarantee' ? 'GUARANTEE' : 'TITLE';

  face.append(eyebrow, title);
  visual.append(face);
  return visual;
}

function setCardTitle(element, parts) {
  element.replaceChildren();
  if (parts.titleHtml) element.innerHTML = parts.titleHtml;
  else element.textContent = parts.title;
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

function openCardDetail(card, trigger) {
  const parts = cardDisplayParts(card);
  const detail = cardDetail(card.card_id);
  lastCardTrigger = trigger;

  setCardTitle(page.cardDetailTitle, parts);
  page.cardDetailOrientation.textContent = parts.orientation;
  page.cardDetailVisual.replaceChildren(createCardVisual(card, { detail: true }));
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
    page.cardDetailCustomText.textContent = CUSTOM_CARD_NOTES[card.card_id] ?? '独自カード';
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
  return state.rowLabels.length * state.columnLabels.length;
}

function canAddRow(state) {
  return (state.rowLabels.length + 1) * state.columnLabels.length <= 27;
}

function canAddColumn(state) {
  return state.rowLabels.length * (state.columnLabels.length + 1) <= 27;
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

function createReadingController(number) {
  const state = {
    number,
    phase: 'editing',
    question: '',
    rowLabels: [''],
    columnLabels: ['', '', ''],
    sessionId: null,
    piles: [],
    primaryPile: null,
    parallelPile: null,
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
      <div class="reading-actions">
        <button class="shuffle-button primary" type="button">シャッフル</button>
        <button class="draw-button primary hidden" type="button">引く</button>
      </div>
    </div>

    <label class="question-field">
      <span class="question-prefix">Q.</span>
      <input class="question-input" type="text" autocomplete="off" aria-label="今回の問い" placeholder="今回の問い">
    </label>

    <p class="layout-message helper" role="status"></p>

    <div class="pile-panel hidden" aria-label="山選択">
      <span class="pile-label">山</span>
      <div class="pile-options"></div>
      <p class="selection-message helper pile-status" role="status"></p>
    </div>

    <div class="result-action-line">
      <p class="reading-status status" role="status" aria-live="polite"></p>
      <button class="copy-button secondary hidden" type="button">結果をコピー</button>
      <span class="copy-feedback" role="status" aria-live="polite"></span>
    </div>

    <div class="matrix-stack">
      <section class="matrix-section">
        <div class="matrix-heading">
          <h2 class="primary-title">配置</h2>
          <span class="card-count layout-count" aria-live="polite">1行 × 3列 · 3枚</span>
          <span class="primary-pile-label branch-meta"></span>
          <div class="axis-history-actions">
            <button class="axis-undo-button secondary hidden" type="button" title="直前の編集を元に戻す">戻す</button>
            <button class="axis-redo-button secondary hidden" type="button" title="取り消した編集をやり直す">やり直す</button>
          </div>
        </div>
        <div class="primary-matrix table-scroll"></div>
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
    copyButton: article.querySelector('.copy-button'),
    copyFeedback: article.querySelector('.copy-feedback'),
    shuffleButton: article.querySelector('.shuffle-button'),
    drawButton: article.querySelector('.draw-button'),
    questionInput: article.querySelector('.question-input'),
    layoutMessage: article.querySelector('.layout-message'),
    pilePanel: article.querySelector('.pile-panel'),
    pileOptions: article.querySelector('.pile-options'),
    selectionMessage: article.querySelector('.selection-message'),
    primaryTitle: article.querySelector('.primary-title'),
    primaryPileLabel: article.querySelector('.primary-pile-label'),
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
    focusQuestion
  };

  refs.questionInput.addEventListener('input', event => {
    if (state.pendingOperation || state.phase === 'draw-uncertain' || state.phase === 'completed') return;
    state.question = event.target.value;
  });
  refs.shuffleButton.addEventListener('click', shuffle);
  refs.drawButton.addEventListener('click', draw);
  refs.copyButton.addEventListener('click', copyReading);
  refs.undoButton.addEventListener('click', undoAxis);
  refs.redoButton.addEventListener('click', redoAxis);

  function focusQuestion() {
    refs.questionInput.focus();
  }

  function snapshotAxes() {
    return { rowLabels: [...state.rowLabels], columnLabels: [...state.columnLabels] };
  }

  function recordAxisHistory() {
    state.undoStack.push(snapshotAxes());
    if (state.undoStack.length > 40) state.undoStack.shift();
    state.redoStack.length = 0;
  }

  function applyAxes(snapshot) {
    state.rowLabels = [...snapshot.rowLabels];
    state.columnLabels = [...snapshot.columnLabels];
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
        setTextStatus(refs.layoutMessage, '1つの山は最大27枚です。これ以上行を追加できません。', 'error');
        return;
      }
      recordAxisHistory();
      state.rowLabels = appendAxisLabel(state.rowLabels);
    } else {
      if (!canAddColumn(state)) {
        setTextStatus(refs.layoutMessage, '1つの山は最大27枚です。これ以上列を追加できません。', 'error');
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
    recordAxisHistory();
    if (kind === 'row') {
      state.rowLabels = removeAxisLabel(state.rowLabels, index);
    } else {
      state.columnLabels = removeAxisLabel(state.columnLabels, index);
    }
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
    label.textContent = labelOrFallback(state[stateKey], index, kind);
    label.setAttribute('aria-label', axisName + (index + 1) + 'の名前を編集');
    label.title = '名前を編集';
    label.disabled = Boolean(state.pendingOperation) || state.phase === 'draw-uncertain';

    const menuButton = document.createElement('button');
    menuButton.className = 'axis-menu-trigger';
    menuButton.type = 'button';
    menuButton.textContent = '⠿';
    menuButton.title = 'ドラッグして順番を変更／押して操作／矢印キーでも移動';
    menuButton.setAttribute('aria-label', axisName + (index + 1) + 'を移動・操作');

    function updateParallelHeading() {
      // The reading's server-drawn cards stay at their original position IDs.
      // Renaming is only presentation metadata, including the other branch.
      if (!state.parallelResult) return;
      const selector = kind === 'row' ? '.row-header' : '.column-header';
      const matching = refs.parallelMatrix.querySelectorAll(selector)[index];
      if (matching) matching.textContent = labelOrFallback(state[stateKey], index, kind);
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
        label.textContent = labelOrFallback(values, index, kind);
        input.replaceWith(label);
        updateParallelHeading();
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
      let dropHeader = null;
      const headerSelector = kind === 'row' ? '.row-header' : '.column-header';
      const clearDrop = () => {
        dropHeader?.classList.remove('axis-drop-target');
        dropHeader = null;
      };
      const dropIndexAt = (x, y) => {
        const hit = document.elementFromPoint(x, y)?.closest(headerSelector);
        if (!hit || !refs.primaryMatrix.contains(hit)) return -1;
        return [...refs.primaryMatrix.querySelectorAll(headerSelector)].indexOf(hit);
      };

      // Track across the whole viewport, not only the pressed grip. Pointer
      // capture can be lost in browser-automation, touch and cross-cell cases.
      // Local-only pointerup left a stuck destination highlight.
      const stopTracking = () => {
        window.removeEventListener('pointermove', onPointerMove, true);
        window.removeEventListener('pointerup', onPointerUp, true);
        window.removeEventListener('pointercancel', onPointerCancel, true);
      };
      const onPointerMove = event => {
        if (event.pointerId !== pointerId) return;
        if (!dragged && Math.hypot(event.clientX - originX, event.clientY - originY) < 7) return;
        dragged = true;
        clearDrop();
        const next = dropIndexAt(event.clientX, event.clientY);
        if (next >= 0) {
          dropHeader = refs.primaryMatrix.querySelectorAll(headerSelector)[next];
          dropHeader?.classList.add('axis-drop-target');
        }
      };
      const onPointerUp = event => {
        if (event.pointerId !== pointerId) return;
        const didDrag = dragged;
        const to = didDrag ? dropIndexAt(event.clientX, event.clientY) : -1;
        stopTracking();
        pointerId = null;
        clearDrop();
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
        clearDrop();
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

    const visual = createCardVisual(card);
    const parts = cardDisplayParts(card);

    const label = document.createElement('span');
    label.className = 'card-result-text';

    const title = document.createElement('span');
    title.className = 'card-title';
    setCardTitle(title, parts);

    const orientation = document.createElement('span');
    orientation.className = 'card-orientation';
    orientation.textContent = parts.orientation;

    label.append(title, orientation);
    result.append(visual, label);
    result.setAttribute('aria-label', `${parts.plainTitle} ${parts.orientation}の詳細を表示`);
    result.addEventListener('click', () => openCardDetail(card, result));
    return result;
  }

  function createMatrixTable({ result = null, editableHeaders = false, label }) {
    const table = document.createElement('table');
    table.className = 'reading-table';
    table.setAttribute('aria-label', label);

    const canEditStructure = state.phase === 'editing' && !state.pendingOperation;
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
        th.textContent = labelOrFallback(state.columnLabels, column, 'column');
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
      addColumnHeader.append(addColumn);
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
        rowHeader.textContent = labelOrFallback(state.rowLabels, row, 'row');
      }
      tr.append(rowHeader);

      for (let column = 0; column < state.columnLabels.length; column += 1) {
        const positionId = `r${row}c${column}`;
        const td = document.createElement('td');
        td.className = 'reading-cell';
        td.dataset.position = positionId;

        const card = result?.positions?.[positionId];
        if (card) {
          td.append(createCardResult(card));
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
      addCell.append(button);
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
    refs.primaryPileLabel.textContent = state.primaryPile ? `山 ${state.primaryPile}` : '';
    const left = refs.primaryMatrix.scrollLeft;
    const top = refs.primaryMatrix.scrollTop;
    refs.primaryMatrix.replaceChildren(createMatrixTable({
      result: state.primaryResult,
      editableHeaders: true,
      label: completed ? `Reading ${state.number} Primary結果` : `Reading ${state.number} 配置`
    }));
    refs.primaryMatrix.scrollLeft = left;
    refs.primaryMatrix.scrollTop = top;
  }

  function renderParallelMatrix() {
    if (!state.parallelResult) {
      refs.parallelSection.classList.add('hidden');
      refs.parallelMatrix.replaceChildren();
      refs.parallelPileLabel.textContent = '';
      return;
    }

    refs.parallelSection.classList.remove('hidden');
    refs.parallelPileLabel.textContent = state.parallelPile ? `山 ${state.parallelPile}` : '';
    refs.parallelMatrix.replaceChildren(createMatrixTable({
      result: state.parallelResult,
      editableHeaders: false,
      label: `Reading ${state.number} Parallel結果`
    }));
  }

  function renderPiles() {
    if (state.piles.length === 0) {
      refs.pileOptions.replaceChildren();
      return;
    }

    const count = requiredCards(state);
    refs.pileOptions.replaceChildren(...state.piles.map(pile => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pile-button';

      const selected = pile.pile_id === state.primaryPile || pile.pile_id === state.parallelPile;
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = pile.count < count || Boolean(state.pendingOperation);

      const name = document.createElement('span');
      name.className = 'pile-name';
      name.textContent = `山 ${pile.pile_id}`;

      const meta = document.createElement('span');
      meta.className = 'pile-count';
      meta.textContent = `${pile.count}枚`;

      const role = document.createElement('span');
      role.className = 'pile-role';
      role.textContent = pile.pile_id === state.primaryPile
        ? 'Primary'
        : pile.pile_id === state.parallelPile
          ? 'Parallel'
          : button.disabled
            ? '不足'
            : '';

      button.setAttribute('aria-label', `山${pile.pile_id} ${pile.count}枚 ${role.textContent || '未選択'}`);
      button.append(name, meta, role);
      button.addEventListener('click', () => selectPile(pile.pile_id));
      return button;
    }));
  }

  function selectPile(pileId) {
    if (state.phase !== 'choosing' || state.pendingOperation) return;

    if (pileId === state.primaryPile) {
      state.primaryPile = null;
      state.parallelPile = null;
    } else if (pileId === state.parallelPile) {
      state.parallelPile = null;
    } else if (!state.primaryPile) {
      state.primaryPile = pileId;
    } else {
      state.parallelPile = pileId;
    }

    renderPiles();
    render();
    updateDrawAction();

    if (!state.primaryPile) {
      setTextStatus(refs.selectionMessage, 'Primaryの山を選択してください。');
    } else if (!state.parallelPile) {
      setTextStatus(refs.selectionMessage, `Primary: ${state.primaryPile} · 2つ目を選ぶとParallel`);
    } else {
      setTextStatus(refs.selectionMessage, `Primary: ${state.primaryPile} / Parallel: ${state.parallelPile}`);
    }
  }

  function updateDrawAction() {
    const choosing = state.phase === 'choosing';
    refs.drawButton.classList.toggle('hidden', !choosing);
    refs.drawButton.disabled = !state.primaryPile || !choosing || Boolean(state.pendingOperation);
  }

  function renderLayoutState() {
    const count = requiredCards(state);
    const canUndo = canEditAxes();
    refs.undoButton.classList.toggle('hidden', !canUndo || state.undoStack.length === 0);
    refs.redoButton.classList.toggle('hidden', !canUndo || state.redoStack.length === 0);
    refs.cardCount.textContent = `${state.rowLabels.length}行 × ${state.columnLabels.length}列 · ${count}枚`;

    if (state.phase === 'editing') {
      if (count === 27) {
        setTextStatus(refs.layoutMessage, '27枚配置では26枚のC山は選べません。');
      } else if (!canAddRow(state) && !canAddColumn(state)) {
        setTextStatus(refs.layoutMessage, 'この配置ではこれ以上行・列を追加できません。');
      } else {
        setTextStatus(refs.layoutMessage, '');
      }
    }

    refs.shuffleButton.disabled = !runtime.apiAvailable || state.phase !== 'editing' || Boolean(state.pendingOperation);
    refs.shuffleButton.classList.toggle('hidden', state.phase !== 'editing');
    refs.copyButton.classList.toggle('hidden', state.phase !== 'completed');
    refs.questionInput.readOnly = state.phase === 'completed' || state.phase === 'draw-uncertain' || Boolean(state.pendingOperation);
  }

  function render() {
    renderLayoutState();
    renderPrimaryMatrix();
    renderParallelMatrix();
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
        method: 'POST', body: '{}'
      });
      state.piles = split.piles;
      state.primaryPile = null;
      state.parallelPile = null;
      state.phase = 'choosing';
      // No size changes after shuffle: pre-shuffle structural snapshots must not
      // be replayed into the fixed server session. New moves remain undoable.
      state.undoStack.length = 0;
      state.redoStack.length = 0;
      refs.pilePanel.classList.remove('hidden');
      setTextStatus(refs.selectionMessage, 'Primaryの山を選択してください。');
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

  function snapshotDrawIntent() {
    return Object.freeze({
      sessionId: state.sessionId,
      question: state.question,
      rowLabels: Object.freeze([...state.rowLabels]),
      columnLabels: Object.freeze([...state.columnLabels]),
      primaryPile: state.primaryPile,
      parallelPile: state.parallelPile,
      positions: Object.freeze(buildPositionIds(state.rowLabels.length, state.columnLabels.length))
    });
  }

  async function draw() {
    if (state.phase !== 'choosing' || !state.primaryPile || !state.sessionId ||
        state.pendingOperation || state.drawOutcome) return;

    const intent = snapshotDrawIntent();
    state.pendingOperation = 'draw';
    renderPiles();
    render();
    setTextStatus(refs.status, '抽選中…');

    try {
      const outcomes = await Promise.allSettled([
        createBranchAndDraw(intent.sessionId, intent.primaryPile, intent.positions),
        intent.parallelPile
          ? createBranchAndDraw(intent.sessionId, intent.parallelPile, intent.positions)
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
      state.primaryPile = intent.primaryPile;
      state.parallelPile = intent.parallelPile;
      state.primaryResult = primary;
      state.parallelResult = parallel;

      if (failed) {
        // The remote branch may already have committed; no implicit DELETE,
        // retry or replacement random draw is safe without a server receipt.
        state.drawOutcome = 'unknown';
        state.phase = 'draw-uncertain';
        const got = [primary && `Primary 山${intent.primaryPile}`,
          parallel && `Parallel 山${intent.parallelPile}`].filter(Boolean).join('・');
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
    const text = formatReadingText({
      question: state.question,
      rowCount: state.rowLabels.length,
      columnCount: state.columnLabels.length,
      rowLabels: state.rowLabels,
      columnLabels: state.columnLabels,
      primary: state.primaryResult,
      parallel: state.parallelResult
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
  page.newReadingButton.classList.add('hidden');
  controller.focusQuestion();
  controller.article.scrollIntoView({ block: 'start' });
}

page.newReadingButton.addEventListener('click', appendReading);

appendReading();
