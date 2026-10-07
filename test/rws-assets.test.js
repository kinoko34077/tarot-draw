import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const ROOT = resolve(fileURLToPath(new URL('../web/assets/rws/', import.meta.url)));

test('self-hosted RWS set contains 78 compressed WebP assets within budget', async () => {
  const manifest = JSON.parse(await readFile(resolve(ROOT, 'manifest.json'), 'utf8'));
  assert.equal(manifest.cards, 78);
  assert.equal(manifest.entries.length, 78);
  assert.ok(manifest.average_bytes <= 32 * 1024);
  assert.ok(manifest.max_bytes <= 64 * 1024);

  for (const entry of manifest.entries) {
    assert.match(entry.file, /\.webp$/);
    const path = resolve(ROOT, entry.file);
    const info = await stat(path);
    assert.equal(info.size, entry.bytes);
    assert.ok(info.size <= 64 * 1024, `${entry.card_id} exceeds 64 KiB`);
    const header = await readFile(path);
    assert.equal(header.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(header.subarray(8, 12).toString('ascii'), 'WEBP');
  }
});
