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

test('Issue 86 uses independent dense source-language biography and guarded vintage layout', async () => {
  const generator=await read('scripts/generate-deck-a-reconstruction.mjs');
  const doc=await read('docs/DECK_A_RECONSTRUCTION.md');
  const blocks=[...generator.matchAll(/const (?:top[12]|right[123]|bottom[123])="([^"]*)";/g)];
  assert.equal(blocks.length,8,'Eight independently authored reference-density paragraphs');
  const count=blocks.flatMap(([,paragraph])=>paragraph.split(/\s+/)).length;
  assert.ok(count>=290&&count<=345,'Biographical wording must retain near-reference density');
  assert.match(generator,/if\(portraitY>590\|\|lastY>1646\)throw Error/);
  assert.match(generator,/Natural browser-shaped words/);
  assert.match(generator,/slope="1\.38"/);
  assert.match(generator,/font-size="58" font-weight="900"/);
  assert.doesNotMatch(generator,/Made in China|Reprinted from The Encyclopedia/i);
  assert.match(doc,/Ouroboros-simple\.svg/);
  assert.match(doc,/313/);
});

test('Issue #83 chosen PD ouroboros is the AnonMoos vector, not old ellipse', async () => {
  const gen=await read('scripts/generate-deck-a-reconstruction.mjs');
  const doc=await read('docs/DECK_A_RECONSTRUCTION.md');
  const segment=gen.slice(gen.indexOf('function ouroboros() {'),gen.indexOf('function titleCard() {'));
  assert.match(segment,/AnonMoos/);
  assert.match(segment,/Ouroboros-simple\.svg/);
  assert.match(segment,/rotate\(0\)/);
  assert.equal((segment.match(/<path d=/g)||[]).length,3);
  assert.doesNotMatch(segment,/<ellipse/);
  assert.match(doc,/three PD vector paths/);
});

test('UX93 title uses source-like tall word initials and smaller capitals', async () => {
  const source=await read('scripts/generate-deck-a-reconstruction.mjs');
  assert.match(source,/const spans = words\.map\(word/);
  assert.match(source,/titleText\(\['The','Original'\],245,124,89,587\)/);
  assert.match(source,/titleText\(\['Rider','Waite'\],378,132,94,566\)/);
  assert.match(source,/titleText\(\['Tarot','Deck'\],513,132,94,557\)/);
});
