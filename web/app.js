import { buildPositionIds, cardDisplayText, formatReadingText, labelOrFallback, resizeLabels } from './model.js';
import { buildApiUrl, resolveRuntimeConfig } from './runtime-config.js';

const runtime = resolveRuntimeConfig(globalThis.__TAROT_DRAW_CONFIG__ ?? {});

const els = {
  rowCount: document.querySelector('#rowCount'),
  columnCount: document.querySelector('#columnCount'),
  cellCount: document.querySelector('#cellCount'),
  layoutMessage: document.querySelector('#layoutMessage'),
  shuffleButton: document.querySelector('#shuffleButton'),
  drawButton: document.querySelector('#drawButton'),
  copyButton: document.querySelector('#copyButton'),
  resetButton: document.querySelector('#resetButton'),
  pilePanel: document.querySelector('#pilePanel'),
  piles: document.querySelector('#piles'),
  selectionMessage: document.querySelector('#selectionMessage'),
  matrixTitle: document.querySelector('#matrixTitle'),
  primaryPileLabel: document.querySelector('#primaryPileLabel'),
  primaryMatrix: document.querySelector('#primaryMatrix'),
  parallelSection: document.querySelector('#parallelSection'),
  parallelPileLabel: document.querySelector('#parallelPileLabel'),
  parallelMatrix: document.querySelector('#parallelMatrix'),
  globalStatus: document.querySelector('#globalStatus')
};

const state = {
  rowCount: 1,
  columnCount: 3,
  rowLabels: [''],
  columnLabels: ['', '', ''],
  sessionId: null,
  piles: [],
  primaryPile: null,
  parallelPile: null,
  primaryResult: null,
  parallelResult: null
};

function setStatus(message, kind = 'info') {
  els.globalStatus.textContent = message;
  els.globalStatus.dataset.kind = kind;
}

function setHelper(element, message, kind = 'info') {
  element.textContent = message;
  element.dataset.kind = kind;
}

function parseDimension(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(27, Math.max(1, parsed));
}

function requiredCards() {
  return state.rowCount * state.columnCount;
}

function syncDimensions() {
  state.rowCount = parseDimension(els.rowCount.value);
  state.columnCount = parseDimension(els.columnCount.value);
  els.rowCount.value = String(state.rowCount);
  els.columnCount.value = String(state.columnCount);
  state.rowLabels = resizeLabels(state.rowLabels, state.rowCount);
  state.columnLabels = resizeLabels(state.columnLabels, state.columnCount);
  renderMatrices();
  renderLayoutStatus();
}

function createAxisEditor(kind, index, stateKey) {
  const label = document.createElement('label');
  label.className = 'axis-field';

  const caption = document.createElement('span');
  caption.className = 'axis-caption';
  caption.textContent = `${kind === 'row' ? '行' : '列'}${index + 1}`;

  const input = document.createElement('input');
  input.className = 'axis-input';
  input.type = 'text';
  input.value = state[stateKey][index] ?? '';
  input.autocomplete = 'off';
  input.placeholder = kind === 'row' ? '行名' : '列名';

  input.addEventListener('input', event => {
    const next = [...state[stateKey]];
    next[index] = event.target.value;
    state[stateKey] = next;
    if (state.parallelResult) renderParallelMatrix();
  });

  label.append(caption, input);
  return label;
}

function createMatrixTable({ result = null, editableHeaders = false, label }) {
  const table = document.createElement('table');
  table.className = 'reading-table';
  table.setAttribute('aria-label', label);

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const corner = document.createElement('th');
  corner.className = 'corner-header';
  corner.scope = 'col';
  corner.textContent = '行 / 列';
  headerRow.append(corner);

  for (let column = 0; column < state.columnCount; column += 1) {
    const th = document.createElement('th');
    th.className = 'column-header';
    th.scope = 'col';
    if (editableHeaders) {
      th.append(createAxisEditor('column', column, 'columnLabels'));
    } else {
      th.textContent = labelOrFallback(state.columnLabels, column, 'column');
    }
    headerRow.append(th);
  }

  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  for (let row = 0; row < state.rowCount; row += 1) {
    const tr = document.createElement('tr');

    const rowHeader = document.createElement('th');
    rowHeader.className = 'row-header';
    rowHeader.scope = 'row';
    if (editableHeaders) {
      rowHeader.append(createAxisEditor('row', row, 'rowLabels'));
    } else {
      rowHeader.textContent = labelOrFallback(state.rowLabels, row, 'row');
    }
    tr.append(rowHeader);

    for (let column = 0; column < state.columnCount; column += 1) {
      const positionId = `r${row}c${column}`;
      const td = document.createElement('td');
      td.className = 'reading-cell';
      td.dataset.position = positionId;

      const card = result?.positions?.[positionId];
      const value = document.createElement('span');
      value.className = card ? 'card-result' : 'cell-placeholder';
      value.textContent = card ? cardDisplayText(card) : '—';
      td.append(value);
      tr.append(td);
    }

    tbody.append(tr);
  }

  table.append(tbody);
  return table;
}

function renderPrimaryMatrix() {
  const hasResult = Boolean(state.primaryResult);
  els.matrixTitle.textContent = hasResult ? 'Primary' : '配置';
  els.primaryPileLabel.textContent = state.primaryPile ? `山 ${state.primaryPile}` : '';
  els.primaryMatrix.replaceChildren(createMatrixTable({
    result: state.primaryResult,
    editableHeaders: true,
    label: hasResult ? 'Primaryリーディング結果' : 'リーディング配置'
  }));
}

