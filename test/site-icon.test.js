import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import sharp from 'sharp';
import { buildPagesSite } from '../scripts/build-pages.mjs';
import { createTarotServer } from '../src/server.js';

test('Pages deploy builds a self-contained favicon and three deterministic raster icons', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'tarot-icon-'));
  try {
    await buildPagesSite({ outputDir, apiBaseUrl: '' });
    const html = await readFile(join(outputDir, 'index.html'), 'utf8');
    assert.match(html, /rel="icon" type="image\/svg\+xml" href="\.\/favicon\.svg"/);
    assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\.\/apple-touch-icon\.png"/);
    const vector = await readFile(join(outputDir, 'favicon.svg'), 'utf8');
    assert.match(vector, /viewBox="0 0 512 512"/);
    assert.match(vector, /<path d="M256 153/);
    for (const [name, size] of [
      ['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]
    ]) {
      const path = join(outputDir, name);
      const image = await sharp(path).metadata();
      assert.deepEqual([image.format, image.width, image.height], ['png', size, size]);
      assert.ok((await readFile(path)).byteLength < 100_000, name + ' too large');
    }
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('Node dev server serves SVG favicon with a correct MIME type', async () => {
  const server = createTarotServer();
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/favicon.svg');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /image\/svg\+xml/);
    assert.match(await response.text(), /<svg xmlns=/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
