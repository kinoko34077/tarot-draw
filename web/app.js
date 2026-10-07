import {
  appendAxisLabel,
  buildPositionIds,
  cardDisplayParts,
  cardDisplayText,
  CUSTOM_CARD_NOTES,
  formatReadingText,
  labelOrFallback,
  removeAxisLabel,
  referenceImageUrl,
  rwsImageUrl
} from './model.js';
import { cardDetail } from './card-details.js';
import { buildApiUrl, resolveRuntimeConfig } from './runtime-config.js';

const runtime = resolveRuntimeConfig(globalThis.__TAROT_DRAW_CONFIG__ ?? {});
const LONG_PRESS_MS = 520;

const page = {
  readings: document.querySelector('#readings'),
  newReadingButton: document.querySelector('#newReadingButton'),
  axisMenu: document.querySelector('#axisMenu'),
  deleteAxisButton: document.querySelector('#deleteAxisButton'),
  cardDetailDialog: document.querySelector('#cardDetailDialog'),
  cardDetailClose: document.querySelector('#cardDetailClose'),
  cardDetailTitle: document.querySelector('#cardDetailTitle'),
  cardDetailOrientation: document.querySelector('#cardDetailOrientation'),
  cardDetailVisual: document.querySelector('#cardDetailVisual'),
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
  if (parts.titleHtml) {
    element.innerHTML = parts.titleHtml;
  } else {
    element.textContent = parts.title;
  }
  element.setAttribute('aria-label', parts.plainTitle);
}

function createReferenceVisual(card, parts) {
  const imageUrl = referenceImageUrl(card);
  if (!imageUrl) return createCardVisual(card, { detail: true });

  const visual = document.createElement('figure');
  visual.className = 'detail-reference-visual';

  const image = document.createElement('img');
  image.className = 'detail-reference-art';
  image.src = imageUrl;
  image.alt = `${parts.plainTitle}の関連語・関連概念図`;
  image.loading = 'eager';
  image.decoding = 'async';

  const caption = document.createElement('figcaption');
  caption.textContent = '関連語・関連概念';

  image.addEventListener('error', () => {
    visual.classList.add('art-failed');
    image.remove();
    caption.textContent = '関連語・関連概念画像を表示できません';
  }, { once: true });

  visual.append(image, caption);
  return visual;
}

function closeCardDetail() {
  if (page.cardDetailDialog.open) page.cardDetailDialog.close();
}

function openCardDetail(card, trigger) {
  const parts = cardDisplayParts(card);
  const detail = cardDetail(card.card_id);
  lastCardTrigger = trigger;

  setCardTitle(page.cardDetailTitle, parts);
  page.cardDetailOrientation.textContent = parts.orientation;
  page.cardDetailVisual.replaceChildren(createReferenceVisual(card, parts));

  if (detail) {
    page.cardDetailReference.classList.remove('hidden');
    page.cardDetailCustom.classList.add('hidden');
    page.cardDetailEssence.textContent = detail.essence;
    page.cardDetailUpright.textContent = detail.upright;
    page.cardDetailReversed.textContent = detail.reversed;
    page.cardDetailUprightBlock.dataset.active = String(card.orientation === 'upright');
    page.cardDetailReversedBlock.dataset.active = String(card.orientation === 'reversed');
  } else {
    page.cardDetailReference.classList.add('hidden');
    page.cardDetailCustom.classList.remove('hidden');
    page.cardDetailCustomText.textContent = CUSTOM_CARD_NOTES[card.card_id] ?? '独自カード';
  }

  page.cardDetailDialog.showModal();
}

