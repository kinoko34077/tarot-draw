// Local-only reading archive: the copied Markdown is a display snapshot,
// NEVER a server draw receipt or a trusted API/card-state restoration.
export const HISTORY_KEY = 'tarot-draw.history.v1';
export const HISTORY_LIMIT = 40;
const MAX_TEXT = 256 * 1024;
const MAX_AXES = 80;
const MARKDOWN_ESCAPE = /\\([\\`*_[\]{}()#+.!|>~-])/g;
const decode = text => String(text ?? '').trim().replace(MARKDOWN_ESCAPE, '$1');
const idPattern = /^r(\d+)c(\d+)$/;

function cells(line) {
  if (!/^\s*\|/.test(line)) return null;
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return body.split(/(?<!\\)\|/).map(decode);
}

function tableAt(lines, index) {
  const head = cells(lines[index] ?? '');
  const separator = cells(lines[index + 1] ?? '');
  if (!head || head.length < 2 || head.length > MAX_AXES + 1 ||
      !separator || separator.length !== head.length ||
      !separator.every(c => /^:?-{3,}:?$/.test(c))) return null;
  const rows = [];
  for (let i = index + 2; i < lines.length && rows.length < MAX_AXES; i++) {
    const values = cells(lines[i]);
    if (!values || values.length !== head.length) break;
    rows.push(values);
  }
  if (!rows.length || rows.length * (head.length - 1) > MAX_AXES) return null;
  return { columnLabels: head.slice(1), rowLabels: rows.map(row => row[0]),
    values: rows.map(row => row.slice(1)) };
}

export function parseReadingCopy(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > MAX_TEXT)
    throw Error('読込できる文章は1～262144文字です。');
  const raw = input.replace(/\r\n?/g, '\n').trim();
  const lines = raw.split('\n');
  const questionLine = lines.find(line => /^\s*\*\*問い：\*\*/.test(line)) ??
    lines.find(line => /^\s*Q\.\s*/.test(line)) ?? '';
  const question = questionLine.startsWith('Q.')
    ? questionLine.replace(/^Q\.\s*/, '')
    : questionLine.replace(/^\s*\*\*問い：\*\*\s*/, '');
  const branches = [];
  let currentLabel = 'Primary';
  for (let i = 0; i < lines.length - 2; i++) {
    const line = lines[i].trim();
    if (/^##\s*(メインリーディング|Primary)/.test(line) || line === '【Primary】')
      currentLabel = 'Primary';
    if (/^##\s*(パラレルリーディング|Parallel)/.test(line) || line === '【Parallel】')
      currentLabel = 'Parallel';
    if (/^###/.test(line) && !/^###\s*メイン/.test(line)) continue;
    const table = tableAt(lines, i);
    if (table) {
      branches.push({ label: currentLabel, ...table });
      i += table.rowLabels.length + 1;
    }
  }
  const primary = branches.find(b => b.label === 'Primary') ?? branches[0];
  if (!primary) throw Error('表が読み取れません。コピーしたMarkdownの表を貼り付けてください。');
  const masked = [];
  for (let r = 0; r < primary.values.length; r++)
    for (let c = 0; c < primary.values[r].length; c++)
      if (primary.values[r][c].trim() === '-') masked.push(`r${r}c${c}`);
  return {
    raw,
    question: decode(question) === '（未入力）' ? '' : decode(question),
    rowLabels: primary.rowLabels,
    columnLabels: primary.columnLabels,
    inactivePositions: masked,
    tables: branches.map(({label,columnLabels,rowLabels,values}) => ({
      label, columnLabels, rowLabels, values
    }))
  };
}

function validatedDeck(deck) {
  if (!deck || typeof deck !== 'object' ||
      !['A', 'B'].includes(deck.deckId) ||
      typeof deck.majorOnly !== 'boolean' ||
      typeof deck.includeTitle !== 'boolean' ||
      typeof deck.includeSecondary !== 'boolean') return null;
  return { deckId: deck.deckId, majorOnly: deck.majorOnly,
    includeTitle: deck.includeTitle, includeSecondary: deck.includeSecondary };
}

export function safeHistoryRecords(storage) {
  try {
    const raw = storage?.getItem(HISTORY_KEY);
    if (!raw || raw.length > HISTORY_LIMIT * MAX_TEXT) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const valid = [];
    for (const item of list.slice(0, HISTORY_LIMIT)) {
      if (!item || typeof item.id !== 'string' || item.id.length > 128 ||
          !item.id || seen.has(item.id) ||
          typeof item.raw !== 'string' || item.raw.length > MAX_TEXT ||
          typeof item.savedAt !== 'string') continue;
      try {
        // Treat localStorage like imported untrusted data. Regenerate every
        // table and axis from the bounded, human-readable original text:
        // stale or malformed cached tables/deck metadata cannot crash startup.
        const parsed = parseReadingCopy(item.raw);
        valid.push({ id: item.id, savedAt: item.savedAt, ...parsed,
          deck: validatedDeck(item.deck) });
        seen.add(item.id);
      } catch { /* Skip only this malformed record, keep other history. */ }
    }
    return valid;
  } catch { return []; }
}

export function makeHistoryEntry(input, { id, savedAt, deck = null }) {
  const parsed = parseReadingCopy(input);
  return { id, savedAt, ...parsed,
    deck: deck && (deck.deckId === 'A' || deck.deckId === 'B')
      ? {deckId:deck.deckId, majorOnly:Boolean(deck.majorOnly),
          includeTitle:Boolean(deck.includeTitle),includeSecondary:Boolean(deck.includeSecondary)}
      : null
  };
}

export function saveHistoryRecords(storage, records) {
  if (!storage) return false;
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(records.slice(0,HISTORY_LIMIT)));
    return true;
  } catch { return false; }
}

// Mutate the in-memory list only after the requested deletion was durably
// written. Otherwise a deleted item would misleadingly reappear on reload.
export function applyHistoryDeletion(storage, records, id = null) {
  const after = id === null ? [] : records.filter(record => record.id !== id);
  if (id !== null && after.length === records.length) return false;
  if (!saveHistoryRecords(storage, after)) return false;
  records.splice(0, records.length, ...after);
  return true;
}
