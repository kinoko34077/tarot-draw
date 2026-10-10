import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL('../' + path, import.meta.url),'utf8');

test('Issue 83 reconstructs Deck A without reusing modern physical card scan',async()=>{
  const [generator,model,html,checker,workflow,spec]=await Promise.all([
    read('scripts/generate-deck-a-reconstruction.mjs'),
    read('web/model.js'),read('web/index.html'),
    read('scripts/check-deck-a-assets.mjs'),
    read('.github/workflows/pages.yml'),read('docs/DECK_A_RECONSTRUCTION.md')
  ]);
  assert.match(generator,/The Craftsman/);
  assert.match(generator,/PHOTO_SHA256 = '[a-f0-9]{64}'/);
  assert.match(generator,/data:image\/jpeg;base64/);
  assert.match(generator,/Independent 1909-era print/);
  assert.match(generator,/function ouroboros\(\)/);
  assert.match(generator,/function bioCard\(photoData\)/);
  assert.match(generator,/colour|color|indigo|purple|#211B5D/i);
  assert.doesNotMatch(generator,/Reprinted from The Encyclopedia of Tarot/);
  assert.match(checker,/Reprinted from\|Encyclopedia of Tarot\|MADE IN CHINA/);
  for(const name of ['deck-a-title.svg','deck-a-introduction.svg']){
    assert.ok(model.includes(name));
    assert.ok(html.includes(name));
    assert.ok(generator.includes(name));
  }
  assert.match(workflow,/Generate|Compose independent vintage Deck A art/);
  assert.match(workflow,/node scripts\/check-deck-a-assets.mjs/);
  assert.match(spec,/Copyright|copyrighted|later edition/i);
});