page.cardDetailClose.addEventListener('click', closeCardDetail);
page.cardDetailDialog.addEventListener('click', event => {
  if (event.target === page.cardDetailDialog) closeCardDetail();
});
page.cardDetailDialog.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeCardDetail();
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
  if (controller.state.phase !== 'editing') return;

  axisMenuContext = { controller, kind, index, trigger };
  const count = kind === 'row'
    ? controller.state.rowLabels.length
    : controller.state.columnLabels.length;

  page.deleteAxisButton.textContent = kind === 'row' ? 'この行を削除' : 'この列を削除';
  page.deleteAxisButton.disabled = count <= 1;
  page.deleteAxisButton.title = count <= 1 ? '最低1つの行・列が必要です' : '';

  const rect = trigger.getBoundingClientRect();
  const left = point?.x ?? Math.min(window.innerWidth - 180, Math.max(8, rect.left));
  const top = point?.y ?? Math.min(window.innerHeight - 52, rect.bottom + 4);

  page.axisMenu.style.left = `${left}px`;
  page.axisMenu.style.top = `${top}px`;
  page.axisMenu.classList.remove('hidden');
  requestAnimationFrame(() => page.deleteAxisButton.focus());
}

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
    if (event.button !== 0 || controller.state.phase !== 'editing') return;
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
    if (controller.state.phase !== 'editing') return;
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
    parallelResult: null
  };

  const article = document.createElement('article');
  article.className = 'reading-workbench';
  article.dataset.reading = String(number);

  article.innerHTML = `
    <div class="reading-toolbar">
      <span class="reading-index">Reading ${number}</span>
      <span class="card-count badge">3枚</span>
      <div class="reading-actions">
        <button class="copy-button secondary hidden" type="button">コピー</button>
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

    <div class="matrix-stack">
      <section class="matrix-section">
        <div class="matrix-heading">
          <h2 class="primary-title">配置</h2>
          <span class="primary-pile-label branch-meta"></span>
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

    <p class="reading-status status" role="status" aria-live="polite"></p>
  `;

  const refs = {
    cardCount: article.querySelector('.card-count'),
    copyButton: article.querySelector('.copy-button'),
    shuffleButton: article.querySelector('.shuffle-button'),
    drawButton: article.querySelector('.draw-button'),
    questionInput: article.querySelector('.question-input'),
    layoutMessage: article.querySelector('.layout-message'),
    pilePanel: article.querySelector('.pile-panel'),
    pileOptions: article.querySelector('.pile-options'),
    selectionMessage: article.querySelector('.selection-message'),
    primaryTitle: article.querySelector('.primary-title'),
    primaryPileLabel: article.querySelector('.primary-pile-label'),
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
    render,
    focusQuestion
  };

  refs.questionInput.addEventListener('input', event => {
    state.question = event.target.value;
  });
  refs.shuffleButton.addEventListener('click', shuffle);
  refs.drawButton.addEventListener('click', draw);
  refs.copyButton.addEventListener('click', copyReading);

  function focusQuestion() {
    refs.questionInput.focus();
  }

  function addAxis(kind) {
    if (state.phase !== 'editing') return;

    if (kind === 'row') {
      if (!canAddRow(state)) {
        setTextStatus(refs.layoutMessage, '1つの山は最大27枚です。これ以上行を追加できません。', 'error');
        return;
      }
      state.rowLabels = appendAxisLabel(state.rowLabels);
    } else {
      if (!canAddColumn(state)) {
        setTextStatus(refs.layoutMessage, '1つの山は最大27枚です。これ以上列を追加できません。', 'error');
        return;
      }
      state.columnLabels = appendAxisLabel(state.columnLabels);
    }
    render();
  }

  function removeAxis(kind, index) {
    if (state.phase !== 'editing') return;

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

    const caption = document.createElement('span');
    caption.className = 'axis-caption';
    caption.textContent = `${kind === 'row' ? '行' : '列'}${index + 1}`;

    const menuButton = document.createElement('button');
    menuButton.className = 'axis-menu-trigger';
    menuButton.type = 'button';
    menuButton.textContent = '⋮';
    menuButton.title = `${kind === 'row' ? '行' : '列'}の操作`;
    menuButton.setAttribute('aria-label', `${kind === 'row' ? '行' : '列'}${index + 1}の操作`);

    handle.append(caption, menuButton);

    const input = document.createElement('input');
    input.className = 'axis-input';
    input.type = 'text';
    input.value = state[stateKey][index] ?? '';
    input.autocomplete = 'off';
    input.placeholder = kind === 'row' ? '行名' : '列名';
    input.setAttribute('aria-label', `${kind === 'row' ? '行' : '列'}${index + 1}の名前`);

    input.addEventListener('input', event => {
      const next = [...state[stateKey]];
      next[index] = event.target.value;
      state[stateKey] = next;
    });

    wrapper.append(handle, input);
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

    const canEditStructure = state.phase === 'editing';
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

      if (editableHeaders && state.phase !== 'completed') {
        const editor = createAxisEditor('column', column, 'columnLabels');
        th.append(editor.wrapper);
        if (canEditStructure) bindAxisContextMenu(editor.handle, controller, 'column', column, editor.menuButton);
        if (!canEditStructure) editor.menuButton.classList.add('hidden');
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

      if (editableHeaders && state.phase !== 'completed') {
        const editor = createAxisEditor('row', row, 'rowLabels');
        rowHeader.append(editor.wrapper);
        if (canEditStructure) bindAxisContextMenu(editor.handle, controller, 'row', row, editor.menuButton);
        if (!canEditStructure) editor.menuButton.classList.add('hidden');
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
    const completed = state.phase === 'completed';
    refs.primaryTitle.textContent = completed ? 'Primary' : '配置';
    refs.primaryPileLabel.textContent = state.primaryPile ? `山 ${state.primaryPile}` : '';
    refs.primaryMatrix.replaceChildren(createMatrixTable({
      result: state.primaryResult,
      editableHeaders: true,
      label: completed ? `Reading ${state.number} Primary結果` : `Reading ${state.number} 配置`
    }));
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
      button.disabled = pile.count < count;

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
    if (state.phase !== 'choosing') return;

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
    refs.drawButton.disabled = !state.primaryPile;
  }

  function renderLayoutState() {
    const count = requiredCards(state);
    refs.cardCount.textContent = `${count}枚`;

    if (state.phase === 'editing') {
      if (count === 27) {
        setTextStatus(refs.layoutMessage, '27枚配置では26枚のC山は選べません。');
      } else if (!canAddRow(state) && !canAddColumn(state)) {
        setTextStatus(refs.layoutMessage, 'この配置ではこれ以上行・列を追加できません。');
      } else {
        setTextStatus(refs.layoutMessage, '');
      }
    }

    refs.shuffleButton.disabled = !runtime.apiAvailable || state.phase !== 'editing';
    refs.shuffleButton.classList.toggle('hidden', state.phase !== 'editing');
    refs.copyButton.classList.toggle('hidden', state.phase !== 'completed');
    refs.questionInput.readOnly = state.phase === 'completed';
  }

  function render() {
    renderLayoutState();
    renderPrimaryMatrix();
    renderParallelMatrix();
    updateDrawAction();
  }

  async function shuffle() {
    if (state.phase !== 'editing') return;

    try {
      refs.shuffleButton.disabled = true;
      setTextStatus(refs.status, 'シャッフル中…');

      const session = await api('/api/sessions', { method: 'POST', body: '{}' });
      state.sessionId = session.session_id;
      const split = await api(`/api/sessions/${encodeURIComponent(state.sessionId)}/shuffle`, {
        method: 'POST',
        body: '{}'
      });

      state.piles = split.piles;
      state.primaryPile = null;
      state.parallelPile = null;
      state.phase = 'choosing';

      refs.pilePanel.classList.remove('hidden');
      renderPiles();
      render();
      setTextStatus(refs.selectionMessage, 'Primaryの山を選択してください。');
      setTextStatus(refs.status, '山を選択');
    } catch (error) {
      refs.shuffleButton.disabled = false;
      setTextStatus(refs.status, error.message, 'error');
    }
  }

  async function createBranchAndDraw(pileId, positions) {
    const branch = await api(`/api/sessions/${encodeURIComponent(state.sessionId)}/branches`, {
      method: 'POST',
      body: JSON.stringify({ pile: pileId })
    });

    return api(`/api/branches/${encodeURIComponent(branch.branch_id)}/draw`, {
      method: 'POST',
      body: JSON.stringify({ positions })
    });
  }

  async function draw() {
    if (state.phase !== 'choosing' || !state.primaryPile) return;

    const positions = buildPositionIds(state.rowLabels.length, state.columnLabels.length);
    try {
      refs.drawButton.disabled = true;
      setTextStatus(refs.status, '抽選中…');

      const [primary, parallel] = await Promise.all([
        createBranchAndDraw(state.primaryPile, positions),
        state.parallelPile ? createBranchAndDraw(state.parallelPile, positions) : Promise.resolve(null)
      ]);

      state.primaryResult = primary;
      state.parallelResult = parallel;
      state.phase = 'completed';

      refs.pilePanel.classList.add('hidden');
      render();
      setTextStatus(refs.status, '抽選完了');
      page.newReadingButton.classList.remove('hidden');

      const completedSession = state.sessionId;
      state.sessionId = null;
      if (completedSession) {
        api(`/api/sessions/${encodeURIComponent(completedSession)}`, { method: 'DELETE' }).catch(() => {});
      }
    } catch (error) {
      refs.drawButton.disabled = false;
      const details = error.details ? `（${error.details.available}枚利用可能）` : '';
      setTextStatus(refs.status, `${error.message}${details}`, 'error');
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
      setTextStatus(refs.status, '結果をコピーしました。');
    } catch (error) {
      setTextStatus(refs.status, error.message, 'error');
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
