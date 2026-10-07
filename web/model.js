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

export function formatReadingText({ rowCount, columnCount, rowLabels, columnLabels, primary, parallel }) {
  const sections = [];
  if (primary) sections.push(formatBranch('Primary', primary));
  if (parallel) sections.push(formatBranch('Parallel', parallel));
  return sections.join('\n\n');

  function formatBranch(branchLabel, result) {
    const lines = [`【${branchLabel}】`];
    for (let row = 0; row < rowCount; row += 1) {
      for (let column = 0; column < columnCount; column += 1) {
        const positionId = `r${row}c${column}`;
        const card = result.positions[positionId];
        if (!card) continue;
        const rowName = labelOrFallback(rowLabels, row, 'row');
        const columnName = labelOrFallback(columnLabels, column, 'column');
        lines.push(`${rowName} / ${columnName}: ${card.name_ja}（${orientationLabel(card.orientation)}）`);
      }
    }
    return lines.join('\n');
  }
}
