import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { CARD_CATALOG } from '../src/cards.js';

const ROOT = resolve(process.cwd(), 'web/assets/cards');
const GRID_DIR = resolve(ROOT, 'grid');
const DETAIL_DIR = resolve(ROOT, 'detail');
const SOURCE_WIDTH = 512;
const GRID_WIDTH = 128;
const DETAIL_WIDTH = 256;
const GRID_TARGET = 24 * 1024;
const DETAIL_TARGET = 56 * 1024;

function filenameForCard(card) {
  return card.card_id.replaceAll('.', '-') + '.webp';
}

function sourceFileTitle(card) {
  if (card.card_id === 'minor.pentacles.ace') return 'One of Pentacles';
  if (card.card_id === 'minor.swords.ace') return 'One of Swords';
  return card.name_en;
}

function sourceUrl(card) {
  const filename = `${sourceFileTitle(card)} (Rider-Waite Smith tarot deck).png`;
  return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(filename)}?width=${SOURCE_WIDTH}`;
}

async function fetchSource(card) {
  const url = sourceUrl(card);
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'tarot-draw-webp-generator/1.0' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { url, buffer: Buffer.from(await response.arrayBuffer()) };
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`Failed to fetch ${card.card_id}: ${lastError}`);
}

async function encodeWithinBudget(source, width, initialQuality, targetBytes) {
  for (let quality = initialQuality; quality >= 36; quality -= 4) {
    const buffer = await sharp(source)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality, effort: 6, smartSubsample: true })
      .toBuffer();
    if (buffer.length <= targetBytes) return { buffer, quality };
  }
  const buffer = await sharp(source)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 32, effort: 6, smartSubsample: true })
    .toBuffer();
  if (buffer.length > targetBytes) {
    throw new Error(`Could not fit ${width}px image under ${targetBytes} bytes; got ${buffer.length}`);
  }
  return { buffer, quality: 32 };
}

await rm(ROOT, { recursive: true, force: true });
await mkdir(GRID_DIR, { recursive: true });
await mkdir(DETAIL_DIR, { recursive: true });

const standardCards = CARD_CATALOG.filter(card => !card.card_id.startsWith('meta.'));
const manifest = {};

for (const [index, card] of standardCards.entries()) {
  const source = await fetchSource(card);
  const grid = await encodeWithinBudget(source.buffer, GRID_WIDTH, 68, GRID_TARGET);
  const detail = await encodeWithinBudget(source.buffer, DETAIL_WIDTH, 72, DETAIL_TARGET);
  const filename = filenameForCard(card);

  await writeFile(resolve(GRID_DIR, filename), grid.buffer);
  await writeFile(resolve(DETAIL_DIR, filename), detail.buffer);

  manifest[card.card_id] = {
    source_url: source.url,
    grid: { path: `./assets/cards/grid/${filename}`, bytes: grid.buffer.length, quality: grid.quality, width: GRID_WIDTH },
    detail: { path: `./assets/cards/detail/${filename}`, bytes: detail.buffer.length, quality: detail.quality, width: DETAIL_WIDTH }
  };

  console.log(`${index + 1}/${standardCards.length} ${card.card_id}: grid=${grid.buffer.length}B q${grid.quality}, detail=${detail.buffer.length}B q${detail.quality}`);
}

const entries = Object.entries(manifest);
const summary = {
  cards: entries.length,
  grid: {
    max_bytes: Math.max(...entries.map(([, value]) => value.grid.bytes)),
    average_bytes: Math.round(entries.reduce((sum, [, value]) => sum + value.grid.bytes, 0) / entries.length),
    target_bytes: GRID_TARGET
  },
  detail: {
    max_bytes: Math.max(...entries.map(([, value]) => value.detail.bytes)),
    average_bytes: Math.round(entries.reduce((sum, [, value]) => sum + value.detail.bytes, 0) / entries.length),
    target_bytes: DETAIL_TARGET
  }
};

await writeFile(resolve(ROOT, 'manifest.json'), JSON.stringify({ summary, cards: manifest }, null, 2) + '\n', 'utf8');
console.log('SUMMARY=' + JSON.stringify(summary));
