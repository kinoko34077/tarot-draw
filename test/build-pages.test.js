import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPagesSite } from '../scripts/build-pages.mjs';

test('Pages build emits external API config and nojekyll marker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tarot-pages-'));
  const out = join(root, '_site');
  try {
    await buildPagesSite({ outputDir: out, apiBaseUrl: '' });
    const [config, html, nojekyll] = await Promise.all([
      readFile(join(out, 'config.js'), 'utf8'),
      readFile(join(out, 'index.html'), 'utf8'),
      readFile(join(out, '.nojekyll'), 'utf8')
    ]);
    assert.match(config, /"apiMode": "external"/);
    assert.match(config, /"apiBaseUrl": ""/);
    assert.match(html, /href="\.\/styles\.css"/);
    assert.equal(nojekyll, '');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
