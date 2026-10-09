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

/** Interpretive framework only: neither branch represents an actual alternate event. */
export const PARALLEL_READING_NOTE =
  'パラレルリーディングは、別の山を選ぼうか迷ったこと自体にも意味があると捉え、「もしそちらを選んでいたら」という仮の結果を、実際に選んだメインの結果と合わせて観る、この占い独自の方式です。両方の結果は同じシャッフル時点から異なる山に分かれ、それぞれ独立に引いています。';

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

export function moveAxisLabel(labels, fromIndex, toIndex) {
  if (!Array.isArray(labels)) return [];
  if (![fromIndex, toIndex].every(index => Number.isInteger(index) && index >= 0 && index < labels.length)) {
    return [...labels];
  }
  if (fromIndex === toIndex) return [...labels];
  const moved = [...labels];
  const [item] = moved.splice(fromIndex, 1);
  moved.splice(toIndex, 0, item);
  return moved;
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
  // Export compact visible Japanese names without phonetic parenthetical ruby.
  // On-screen ruby HTML and the underlying card identity remain unchanged.
  return parts.orientation ? `${parts.title} ${parts.orientation}` : parts.title;
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
  if (parallel) sections.push(['【パラレルリーディング説明】', PARALLEL_READING_NOTE].join('\n'));

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

/** Visible, lossless n×m results expressed as copy/paste-friendly Markdown. */
export function formatReadingMarkdown({
  question = '',
  rowCount,
  columnCount,
  rowLabels,
  columnLabels,
  primary,
  parallel,
  primaryPile = null,
  parallelPile = null
}) {
  const blocks = [
    '# タロット占い結果',
    `**問い：** ${markdownCell(question) || '（未入力）'}`
  ];

  if (primary) blocks.push(markdownBranch('メインリーディング', primary, primaryPile));
  if (parallel) {
    blocks.push(markdownBranch('パラレルリーディング', parallel, parallelPile));
    blocks.push(['### パラレルリーディングについて', PARALLEL_READING_NOTE].join('\n\n'));
  }

  const notes = customCardNotesForResults(primary, parallel);
  if (notes.length) {
    blocks.push(['### 独自カードについて', ...notes.map(note => `- ${note}`)].join('\n'));
  }
  return blocks.join('\n\n');

  function markdownBranch(name, result, pileId) {
    // `| ... |` and the header separator are deliberate GitHub-flavored
    // Markdown; labels/cards are escaped before insertion.
    const heading = `## ${name}${pileId ? `（山${markdownCell(pileId)}）` : ''}`;
    const headers = [
      '項目',
      ...Array.from({ length: columnCount }, (_, col) =>
        markdownCell(labelOrFallback(columnLabels, col, 'column')))
    ];
    const lines = [
      `| ${headers.join(' | ')} |`,
      `| ${headers.map(() => '---').join(' | ')} |`
    ];
    for (let row = 0; row < rowCount; row += 1) {
      const values = [markdownCell(labelOrFallback(rowLabels, row, 'row'))];
      for (let col = 0; col < columnCount; col += 1) {
        values.push(markdownCell(cardDisplayText(result.positions[`r${row}c${col}`])));
      }
      lines.push(`| ${values.join(' | ')} |`);
    }
    return [heading, ...lines].join('\n');
  }
}

function markdownCell(value) {
  // Treat user-entered names/question as literal text, never as table syntax.
  // A multiline input cannot split or silently shift the table columns.
  return String(value ?? '')
    .trim()
    .replace(/[\r\n\t]+/g, ' / ')
    .replace(/([\\`*_[\]{}()#+.!|>~-])/g, '\\$1');
}