function renderParallelMatrix() {
  if (!state.parallelResult) {
    els.parallelSection.classList.add('hidden');
    els.parallelMatrix.replaceChildren();
    els.parallelPileLabel.textContent = '';
    return;
  }

  els.parallelSection.classList.remove('hidden');
  els.parallelPileLabel.textContent = state.parallelPile ? `山 ${state.parallelPile}` : '';
  els.parallelMatrix.replaceChildren(createMatrixTable({
    result: state.parallelResult,
    editableHeaders: false,
    label: 'Parallelリーディング結果'
  }));
}

function renderMatrices() {
  renderPrimaryMatrix();
  renderParallelMatrix();
}

function renderLayoutStatus() {
  const count = requiredCards();
  els.cellCount.textContent = `${count}枚`;

  if (count > 27) {
    setHelper(els.layoutMessage, '1つの山は最大27枚です。行×列を27以下にしてください。', 'error');
    els.shuffleButton.disabled = true;
    return;
  }

  setHelper(els.layoutMessage, count === 27 ? '27枚配置では26枚のC山は選べません。' : '');
  els.shuffleButton.disabled = !runtime.apiAvailable || Boolean(state.sessionId);
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

async function shuffle() {
  try {
    setStatus('シャッフル中…');
    const session = await api('/api/sessions', { method: 'POST', body: '{}' });
    state.sessionId = session.session_id;
    const split = await api(`/api/sessions/${encodeURIComponent(state.sessionId)}/shuffle`, { method: 'POST', body: '{}' });

    state.piles = split.piles;
    state.primaryPile = null;
    state.parallelPile = null;
    state.primaryResult = null;
    state.parallelResult = null;

    els.rowCount.disabled = true;
    els.columnCount.disabled = true;
    els.shuffleButton.classList.add('hidden');
    els.pilePanel.classList.remove('hidden');

    renderMatrices();
    renderPiles();
    updateDrawAction();
    setHelper(els.selectionMessage, 'Primaryの山を選択してください。');
    setStatus('山を選択');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function renderPiles() {
  if (state.piles.length === 0) {
    els.piles.replaceChildren();
    return;
  }

  const count = requiredCards();
  els.piles.replaceChildren(...state.piles.map(pile => {
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
  renderMatrices();
  updateDrawAction();

  if (!state.primaryPile) {
    setHelper(els.selectionMessage, 'Primaryの山を選択してください。');
  } else if (!state.parallelPile) {
    setHelper(els.selectionMessage, `Primary: ${state.primaryPile} · 2つ目を選ぶとParallel`);
  } else {
    setHelper(els.selectionMessage, `Primary: ${state.primaryPile} / Parallel: ${state.parallelPile}`);
  }
}

function updateDrawAction() {
  const ready = Boolean(state.sessionId && state.primaryPile);
  els.drawButton.classList.toggle('hidden', !state.sessionId || Boolean(state.primaryResult));
  els.drawButton.disabled = !ready;
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
  if (!state.primaryPile) return;

  const positions = buildPositionIds(state.rowCount, state.columnCount);
  try {
    els.drawButton.disabled = true;
    setStatus('抽選中…');

    const [primary, parallel] = await Promise.all([
      createBranchAndDraw(state.primaryPile, positions),
      state.parallelPile ? createBranchAndDraw(state.parallelPile, positions) : Promise.resolve(null)
    ]);

    state.primaryResult = primary;
    state.parallelResult = parallel;

    els.drawButton.classList.add('hidden');
    els.copyButton.classList.remove('hidden');
    els.pilePanel.classList.add('hidden');

    renderMatrices();
    setStatus('抽選完了');
  } catch (error) {
    els.drawButton.disabled = false;
    const details = error.details ? `（${error.details.available}枚利用可能）` : '';
    setStatus(`${error.message}${details}`, 'error');
  }
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

async function copyReading() {
  const text = formatReadingText({
    rowCount: state.rowCount,
    columnCount: state.columnCount,
    rowLabels: state.rowLabels,
    columnLabels: state.columnLabels,
    primary: state.primaryResult,
    parallel: state.parallelResult
  });

  try {
    await copyText(text);
    setStatus('結果をコピーしました。');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function resetReading() {
  if (state.sessionId && !window.confirm('現在のリーディングを破棄して新しく始めますか？')) return;

  const oldSessionId = state.sessionId;
  state.sessionId = null;
  state.piles = [];
  state.primaryPile = null;
  state.parallelPile = null;
  state.primaryResult = null;
  state.parallelResult = null;

  els.rowCount.disabled = false;
  els.columnCount.disabled = false;
  els.shuffleButton.classList.remove('hidden');
  els.drawButton.classList.add('hidden');
  els.copyButton.classList.add('hidden');
  els.pilePanel.classList.add('hidden');

  setHelper(els.selectionMessage, '');
  renderPiles();
  renderMatrices();
  renderLayoutStatus();
  setStatus('新しいリーディング');

  if (oldSessionId) {
    try {
      await api(`/api/sessions/${encodeURIComponent(oldSessionId)}`, { method: 'DELETE' });
    } catch {
      // Local reset is already complete. Server cleanup failure does not block a new reading.
    }
  }
}

els.rowCount.addEventListener('change', syncDimensions);
els.columnCount.addEventListener('change', syncDimensions);
els.shuffleButton.addEventListener('click', shuffle);
els.drawButton.addEventListener('click', draw);
els.copyButton.addEventListener('click', copyReading);
els.resetButton.addEventListener('click', resetReading);

renderMatrices();
renderLayoutStatus();

if (runtime.apiAvailable) {
  setStatus('配置を編集');
} else {
  els.shuffleButton.disabled = true;
  setStatus('API未接続のため抽選できません。', 'error');
}
