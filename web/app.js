import { buildPositionIds, formatReadingText, labelOrFallback, orientationLabel, resizeLabels } from './model.js';

const els = {
  rowCount: document.querySelector('#rowCount'),
  columnCount: document.querySelector('#columnCount'),
  rowLabels: document.querySelector('#rowLabels'),
  columnLabels: document.querySelector('#columnLabels'),
  cellCount: document.querySelector('#cellCount'),
  layoutMessage: document.querySelector('#layoutMessage'),
  shuffleButton: document.querySelector('#shuffleButton'),
  drawButton: document.querySelector('#drawButton'),
  resetButton: document.querySelector('#resetButton'),
  piles: document.querySelector('#piles'),
  selectionMessage: document.querySelector('#selectionMessage'),
  resultSection: document.querySelector('#resultSection'),
  results: document.querySelector('#results'),
  copyButton: document.querySelector('#copyButton'),
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

function syncDimensions() {
  state.rowCount = parseDimension(els.rowCount.value);
  state.columnCount = parseDimension(els.columnCount.value);
  els.rowCount.value = String(state.rowCount);
  els.columnCount.value = String(state.columnCount);
  state.rowLabels = resizeLabels(state.rowLabels, state.rowCount);
  state.columnLabels = resizeLabels(state.columnLabels, state.columnCount);
  renderLabelInputs();
  renderLayoutStatus();
  if (state.primaryResult) renderResults();
}

function renderLabelInputs() {
  renderLabelGroup(els.rowLabels, state.rowLabels, '行', 'rowLabels');
  renderLabelGroup(els.columnLabels, state.columnLabels, '列', 'columnLabels');
}

function renderLabelGroup(container, labels, prefix, stateKey) {
  container.replaceChildren(...labels.map((value, index) => {
    const label = document.createElement('label');
    label.textContent = `${prefix}${index + 1}`;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.autocomplete = 'off';
    input.addEventListener('input', event => {
      const next = [...state[stateKey]];
      next[index] = event.target.value;
      state[stateKey] = next;
      if (state.primaryResult) renderResults();
    });
    label.append(input);
    return label;
  }));
}

function requiredCards() {
  return state.rowCount * state.columnCount;
}

function renderLayoutStatus() {
  const count = requiredCards();
  els.cellCount.textContent = `${count}枚`;
  if (count > 27) {
    setHelper(els.layoutMessage, '1つの山は最大27枚です。行×列を27以下にしてください。', 'error');
    els.shuffleButton.disabled = true;
  } else {
    setHelper(els.layoutMessage, count === 27 ? '27枚配置では26枚のC山は選べません。' : '');
    els.shuffleButton.disabled = Boolean(state.sessionId);
  }
  renderPiles();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
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
    renderPiles();
    updateDrawAction();
    setStatus('3つの山からPrimaryを選んでください。');
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

    const title = document.createElement('strong');
    title.textContent = `山 ${pile.pile_id}`;
    const meta = document.createElement('small');
    meta.textContent = `${pile.count}枚`;
    const role = document.createElement('span');
    role.className = 'pile-role';
    role.textContent = pile.pile_id === state.primaryPile
      ? 'Primary'
      : pile.pile_id === state.parallelPile
        ? 'Parallel'
        : button.disabled
          ? `${count}枚配置では不足`
          : '選択';

    button.setAttribute('aria-label', `山${pile.pile_id} ${pile.count}枚 ${role.textContent}`);
    button.append(title, meta, role);
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
  updateDrawAction();
  if (!state.primaryPile) {
    setHelper(els.selectionMessage, 'Primaryを1つ選んでください。');
  } else if (!state.parallelPile) {
    setHelper(els.selectionMessage, `Primary: ${state.primaryPile}。必要なら別の山をParallelとして選べます。`);
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
    renderResults();
    els.drawButton.classList.add('hidden');
    els.resultSection.classList.remove('hidden');
    els.copyButton.focus();
    setStatus('抽選結果を表示しました。');
  } catch (error) {
    els.drawButton.disabled = false;
    const details = error.details ? `（${error.details.available}枚利用可能）` : '';
    setStatus(`${error.message}${details}`, 'error');
  }
}

function renderResults() {
  if (!state.primaryResult) return;
  const branches = [
    ['Primary', state.primaryResult],
    ...(state.parallelResult ? [['Parallel', state.parallelResult]] : [])
  ];

  els.results.replaceChildren(...branches.map(([name, result]) => {
    const section = document.createElement('section');
    section.className = 'branch-result';
    const heading = document.createElement('h3');
    heading.textContent = name;
    const grid = document.createElement('div');
    grid.className = 'result-grid';
    grid.style.setProperty('--column-count', String(state.columnCount));

    for (let row = 0; row < state.rowCount; row += 1) {
      for (let column = 0; column < state.columnCount; column += 1) {
        const id = `r${row}c${column}`;
        const card = result.positions[id];
        const cell = document.createElement('article');
        cell.className = 'result-cell';
        const context = document.createElement('div');
        context.className = 'result-context';
        context.textContent = `${labelOrFallback(state.rowLabels, row, 'row')} / ${labelOrFallback(state.columnLabels, column, 'column')}`;
        const cardName = document.createElement('div');
        cardName.className = 'result-name';
        cardName.textContent = card.name_ja;
        const orientation = document.createElement('div');
        orientation.className = 'result-orientation';
        orientation.textContent = orientationLabel(card.orientation);
        cell.append(context, cardName, orientation);
        grid.append(cell);
      }
    }

    section.append(heading, grid);
    return section;
  }));
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
  els.resultSection.classList.add('hidden');
  els.results.replaceChildren();
  setHelper(els.selectionMessage, '');
  renderPiles();
  renderLayoutStatus();
  setStatus('新しいリーディングを開始できます。');
  if (oldSessionId) {
    try {
      await api(`/api/sessions/${encodeURIComponent(oldSessionId)}`, { method: 'DELETE' });
    } catch {
      // The local UI is already reset. Server cleanup failure is non-destructive to the new reading.
    }
  }
}

els.rowCount.addEventListener('change', syncDimensions);
els.columnCount.addEventListener('change', syncDimensions);
els.shuffleButton.addEventListener('click', shuffle);
els.drawButton.addEventListener('click', draw);
els.copyButton.addEventListener('click', copyReading);
els.resetButton.addEventListener('click', resetReading);

renderLabelInputs();
renderLayoutStatus();
setHelper(els.selectionMessage, '配置を決めてシャッフルしてください。');
