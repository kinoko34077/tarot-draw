import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { CARD_REFERENCE_SOURCES } from './card-reference-sources.mjs';

const ROOT = resolve(process.cwd(), 'web/assets/cards/reference');
const OUTPUT_WIDTH = 640;
const TARGET_BYTES = 64 * 1024;
const HARD_LIMIT_BYTES = 96 * 1024;
const QUALITIES = [74, 70, 66, 62, 58, 54, 50, 46, 42];

function outputName(cardId) {
  return cardId.replaceAll('.', '-') + '.webp';
}

function decodeHtml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function attribute(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i');
  const match = tag.match(pattern);
  return match ? decodeHtml(match[1]) : null;
}

async function fetchWithRetry(url, asText = false) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'tarot-draw-reference-image-generator/1.0' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return asText ? await response.text() : Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, attempt * 650));
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError}`);
}

async function resolveSource(cardId, entry) {
  if (entry.kind === 'direct') {
    return { imageUrl: entry.image_url, pageUrl: entry.page_url };
  }

  const html = await fetchWithRetry(entry.page_url, true);
  const imageTags = html.match(/<img\b[^>]*>/gi) ?? [];
  let candidates = imageTags.filter(tag => {
    const alt = attribute(tag, 'alt') ?? '';
    return alt.includes('キーワード解説画像');
  });

  if (candidates.length === 0) {
    const suitJa = cardId.includes('.wands.') ? 'ワンド'
      : cardId.includes('.cups.') ? 'カップ'
      : cardId.includes('.swords.') ? 'ソード'
      : 'ペンタクル';
    candidates = imageTags.filter(tag => {
      const alt = attribute(tag, 'alt') ?? '';
      return alt.includes(suitJa)
        && (alt.includes('意味') || alt.includes('小アルカナ'))
        && !alt.includes('アイキャッチ')
        && !alt.includes('カード絵柄解説画');
    });
  }

  if (candidates.length === 0) {
    throw new Error(`No attachment-target keyword/concept image found for ${cardId} at ${entry.page_url}`);
  }

  const tag = candidates[0];
  const raw = attribute(tag, 'data-src') || attribute(tag, 'data-lazy-src') || attribute(tag, 'src');
  if (!raw) throw new Error(`Keyword image has no usable src for ${cardId}`);
  return { imageUrl: new URL(raw, entry.page_url).toString(), pageUrl: entry.page_url };
}

async function encodeReadable(sourceBuffer) {
  const metadata = await sharp(sourceBuffer).metadata();
  if (!metadata.width || !metadata.height) throw new Error('Reference image metadata missing dimensions.');

  for (const quality of QUALITIES) {
    const { data, info } = await sharp(sourceBuffer)
      .resize({ width: OUTPUT_WIDTH, withoutEnlargement: true })
      .webp({ quality, effort: 6, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
    if (data.length <= TARGET_BYTES) return { buffer: data, info, quality, source: metadata };
  }

  const { data, info } = await sharp(sourceBuffer)
    .resize({ width: OUTPUT_WIDTH, withoutEnlargement: true })
    .webp({ quality: 38, effort: 6, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });
  if (data.length > HARD_LIMIT_BYTES) {
    throw new Error(`Reference image remains over hard limit: ${data.length} bytes`);
  }
  return { buffer: data, info, quality: 38, source: metadata };
}

await rm(ROOT, { recursive: true, force: true });
await mkdir(ROOT, { recursive: true });

const entries = [];
for (const [index, [cardId, sourceEntry]] of Object.entries(CARD_REFERENCE_SOURCES).entries()) {
  const resolved = await resolveSource(cardId, sourceEntry);
  const sourceBuffer = await fetchWithRetry(resolved.imageUrl);
  const encoded = await encodeReadable(sourceBuffer);
  const file = outputName(cardId);
  await writeFile(resolve(ROOT, file), encoded.buffer);

  entries.push({
    card_id: cardId,
    file,
    source_page_url: resolved.pageUrl,
    source_image_url: resolved.imageUrl,
    source_kind: sourceEntry.kind === 'direct' ? 'attachment-direct-brain-map' : 'attachment-page-keyword-image',
    source_width: encoded.source.width,
    source_height: encoded.source.height,
    output_width: encoded.info.width,
    output_height: encoded.info.height,
    quality: encoded.quality,
    bytes: encoded.buffer.length
  });
  console.log(`${index + 1}/78 ${cardId}: ${encoded.buffer.length}B q${encoded.quality} ${encoded.info.width}x${encoded.info.height}`);
}

if (entries.length !== 78) throw new Error(`Expected 78 reference assets, got ${entries.length}`);
const total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
const largest = entries.reduce((a,b)=>b.bytes>a.bytes?b:a);
const overHard = entries.filter(entry=>entry.bytes>HARD_LIMIT_BYTES);
if (overHard.length) throw new Error(`Reference assets exceed hard budget: ${JSON.stringify(overHard)}`);

const manifest = {
  schema: 'tarot-reference-webp-manifest.v1',
  source_authority: 'user-supplied タロット78枚_意味と画像索引.md',
  output_max_width: OUTPUT_WIDTH,
  target_bytes: TARGET_BYTES,
  hard_limit_bytes: HARD_LIMIT_BYTES,
  cards: entries.length,
  average_bytes: Math.round(total / entries.length),
  max_bytes: largest.bytes,
  max_card: largest.card_id,
  entries
};
await writeFile(resolve(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log('REFERENCE_WEBP_SUMMARY=' + JSON.stringify({
  cards: entries.length,
  averageBytes: manifest.average_bytes,
  maxBytes: manifest.max_bytes,
  maxCard: manifest.max_card
}));
