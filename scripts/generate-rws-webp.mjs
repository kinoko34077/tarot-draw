import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CARD_CATALOG } from '../src/cards.js';

const OUTPUT_DIR = resolve('web/assets/rws');
const SOURCE_WIDTH = 320;
const OUTPUT_WIDTH = 288;
const TARGET_BYTES = 48 * 1024;
const HARD_LIMIT_BYTES = 64 * 1024;
const QUALITIES = [55, 50, 45, 40, 35, 30, 25, 20];

function sourceFileTitle(card) {
  if (card.card_id === 'minor.pentacles.ace') return 'One of Pentacles';
  if (card.card_id === 'minor.swords.ace') return 'One of Swords';
  return card.name_en;
}

function sourceUrl(card) {
  const filename = `${sourceFileTitle(card)} (Rider-Waite Smith tarot deck).png`;
  return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(filename)}?width=${SOURCE_WIDTH}`;
}

function outputName(card) {
  return `${card.card_id}.webp`;
}

async function download(url, path) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'tarot-draw-rws-webp-generator/1.0 (https://github.com/kinoko34077/tarot-draw)'
    }
  });
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(path, bytes);
}

async function encode(sourcePath, outputPath) {
  let last = null;
  for (const quality of QUALITIES) {
    execFileSync('cwebp', [
      '-quiet',
      '-mt',
      '-m', '6',
      '-q', String(quality),
      '-resize', String(OUTPUT_WIDTH), '0',
      sourcePath,
      '-o', outputPath
    ]);
    const info = await stat(outputPath);
    last = { quality, bytes: info.size };
    if (info.size <= TARGET_BYTES) return last;
  }
  if (last.bytes > HARD_LIMIT_BYTES) {
    throw new Error(`WebP exceeds hard limit after compression: ${last.bytes} bytes`);
  }
  return last;
}

await rm(OUTPUT_DIR, { recursive: true, force: true });
await mkdir(OUTPUT_DIR, { recursive: true });
const tempRoot = await mkdtemp(join(tmpdir(), 'tarot-rws-webp-'));

const cards = CARD_CATALOG.filter(card => !card.card_id.startsWith('meta.'));
const entries = [];

try {
  for (const [index, card] of cards.entries()) {
    const pngPath = join(tempRoot, `${index}.png`);
    const webpPath = join(OUTPUT_DIR, outputName(card));
    const url = sourceUrl(card);
    process.stdout.write(`[${index + 1}/${cards.length}] ${card.card_id} ... `);
    await download(url, pngPath);
    const encoded = await encode(pngPath, webpPath);
    console.log(`${encoded.bytes} bytes @ q${encoded.quality}`);
    entries.push({
      card_id: card.card_id,
      file: outputName(card),
      bytes: encoded.bytes,
      quality: encoded.quality
    });
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

const max = entries.reduce((a, b) => b.bytes > a.bytes ? b : a);
const total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
const manifest = {
  schema: 'tarot-rws-webp-manifest.v1',
  source: 'Wikimedia Commons Rider-Waite-Smith tarot deck (Geldard), public domain',
  source_width: SOURCE_WIDTH,
  output_width: OUTPUT_WIDTH,
  target_bytes: TARGET_BYTES,
  hard_limit_bytes: HARD_LIMIT_BYTES,
  cards: entries.length,
  average_bytes: Math.round(total / entries.length),
  max_bytes: max.bytes,
  max_card: max.card_id,
  entries
};
await writeFile(join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

if (entries.length !== 78) throw new Error(`Expected 78 WebP assets, got ${entries.length}`);
if (max.bytes > HARD_LIMIT_BYTES) throw new Error(`Largest WebP exceeds hard limit: ${max.bytes}`);

console.log('RWS_WEBP_SUMMARY=' + JSON.stringify({
  cards: entries.length,
  averageBytes: manifest.average_bytes,
  maxBytes: manifest.max_bytes,
  maxCard: manifest.max_card
}));
