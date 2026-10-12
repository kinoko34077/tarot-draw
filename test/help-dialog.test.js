import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Help is a separate labelled native dialog with the trigger left of Settings', async () => {
  const html=await readFile(new URL('../web/index.html',import.meta.url),'utf8');
  const helpButton=html.indexOf('id="helpButton"');
  const settingsButton=html.indexOf('id="settingsButton"');
  const modal=html.indexOf('id="helpDialog"');
  assert.ok(helpButton>0&&helpButton<settingsButton&&settingsButton<modal);
  assert.match(html, /id="helpButton"[^>]+aria-controls="helpDialog"/);
  assert.match(html, /id="helpDialog"[^>]+aria-labelledby="helpTitle"/);
  assert.match(html, /id="helpClose"[^>]+type="button"/);
  assert.match(html, /id="helpDone"[^>]+type="button"/);
});

test('Help describes drawing, interpretation and four deck-specific custom cards', async () => {
  const html=await readFile(new URL('../web/index.html',import.meta.url),'utf8');
  const help=html.slice(html.indexOf('id="helpDialog"'),html.indexOf('id="settingsDialog"'));
  for(const text of ['基本操作','リーディングの考え方','デッキとオリジナルカード',
    'シャッフル','山A・B・C','Primary','Parallel','引く','結果をコピー',
    '正位置・逆位置','ウロボロス','創り手','タイトルカード','紹介カード','保証カード',
    '大アルカナのみ','必ず出る']) {
    assert.ok(help.includes(text),text+' missing from help');
  }
  assert.equal((help.match(/<dt>/g)||[]).length,4);
  assert.match(help,/実際に別の出来事が起こったという意味ではありません/);
  assert.match(help,/結果や未来を保証する/);
});

test('Help open, backdrop and exit actions are wired through native dialog',async()=>{
  const source=await readFile(new URL('../web/app.js',import.meta.url),'utf8');
  assert.match(source,/page\.helpDialog\.showModal\(\)/);
  assert.match(source,/page\.helpDialog\.addEventListener\('close'/);
  assert.match(source,/event\.target === page\.helpDialog/);
  assert.match(source,/page\.helpButton\.focus\(\{ preventScroll: true \}\)/);
});
