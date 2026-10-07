import { MINOR_CARD_DISPLAY } from './card-name-ruby.js';

const MAJOR_NUMBERS = Object.freeze({
  fool: '0',
  magician: 'I',
  'high-priestess': 'II',
  empress: 'III',
  emperor: 'IV',
  hierophant: 'V',
  lovers: 'VI',
  chariot: 'VII',
  strength: 'VIII',
  hermit: 'IX',
  'wheel-of-fortune': 'X',
  justice: 'XI',
  'hanged-man': 'XII',
  death: 'XIII',
  temperance: 'XIV',
  devil: 'XV',
  tower: 'XVI',
  star: 'XVII',
  moon: 'XVIII',
  sun: 'XIX',
  judgement: 'XX',
  world: 'XXI'
});

export const CUSTOM_CARD_NOTES = Object.freeze({
  'meta.title': 'タイトルカード: 愚者（0）より前に位置づける独自カード。正位置・逆位置あり。',
  'meta.guarantee': 'GUARANTEE: 世界（XXI）の後、22に対応づける独自カード。正位置・逆位置あり。'
});

export function buildPositionIds(rowCount, columnCount) {
  const ids = [];
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      ids.push(`r${row}c${column}`);
    }
  }
  return ids;
}

export function resizeLabels(labels, count) {
  return Array.from({ length: count }, (_, index) => labels[index] ?? '');
}

export function appendAxisLabel(labels) {
  return [...labels, ''];
}

export function removeAxisLabel(labels, index) {
  if (!Array.isArray(labels) || labels.length <= 1) return Array.isArray(labels) ? [...labels] : [''];
  if (!Number.isInteger(index) || index < 0 || index >= labels.length) return [...labels];
  return labels.filter((_, current) => current !== index);
}

export function labelOrFallback(labels, index, kind) {
  const value = labels[index]?.trim();
  if (value) return value;
  return kind === 'row' ? `行${index + 1}` : `列${index + 1}`;
}

export function orientationLabel(value) {
  return value === 'reversed' ? '逆位置' : '正位置';
}

export function cardDisplayParts(card) {
  if (!card) return { title: '—', titleHtml: null, plainTitle: '—', orientation: '' };

  let title = card.name_ja;
  let titleHtml = null;
  let plainTitle = title;

  if (card.card_id === 'meta.guarantee') {
    title = 'GUARANTEE';
    plainTitle = title;
  } else if (card.card_id === 'meta.title') {
    title = 'タイトルカード';
    plainTitle = title;
  } else if (card.card_id?.startsWith('major.')) {
    const slug = card.card_id.slice('major.'.length);
    const number = MAJOR_NUMBERS[slug];
    if (number) title = `${number} ${title}`;
    plainTitle = title;
  } else if (card.card_id?.startsWith('minor.')) {
    const display = MINOR_CARD_DISPLAY[card.card_id];
    if (display) {
      title = display.compact;
      titleHtml = display.html;
      plainTitle = display.plain;
    }
  }

  return { title, titleHtml, plainTitle, orientation: orientationLabel(card.orientation) };
}

export function cardDisplayText(card) {
  const parts = cardDisplayParts(card);
  return parts.orientation ? `${parts.plainTitle} ${parts.orientation}` : parts.plainTitle;
}

export function rwsImageUrl(card, width = 128) {
  if (!card?.card_id || card.card_id.startsWith('meta.')) return null;

  const variant = Number(width) > 160 ? 'detail' : 'grid';
  const filename = card.card_id.replaceAll('.', '-') + '.webp';
  return `./assets/cards/${variant}/${filename}`;
}


export function customCardNotesForResults(...results) {
  const seen = new Set();
  for (const result of results) {
    for (const card of Object.values(result?.positions ?? {})) {
      if (CUSTOM_CARD_NOTES[card?.card_id]) seen.add(card.card_id);
    }
  }

  return ['meta.title', 'meta.guarantee']
    .filter(cardId => seen.has(cardId))
    .map(cardId => CUSTOM_CARD_NOTES[cardId]);
}

export function formatReadingText({
  question = '',
  rowCount,
  columnCount,
  rowLabels,
  columnLabels,
  primary,
  parallel
}) {
  const sections = [`Q. ${question.trim()}`];

  if (primary) sections.push(formatBranch('Primary', primary));
  if (parallel) sections.push(formatBranch('Parallel', parallel));

  const customNotes = customCardNotesForResults(primary, parallel);
  if (customNotes.length > 0) {
    sections.push(['【独自カード説明】', ...customNotes].join('\n'));
  }

  return sections.join('\n\n');

  function formatBranch(branchLabel, result) {
    const lines = [`【${branchLabel}】`];
    const headers = [
      '',
      ...Array.from({ length: columnCount }, (_, column) => labelOrFallback(columnLabels, column, 'column'))
    ];
    lines.push(headers.join('\t'));

    for (let row = 0; row < rowCount; row += 1) {
      const cells = [labelOrFallback(rowLabels, row, 'row')];
      for (let column = 0; column < columnCount; column += 1) {
        const positionId = `r${row}c${column}`;
        cells.push(cardDisplayText(result.positions[positionId]));
      }
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  }
}
