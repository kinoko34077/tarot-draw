// Presentation-only segmentation for already accepted tarot prose.
// Never mutate source wording, add interpretations or include this in export.
export function meaningPoints(text) {
  if (typeof text !== 'string') return [];
  // Keep the punctuation in the source as part of the segment metadata, so
  // tests can reconstruct every original record exactly.
  const parts = text.match(/[^、。]+[、。]?/g) ?? [];
  return parts.map(part => {
    const punctuation = /[、。]$/.exec(part)?.[0] ?? '';
    return { text: part.slice(0, part.length - punctuation.length).trim(), punctuation };
  }).filter(item => item.text);
}

export function renderMeaningPoints(node, source) {
  node.replaceChildren();
  for (const { text } of meaningPoints(source)) {
    const bullet = document.createElement('li');
    bullet.textContent = text;
    node.append(bullet);
  }
}
