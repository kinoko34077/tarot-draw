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

export function labelOrFallback(labels, index, kind) {
  const value = labels[index]?.trim();
  if (value) return value;
  return kind === 'row' ? `行${index + 1}` : `列${index + 1}`;
}

export function orientationLabel(value) {
  return value === 'reversed' ? '逆位置' : '正位置';
}

export function cardDisplayText(card) {
  if (!card) return '—';

  let name = card.name_ja;
  if (card.card_id === 'meta.guarantee') {
    name = 'GUARANTEE';
  } else if (card.card_id === 'meta.title') {
    name = 'タイトルカード';
  } else if (card.card_id?.startsWith('major.')) {
    const slug = card.card_id.slice('major.'.length);
    const number = MAJOR_NUMBERS[slug];
    if (number) name = `${number} ${name}`;
  }

  return `${name} ${orientationLabel(card.orientation)}`;
}

export function formatReadingText({ rowCount, columnCount, rowLabels, columnLabels, primary, parallel }) {
  const sections = [];
  if (primary) sections.push(formatBranch('Primary', primary));
  if (parallel) sections.push(formatBranch('Parallel', parallel));
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
