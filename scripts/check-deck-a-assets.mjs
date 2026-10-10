#!/usr/bin/env node
/**
 * Release-only guard for the user-supplied Deck A physical-card artwork.
 * Pages must NOT deploy a missing or corrupt image as a successful release.
 * The 78 public-domain standard-card assets are checked separately.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../web/assets/cards/', import.meta.url)));
const assets = [
  { path: 'grid/deck-a-title.webp', width: 128, height: 220, budget: 24576 },
  { path: 'grid/deck-a-introduction.webp', width: 128, height: 220, budget: 24576 },
  { path: 'detail/deck-a-title.webp', width: 224, height: 384, budget: 57344 },
  { path: 'detail/deck-a-introduction.webp', width: 224, height: 384, budget: 57344 }
];

let invalid = 0;
for (const asset of assets) {
  try {
    const bytes = await readFile(resolve(root, asset.path));
    if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' ||
        bytes.toString('ascii', 8, 12) !== 'WEBP' ||
        bytes.toString('ascii', 12, 16) !== 'VP8X') {
      throw new Error('not an extended WebP asset');
    }
    if (bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error('bad RIFF length');
    const width = 1 + bytes.readUIntLE(24, 3);
    const height = 1 + bytes.readUIntLE(27, 3);
    const alpha = !!(bytes[20] & 0x10);
    if (width !== asset.width || height !== asset.height) {
      throw new Error(`wrong dimensions: ${width}x${height}`);
    }
    if (!alpha) throw new Error('missing alpha channel');
    if (bytes.length > asset.budget) throw new Error(`oversized: ${bytes.length} bytes`);
    console.log(`OK Deck A ${asset.path}: ${width}x${height} alpha ${bytes.length} bytes`);
  } catch (error) {
    invalid++;
    console.error(`BLOCKED Deck A ${asset.path}: ${error.message}`);
  }
}
if (invalid) {
  console.error(`Deck A release blocked: ${invalid} / ${assets.length} card assets missing or invalid. No Pages publication.`);
  process.exitCode = 1;
}
