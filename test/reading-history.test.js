import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReadingCopy, makeHistoryEntry, safeHistoryRecords, saveHistoryRecords, applyHistoryDeletion, HISTORY_KEY } from '../web/reading-history.js';
import { formatReadingMarkdown } from '../web/model.js';

function sample() {
  return formatReadingMarkdown({question:'今日の仕事は進む？',deckId:'A',rowCount:2,columnCount:2,
    rowLabels:['現在','未来'],columnLabels:['仕事','創作'],inactivePositions:['r1c0'],
    primary:{positions:{r0c0:{card_id:'major.fool',orientation:'upright'},
      r0c1:{card_id:'major.sun',orientation:'reversed'},r1c1:{card_id:'major.world',orientation:'upright'}}},
    parallel:{positions:{r0c0:{card_id:'major.moon',orientation:'upright'},
      r0c1:{card_id:'major.star',orientation:'upright'},r1c1:{card_id:'major.judgement',orientation:'reversed'}}}
  });
}
test('parse current copied Markdown question, exact axes, masked cells and readonly branch text',()=>{
  const data=parseReadingCopy(sample());
  assert.equal(data.question,'今日の仕事は進む？');
  assert.deepEqual(data.rowLabels,['現在','未来']);
  assert.deepEqual(data.columnLabels,['仕事','創作']);
  assert.deepEqual(data.inactivePositions,['r1c0']);
  assert.deepEqual(data.tables.map(x=>x.label),['Primary','Parallel']);
  assert.match(data.tables[0].values[0][0],/正位置/);
  assert.equal(data.tables[0].values[1][0],'-');
  assert.equal(data.raw,sample().trim());
});
test('Markdown escaping and incomplete old copied card names do not move cells',()=>{
  const copied=formatReadingMarkdown({question:'A | B *(test)',rowCount:1,columnCount:2,
    rowLabels:['列|行'],columnLabels:['甲|乙','丙'],primary:{positions:{r0c0:{card_id:'major.fool',orientation:'upright'},r0c1:{card_id:'major.sun',orientation:'upright'}}}});
  const parsed=parseReadingCopy(copied);
  assert.equal(parsed.question,'A | B *(test)');
  assert.deepEqual(parsed.rowLabels,['列|行']);
  assert.deepEqual(parsed.columnLabels,['甲|乙','丙']);
  assert.equal(parsed.tables[0].values[0].length,2);
});
test('reject invalid/corrupt input without fabricated result or active session',()=>{
  assert.throws(()=>parseReadingCopy('not a tarot export'),/表が読み取れません/);
  assert.throws(()=>parseReadingCopy('x'.repeat(300000)),/文字/);
  assert.deepEqual(safeHistoryRecords({getItem:()=>'{broken'}),[]);
});
test('localStorage snapshot supports refresh, is bounded and never stores server session',()=>{
  const store=new Map();const storage={
    getItem:k=>store.get(k)??null,
    setItem:(k,v)=>store.set(k,v)};
  const entry=makeHistoryEntry(sample(),{id:'x1',savedAt:'2026-10-15T13:00:00.000Z',deck:{deckId:'A',majorOnly:false,includeTitle:true,includeSecondary:true}});
  assert.equal(saveHistoryRecords(storage,[entry]),true);
  assert.ok(store.get(HISTORY_KEY));
  const restored=safeHistoryRecords(storage);
  assert.equal(restored.length,1);
  assert.equal(restored[0].question,'今日の仕事は進む？');
  assert.equal(restored[0].sessionId,undefined);
  assert.deepEqual(restored[0].deck,entry.deck);
  assert.equal(saveHistoryRecords({setItem(){throw Error('quota');}},[entry]),false);
});

test('cache recovery discards malformed sources and rebuilds untrusted cached tables/axes',()=>{
  const source=sample(), base={id:'valid',savedAt:'2026-10-15T13:00:00.000Z',
    raw:source,rowLabels:['corrupt'],columnLabels:['corrupt'],
    tables:[{label:'Primary',rowLabels:['bad'],columnLabels:['bad'],values:null}],
    deck:{deckId:'invalid',majorOnly:'yes',includeTitle:1,includeSecondary:1}};
  const other={...base,id:'invalid',raw:'<script>alert(1)</script>'};
  const duplicate={...base,id:'valid'};
  const cache={getItem:()=>JSON.stringify([base,other,duplicate])};
  const recovered=safeHistoryRecords(cache);
  assert.equal(recovered.length,1);
  assert.equal(recovered[0].question,'今日の仕事は進む？');
  assert.deepEqual(recovered[0].rowLabels,['現在','未来']);
  assert.deepEqual(recovered[0].columnLabels,['仕事','創作']);
  assert.equal(recovered[0].tables[0].values[1][0],'-');
  assert.equal(recovered[0].deck,null);
  assert.equal(recovered[0].raw,source);
  assert.equal(recovered[0].sessionId,undefined);
});

test('single/bulk deletion is durable or leaves records intact on storage failure',()=>{
  const original=[makeHistoryEntry(sample(),{id:'a',savedAt:'2026-10-15T13:00:00.000Z'}),
    makeHistoryEntry(sample(),{id:'b',savedAt:'2026-10-15T13:01:00.000Z'})];
  const records=[...original],map=new Map();
  const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
  assert.ok(saveHistoryRecords(storage,records));
  const frozen=map.get(HISTORY_KEY);
  assert.equal(applyHistoryDeletion({setItem(){throw Error('quota exceeded');}},records,'a'),false);
  assert.equal(records.length,2);
  assert.equal(map.get(HISTORY_KEY),frozen);
  assert.equal(applyHistoryDeletion(storage,records,'absent'),false);
  assert.equal(applyHistoryDeletion(storage,records,'a'),true);
  assert.deepEqual(records.map(r=>r.id),['b']);
  assert.deepEqual(safeHistoryRecords(storage).map(r=>r.id),['b']);
  assert.equal(applyHistoryDeletion({setItem(){throw Error('permission denied');}},records),false);
  assert.deepEqual(records.map(r=>r.id),['b']);
  assert.equal(applyHistoryDeletion(storage,records),true);
  assert.deepEqual(records,[]);
  assert.deepEqual(safeHistoryRecords(storage),[]);
});
