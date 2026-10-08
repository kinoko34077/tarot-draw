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
    const [config, html, nojekyll, keywordEntry, keywordCorpus] = await Promise.all([
      readFile(join(out, 'config.js'), 'utf8'),
      readFile(join(out, 'index.html'), 'utf8'),
      readFile(join(out, '.nojekyll'), 'utf8'),
      readFile(join(out, 'card-keyword-grid.js'), 'utf8'),
      readFile(join(out, 'card-keyword-corpus.js'), 'utf8')
    ]);
    assert.match(config, /"apiMode": "external"/);
    assert.match(config, /"apiBaseUrl": ""/);
    assert.match(html, /href="\.\/styles\.css"/);
    assert.equal(nojekyll, '');
    assert.ok(keywordEntry.includes('CARD_KEYWORD_GRIDS'));
    assert.ok(keywordEntry.includes("from './card-keyword-corpus.js'"));
    assert.ok(keywordCorpus.includes('REMAINING_KEYWORD_GRIDS'));
    assert.ok(keywordCorpus.includes("'major.world'"));
    assert.ok(keywordCorpus.includes("'minor.pentacles.king'"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
