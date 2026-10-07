import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { MINOR_CARD_DISPLAY } from '../web/card-name-ruby.js';

const ROOT = resolve(fileURLToPath(new URL('../web/assets/cards/reference/', import.meta.url)));

test('aozora-wasm generated Minor Arcana display mapping contains all 56 cards', () => {
  assert.equal(Object.keys(MINOR_CARD_DISPLAY).length, 56);
  assert.equal(MINOR_CARD_DISPLAY['minor.wands.knight'].source, '｜杖《ワンド》の｜騎士《ナイト》');
  assert.equal(MINOR_CARD_DISPLAY['minor.wands.knight'].compact, '杖の騎士');
  assert.equal(MINOR_CARD_DISPLAY['minor.wands.knight'].plain, '杖（ワンド）の騎士（ナイト）');
  assert.match(MINOR_CARD_DISPLAY['minor.wands.knight'].html, /<ruby>杖/);
  assert.match(MINOR_CARD_DISPLAY['minor.wands.knight'].html, /<rt>ナイト<\/rt>/);
});

test('attachment-derived reference WebP set contains all 78 readable bounded assets', async () => {
  const manifest = JSON.parse(await readFile(resolve(ROOT, 'manifest.json'), 'utf8'));
  assert.equal(manifest.cards, 78);
  assert.equal(manifest.entries.length, 78);
  assert.equal(manifest.entries.filter(entry => entry.source_kind === 'attachment-direct-brain-map').length, 22);
  assert.equal(manifest.entries.filter(entry => entry.source_kind === 'attachment-page-keyword-image').length, 56);
  assert.ok(manifest.average_bytes <= 64 * 1024);
  assert.ok(manifest.max_bytes <= 96 * 1024);

  for (const entry of manifest.entries) {
    assert.match(entry.file, /\.webp$/);
    assert.ok(entry.source_page_url.startsWith('https://sup.andyou.jp/tarot/'));
    assert.ok(entry.source_image_url.startsWith('https://sup.andyou.jp/tarot/'));
    assert.ok(entry.output_width >= 600, `${entry.card_id} reference image is too narrow for embedded words`);
    assert.ok(entry.bytes <= 96 * 1024, `${entry.card_id} exceeds hard budget`);
    const path = resolve(ROOT, entry.file);
    const info = await stat(path);
    assert.equal(info.size, entry.bytes);
    const header = await readFile(path);
    assert.equal(header.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(header.subarray(8, 12).toString('ascii'), 'WEBP');
  }
});
