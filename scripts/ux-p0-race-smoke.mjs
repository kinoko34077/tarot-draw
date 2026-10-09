// P0 controlled browser characterization; asserts baseline defects, NOT desired production behavior.
// Run with Node 22+ and CHROME_BIN=google-chrome|chromium; never accesses production API.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTarotServer } from '../src/server.js';

const bin = process.env.CHROME_BIN || ['google-chrome','chromium','chromium-browser']
  .map(name => spawnSync('which',[name],{encoding:'utf8'}))
  .find(result => result.status === 0)?.stdout.trim();
if (!bin) throw Error('P0 requires Chromium');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const expectSafe = process.argv.includes('--expect-safe');
const server = createTarotServer();
const profile = await mkdtemp(join(tmpdir(),'tarot-p0-'));
let browser, socket;
let nextId = 0;
const pending = new Map();

function devtools(url) {
  socket = new WebSocket(url);
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    if (message.error) item.reject(Error(JSON.stringify(message.error)));
    else item.resolve(message.result);
  };
  return {
    ready: () => new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;}),
    call: (method,params={}) => new Promise((resolve,reject)=>{
      const id=++nextId;
      pending.set(id,{resolve,reject});
      socket.send(JSON.stringify({id,method,params}));
    })
  };
}

const mock = `(() => {
  const nativeFetch = window.fetch.bind(window);
  const p0 = window.__p0 = {
    sessions: 0, shuffleCalls: 0, branchCalls: [], drawCalls: [],
    deferredShuffle: [], deferredDraw: [], deferShuffle: false, deferDraw: true,
    copiedText: null, failDrawPiles: [], failDrawStatuses: {}
  };
  const ok = (data,status=200) => new Response(JSON.stringify(data),{
    status,headers:{'Content-Type':'application/json'}
  });
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
    writeText: async value => { p0.copiedText = value; }
  }});
  window.fetch = async (input, init={}) => {
    const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname;
    if (!path.startsWith('/api/')) return nativeFetch(input,init);
    if (path === '/api/sessions') {
      p0.sessions++;
      return ok({session_id:'p0-'+p0.sessions},201);
    }
    if (/^\\/api\\/sessions\\/[^/]+\\/shuffle$/.test(path)) {
      p0.shuffleCalls++;
      const reply=()=>ok({piles:[
        {pile_id:'A',count:27},{pile_id:'B',count:27},{pile_id:'C',count:26}
      ]});
      if (p0.deferShuffle) return new Promise(resolve=>p0.deferredShuffle.push(()=>resolve(reply())));
      return reply();
    }
    if (/^\\/api\\/sessions\\/[^/]+\\/branches$/.test(path)) {
      const pile=JSON.parse(init.body).pile;
      const id='b'+(p0.branchCalls.length+1)+'-'+pile;
      p0.branchCalls.push({pile,id});
      return ok({branch_id:id,pile_id:pile},201);
    }
    if (/^\\/api\\/branches\\/[^/]+\\/draw$/.test(path)) {
      const id=path.split('/')[3];
      const branch=p0.branchCalls.find(b=>b.id===id);
      const positions=JSON.parse(init.body).positions;
      p0.drawCalls.push({id,pile:branch.pile,positions});
      const cards=Object.fromEntries(positions.map(position=>[position,{
        card_id:branch.pile==='A'?'major.fool':'major.magician',
        name_ja:branch.pile==='A'?'愚者':'魔術師',
        orientation:branch.pile==='A'?'upright':'reversed'
      }]));
      const reply=()=>{
        if(p0.failDrawPiles.includes(branch.pile))
          return Promise.reject(new Error('P1 mock transport loss for '+branch.pile));
        if(p0.failDrawStatuses[branch.pile])
          return ok({error:{code:'RATE_LIMITED',message:'Try later.'}},p0.failDrawStatuses[branch.pile]);
        return ok({pile_id:branch.pile,positions:cards});
      };
      if (p0.deferDraw) return new Promise(resolve=>p0.deferredDraw.push(()=>resolve(reply())));
      return reply();
    }
    if (init.method === 'DELETE') return ok({ok:true});
    throw Error('Unhandled P0 mock request: '+path);
  };
})();`;

let cdp, base;
async function evalInPage(expression) {
  for(let attempt=0;attempt<30;attempt++){
    try {
      const r=await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
      if(r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || 'Runtime exception');
      return r.result.value;
    } catch(error) {
      if (String(error).includes('Cannot find default execution context') && attempt<29) { await sleep(80);continue; }
      throw error;
    }
  }
}
async function navigate(width=1440) {
  await cdp.call('Emulation.setDeviceMetricsOverride',{width,height:857,deviceScaleFactor:1,mobile:false});
  await cdp.call('Page.navigate',{url:base+'?p0='+Math.random()});
  for(let attempt=0;attempt<90;attempt++){
    try {if(await evalInPage("Boolean(document.querySelector('.axis-add-row-header .axis-add-button'))"))return;}catch{}
    await sleep(80);
  }
  throw Error('P0 test UI did not load');
}
async function waitFor(expression) {
  for(let i=0;i<100;i++){
    if(await evalInPage(expression))return;
    await sleep(50);
  }
  throw Error('Timed out: '+expression);
}
function report(id, object) {
  console.log('P0_BASELINE '+JSON.stringify({id,...object}));
}

try {
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  base='http://127.0.0.1:'+server.address().port+'/';
  browser=spawn(bin,['--headless=new','--no-sandbox','--disable-gpu',
    '--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=0','--user-data-dir='+profile,'--window-size=1440,1000',base],{stdio:['ignore','ignore','pipe']});
  let browserStderr='';
  browser.stderr.on('data',chunk=>{browserStderr=(browserStderr+chunk.toString()).slice(-3000);});
  // Each run gets an isolated CDP port to avoid colliding with other Chrome jobs.
  // Chrome writes the selected port and browser WS URI into DevToolsActivePort.
  let port=0;
  for(let i=0;i<300;i++){
    try {
      const address=await readFile(join(profile,'DevToolsActivePort'),'utf8');
      port=Number(address.split('\n')[0]);
      if(Number.isInteger(port)&&port>0)break;
    }catch{}
    if(browser.exitCode!==null)throw Error('Chromium exited '+browser.exitCode+': '+browserStderr);
    await sleep(100);
  }
  if(!port)throw Error('Chromium debugging port unavailable: '+browserStderr);
  let target;
  for(let i=0;i<300;i++){
    try {
      const tabs=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
      target=tabs.find(tab=>tab.type==='page' && tab.url.startsWith(base)) ||
        tabs.find(tab=>tab.type==='page');
      if(target)break;
    }catch{}
    if(browser.exitCode!==null)throw Error('Chromium exited '+browser.exitCode+': '+browserStderr);
    await sleep(100);
  }
  if(!target)throw Error('Chromium tab not ready: '+browserStderr);
  cdp=devtools(target.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.call('Runtime.enable');
  await cdp.call('Page.enable');
  await cdp.call('Page.addScriptToEvaluateOnNewDocument',{source:mock});

  // C04a: editing the matrix while Shuffle is awaiting response re-enables Shuffle.
  await navigate();
  const shuffle=await evalInPage(`(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const one=q=>document.querySelector(q);
    window.__p0.deferShuffle=true;
    one('.shuffle-button').click();
    await sleep(30);
    const disabledBefore=one('.shuffle-button').disabled;
    one('.axis-add-row-header .axis-add-button')?.click();
    const enabledAfter=!one('.shuffle-button').disabled;
    if(enabledAfter)one('.shuffle-button').click();
    await sleep(30);
    return {disabledBefore,enabledAfter,sessionCalls:__p0.sessions,shuffleCalls:__p0.shuffleCalls};
  })()`);
  assert.equal(shuffle.disabledBefore,true);
  if (expectSafe) {
    assert.equal(shuffle.enabledAfter,false,'Pending Shuffle must never re-enable');
    assert.equal(shuffle.sessionCalls,1);
    assert.equal(shuffle.shuffleCalls,1);
  } else {
    assert.equal(shuffle.enabledAfter,true,'Known C04 shuffle rerender race should reproduce');
    assert.ok(shuffle.sessionCalls>=2,'Duplicate shuffle session request should reproduce');
  }
  report('C04-SHUFFLE-REENABLE',{status:expectSafe?'FIXED':'REPRODUCED',...shuffle});

  // C03: change primary pile while server-owned A result remains pending.
  await navigate();
  const pendingC03=await evalInPage(`(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const one=q=>document.querySelector(q);
    one('.shuffle-button').click();
    for(let i=0;i<50 && document.querySelectorAll('.pile-button').length!==3;i++)await sleep(20);
    one('.pile-button:nth-child(1)').click();
    one('.draw-button').click();
    for(let i=0;i<50 && __p0.deferredDraw.length!==1;i++)await sleep(20);
    one('.pile-button:nth-child(1)').click(); // deselect Primary A
    one('.pile-button:nth-child(2)').click(); // choose Primary B
    const pendingPiles=__p0.drawCalls.map(call=>call.pile);
    __p0.deferredDraw.splice(0).forEach(resolve=>resolve());
    for(let i=0;i<50 && !one('.reading-status').textContent.includes('抽選完了');i++)await sleep(20);
    return {
      pendingPiles,label:one('.primary-pile-label').textContent,
      resultPile:one('.primary-matrix .card-art')?.src.includes('major-fool')?'A':'other',
      phaseStatus:one('.reading-status').textContent
    };
  })()`);
  assert.deepEqual(pendingC03.pendingPiles,['A']);
  assert.equal(pendingC03.label,expectSafe?'山 A':'山 B',
    'Rendered selected pile label must agree with tested state contract');
  assert.equal(pendingC03.resultPile,'A','Expected actual card identity from branch A');
  report('C03-PILE-MISATTRIBUTION',{status:expectSafe?'FIXED':'REPRODUCED',...pendingC03});

  // C04b: selecting optional B during pending A draw re-enables Draw and creates second A branch.
  await navigate();
  const duplicate=await evalInPage(`(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const one=q=>document.querySelector(q);
    one('.shuffle-button').click();
    for(let i=0;i<50 && document.querySelectorAll('.pile-button').length!==3;i++)await sleep(20);
    one('.pile-button:nth-child(1)').click();
    one('.draw-button').click();
    for(let i=0;i<50 && __p0.deferredDraw.length!==1;i++)await sleep(20);
    const disabledBefore=one('.draw-button').disabled;
    one('.pile-button:nth-child(2)').click();
    const enabledAfter=!one('.draw-button').disabled;
    if(enabledAfter)one('.draw-button').click();
    for(let i=0;i<50 && __p0.deferredDraw.length<3;i++)await sleep(20);
    return {disabledBefore,enabledAfter,branches:__p0.branchCalls.map(b=>b.pile),draws:__p0.drawCalls.map(d=>d.pile)};
  })()`);
  assert.equal(duplicate.disabledBefore,true);
  if (expectSafe) {
    assert.equal(duplicate.enabledAfter,false,'Pending Draw must stay disabled');
    assert.deepEqual(duplicate.branches,['A']);
    assert.deepEqual(duplicate.draws,['A']);
  } else {
    assert.equal(duplicate.enabledAfter,true);
    assert.ok(duplicate.branches.filter(x=>x==='A').length>=2);
  }
  report('C04-DRAW-REENABLE',{status:expectSafe?'FIXED':'REPRODUCED',...duplicate});

  // Normal 27 x 2 and responsive UX baseline: no pending API, no persistence.
  await navigate();
  const ready=await evalInPage(`(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const one=q=>document.querySelector(q);
    const all=q=>[...document.querySelectorAll(q)];
    __p0.deferDraw=false;
    one('.question-input').value='P0 baseline question';
    one('.question-input').dispatchEvent(new Event('input',{bubbles:true}));
    for(let i=0;i<6;i++)one('.axis-add-header .axis-add-button').click();
    for(let i=0;i<2;i++)one('.axis-add-row-header .axis-add-button').click();
    const dims={rows:all('.row-header').length,columns:all('.column-header').length};
    one('.shuffle-button').click();
    for(let i=0;i<100 && all('.pile-button').length!==3;i++)await sleep(20);
    all('.pile-button')[0].click();all('.pile-button')[1].click();
    one('.draw-button').click();
    for(let i=0;i<100 && !one('.reading-status').textContent.includes('抽選完了');i++)await sleep(20);
    const cards=all('.card-detail-trigger').length;
    one('.copy-button').click();
    for(let i=0;i<20 && !__p0.copiedText;i++)await sleep(20);
    const copied=__p0.copiedText;

    const button=all('.card-detail-trigger')[0];
    const visibleCue=/詳細/.test(button.textContent);
    button.click();
    for(let i=0;i<50 && !one('#cardDetailDialog').open;i++)await sleep(20);
    const detail={open:one('#cardDetailDialog').open,keywords:all('.keyword-grid-group th,.keyword-grid-group td').length,
      heading:one('#cardDetailKeywordHeading').textContent.trim()};
    one('#cardDetailClose').click();
    return {dims,cards,drawPiles:__p0.drawCalls.map(d=>d.pile),
      copiedQuestion:copied?.includes('P0 baseline question'),
      copiedParallel:copied?.includes('## パラレルリーディング（山B）'),
      copiedMarkdown:copied?.includes('| --- |') && copied?.includes('### パラレルリーディングについて'),
      copiedMarkdownHasNoTabs:!copied?.includes('\\t'),
      tsvActionRemoved:!one('.tsv-copy-button'),
      visibleCue,detail};
  })()`);
  assert.deepEqual(ready.dims,{rows:3,columns:9});
  assert.equal(ready.cards,54);
  assert.deepEqual(ready.drawPiles,['A','B']);
  assert.equal(ready.copiedQuestion,true);
  assert.equal(ready.copiedParallel,true);
  assert.equal(ready.copiedMarkdown,true);
  assert.equal(ready.copiedMarkdownHasNoTabs,true);
  assert.equal(ready.tsvActionRemoved,true);
  assert.equal(ready.detail.open,true);
  assert.equal(ready.detail.keywords,25);
  report('NORMAL-27X2',{status:'PASS',...ready});

  for(const width of [1440,390,320]){
    await cdp.call('Emulation.setDeviceMetricsOverride',{width,height:857,deviceScaleFactor:1,mobile:false});
    const geometry=await evalInPage(`(() => {
      const one=q=>document.querySelector(q);
      const c=one('.copy-button').getBoundingClientRect();
      const s=one('.reading-status').getBoundingClientRect();
      const card=one('.card-detail-trigger').getBoundingClientRect();
      return {width:innerWidth,height:innerHeight,
        copyStatusDeltaPx:Math.round(s.top-c.top),
        statusVisibleWithCopy:s.top>=0 && s.top<innerHeight && c.top>=0 && c.top<innerHeight,
        detailVisibleLabel:/詳細/.test(one('.card-detail-trigger').textContent),
        firstCardWidth:Math.round(card.width),horizontalScroll:one('.primary-matrix').scrollWidth>one('.primary-matrix').clientWidth,
        undoVisible:!!one('.undo-button'),newReadingVisible:!one('#newReadingButton')?.classList.contains('hidden')
      };
    })()`);
    report('VIEWPORT-'+width,{status:'MEASURED',...geometry});
  }
  // The latest explicit user requirement: select additional Main piles to cover
  // the matrix BEFORE an optional Parallel pile, through all 80 cards.
  for (const [total, rows, columns, width, expectedSlices] of [
    [28, 2, 14, 1440, [27, 1]],
    [55, 5, 11, 390, [27, 27, 1]],
    [80, 4, 20, 320, [27, 27, 26]]
  ]) {
    await navigate();
    await cdp.call('Emulation.setDeviceMetricsOverride', {width, height:857, deviceScaleFactor:1, mobile:false});
    const evidence = await evalInPage(`(async()=>{
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      const one=q=>document.querySelector(q), all=q=>[...document.querySelectorAll(q)];
      __p0.deferDraw=false;
      for(let i=3;i<${columns};i++) one('.axis-add-header .axis-add-button').click();
      for(let i=1;i<${rows};i++) one('.axis-add-row-header .axis-add-button').click();
      const originalWidth=one('.row-header').getBoundingClientRect().width;
      const row=one('.row-header .axis-inline-label');
      const col=one('.column-header .axis-inline-label');
      const rename=(button,value)=>{
        const host=button.parentElement;
        button.click();
        const input=host.querySelector('.axis-inline-input');
        input.value=value;
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
      };
      rename(row,'行見出しをかなり長くした場合');
      rename(one('.column-header .axis-inline-label'),'とてもながいながい列の見出しの例');
      const rowLabel=one('.row-header .axis-inline-label');
      const colLabel=one('.column-header .axis-inline-label');
      const fit={
        rowVertical:getComputedStyle(rowLabel).writingMode==='vertical-rl',
        rowWidth:one('.row-header').getBoundingClientRect().width,
        columnWidth:one('.column-header').getBoundingClientRect().width,
        rowFont:parseFloat(getComputedStyle(rowLabel).fontSize),
        columnFont:parseFloat(getComputedStyle(colLabel).fontSize),
        rowFits:rowLabel.scrollHeight<=rowLabel.clientHeight+1 && rowLabel.scrollWidth<=rowLabel.clientWidth+1,
        columnFits:colLabel.scrollWidth<=colLabel.clientWidth+1,
        titlePreserved:rowLabel.title.includes('行見出しをかなり長くした場合') &&
          colLabel.title.includes('とてもながいながい列の見出しの例')
      };
      const addDisabled=one('.axis-add-header .axis-add-button').disabled &&
        one('.axis-add-row-header .axis-add-button').disabled;
      one('.shuffle-button').click();
      for(let i=0;i<100 && all('.pile-button').length!==3;i++)await sleep(20);
      one('.pile-button:nth-child(1)').click();
      const afterFirst={disabled:one('.draw-button').disabled,hint:one('.selection-message').textContent};
      one('.pile-button:nth-child(2)').click();
      const afterSecond={disabled:one('.draw-button').disabled,hint:one('.selection-message').textContent};
      if(${total}>54) one('.pile-button:nth-child(3)').click();
      const ready={drawEnabled:!one('.draw-button').disabled,
        canSelectParallel:all('.pile-button').some(b=>!b.disabled && b.getAttribute('aria-pressed')!=='true'),
        hint:one('.selection-message').textContent};
      one('.draw-button').click();
      for(let i=0;i<300 && !one('.reading-status').textContent.includes('抽選完了');i++)await sleep(20);
      const mapped=all('.primary-matrix .card-result-block').length;
      const history=__p0.drawCalls.map(b=>({pile:b.pile,count:b.positions.length}));
      const parallel=all('.parallel-matrix .card-result-block').length;
      const status=one('.reading-status').textContent;
      return {total:${total},rows:${rows},columns:${columns},width:innerWidth,
        originalWidth,fit,addDisabled,afterFirst,afterSecond,ready,mapped,parallel,status,history};
    })()`);
    assert.equal(evidence.width, width, `${total} actual browser viewport must match requested width`);
    assert.equal(evidence.mapped, total, `${total} card draw complete`);
    assert.equal(evidence.parallel, 0, `${total} no implicit Parallel`);
    assert.equal(evidence.status, '抽選完了');
    assert.equal(evidence.afterFirst.disabled, true);
    assert.ok(evidence.afterFirst.hint.includes('枚数確保の為次の山を選択'));
    assert.equal(evidence.ready.drawEnabled, true);
    assert.deepEqual(evidence.history.map(b=>b.count),expectedSlices);
    assert.deepEqual(evidence.history.map(b=>b.pile),expectedSlices.map((_,i)=>['A','B','C'][i]));
    assert.equal(evidence.fit.rowVertical, true);
    assert.ok(evidence.fit.rowWidth <= 80, `row label excessively wide at ${width}`);
    assert.ok(evidence.fit.columnWidth <= 112, `column label excessively wide at ${width}`);
    assert.equal(evidence.fit.rowFits,true,`row label must fit at ${width}`);
    assert.equal(evidence.fit.columnFits,true,`column label must fit at ${width}`);
    assert.ok(evidence.fit.rowFont < 13 && evidence.fit.columnFont < 13);
    assert.equal(evidence.fit.titlePreserved,true);
    if(total === 80) {
      assert.equal(evidence.addDisabled,true,'no 81st card through Add');
      assert.equal(evidence.ready.canSelectParallel,false,'80 card Main uses all three piles');
    }
    report('MULTIPILE-'+total,{status:'PASS',...evidence});
  }

  if (expectSafe) {
    // User #70: verify actual pointer gesture/axis preview, labeled-delete guard, footer and reversible pile selection.
    await navigate(390);
    const ux70 = await evalInPage(`(async()=>{
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      const one=q=>document.querySelector(q), all=q=>[...document.querySelectorAll(q)];
      const header=one('.reading-toolbar'), question=one('.question-field');
      const inlineQ=Math.abs(header.getBoundingClientRect().top-question.getBoundingClientRect().top)<5;
      const divider=parseFloat(getComputedStyle(question).borderLeftWidth)>=1;
      const footer=one('.history-actions').contains(one('.shuffle-button'));
      const initialCount=one('.layout-count').textContent;
      one('.axis-add-header .axis-add-button').click();
      const afterAdd=all('.column-header').length;
      one('.axis-add-header .axis-remove-button').click();
      const afterBlankDelete=all('.column-header').length;
      const rename=(index,value)=>{
        const button=all('.column-header .axis-inline-label')[index];
        const host=button.parentElement;button.click();
        const input=host.querySelector('.axis-inline-input');
        input.value=value;input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
      };
      rename(2,'名称入力済');
      let confirmations=0;let allow=false;
      const oldConfirm=window.confirm;
      window.confirm=message=>{ confirmations++;return allow; };
      one('.axis-add-header .axis-remove-button').click();
      const afterRefusedDelete=all('.column-header').length;
      allow=true;one('.axis-add-header .axis-remove-button').click();
      const afterConfirmedDelete=all('.column-header').length;
      window.confirm=oldConfirm;
      rename(0,'最初');rename(1,'次');
      const headerCells=all('.column-header'), grip=headerCells[0].querySelector('.axis-menu-trigger');
      const rect=headerCells[1].getBoundingClientRect();
      const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
      grip.dispatchEvent(new PointerEvent('pointerdown',{pointerId:23,button:0,bubbles:true,clientX:x-80,clientY:y}));
      window.dispatchEvent(new PointerEvent('pointermove',{pointerId:23,bubbles:true,clientX:x,clientY:y}));
      const preview={ghost:!!one('.axis-drag-ghost'),from:all('.axis-dragging-source').length,to:all('.axis-drop-preview').length};
      window.dispatchEvent(new PointerEvent('pointerup',{pointerId:23,button:0,bubbles:true,clientX:x,clientY:y}));
      const reordered=all('.column-header .axis-inline-label').map(e=>e.textContent);
      const ghostRemoved=!one('.axis-drag-ghost');
      one('.shuffle-button').click();
      for(let i=0;i<100 && all('.pile-button').length!==3;i++)await sleep(20);
      const a=all('.pile-button');a[0].click();
      const primarySelected=a[0].getAttribute('aria-pressed')==='true';
      a[0].click();
      const cleared=all('.pile-button').every(b=>b.getAttribute('aria-pressed')==='false');
      a[1].click();a[0].click();
      const roles={main:a[1].getAttribute('aria-pressed'),parallel:a[0].getAttribute('aria-pressed')};
      const drawReady=!one('.draw-button').disabled;
      return {inlineQ,divider,footer,initialCount,afterAdd,afterBlankDelete,
        afterRefusedDelete,afterConfirmedDelete,confirmations,preview,reordered,ghostRemoved,
        primarySelected,cleared,roles,drawReady};
    })()`);
    assert.equal(ux70.inlineQ,true);
    assert.equal(ux70.divider,true);
    assert.equal(ux70.footer,true);
    assert.equal(ux70.initialCount,'計3枚');
    assert.equal(ux70.afterAdd,4);
    assert.equal(ux70.afterBlankDelete,3);
    assert.equal(ux70.afterRefusedDelete,3);
    assert.equal(ux70.afterConfirmedDelete,2);
    assert.equal(ux70.confirmations,2);
    assert.equal(ux70.preview.ghost,true);
    assert.ok(ux70.preview.from>=2 && ux70.preview.to>=2,'Whole-column source/destination should be visible during drag');
    assert.deepEqual(ux70.reordered,['次','最初']);
    assert.equal(ux70.ghostRemoved,true);
    assert.equal(ux70.primarySelected,true);
    assert.equal(ux70.cleared,true);
    assert.equal(ux70.roles.main,'true');
    assert.equal(ux70.roles.parallel,'true');
    assert.equal(ux70.drawReady,true);
    report('UX70-FRONTEND-GESTURES',{status:'PASS',...ux70});
  }
  if (expectSafe) {
    // One branch may have committed while the other has an unknown transport result.
    await navigate();
    const partial = await evalInPage(`(async () => {
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      const one=q=>document.querySelector(q);
      const all=q=>[...document.querySelectorAll(q)];
      __p0.deferDraw=false;
      __p0.failDrawPiles=['B'];
      one('.shuffle-button').click();
      for(let i=0;i<100 && all('.pile-button').length!==3;i++)await sleep(20);
      all('.pile-button')[0].click(); all('.pile-button')[1].click();
      one('.draw-button').click();
      for(let i=0;i<100 && !one('.reading-status').textContent.includes('確定状況が不明');i++)await sleep(20);
      const before=__p0.drawCalls.length;
      one('.draw-button').click();
      await sleep(30);
      return {message:one('.reading-status').textContent,
        primaryCards:all('.primary-matrix .card-detail-trigger').length,
        parallelCards:all('.parallel-matrix .card-detail-trigger').length,
        before,after:__p0.drawCalls.length,
        newReadingVisible:!one('#newReadingButton').classList.contains('hidden')};
    })()`);
    assert.equal(partial.primaryCards,3);
    assert.equal(partial.parallelCards,0);
    assert.equal(partial.after,partial.before,'Never re-dispatch potentially committed partial draw');
    assert.equal(partial.newReadingVisible,true);
    report('PARTIAL-COMMIT-UNKNOWN',{status:'PASS',...partial});

    await navigate();
    const unknown=await evalInPage(`(async()=>{
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      const one=q=>document.querySelector(q);
      __p0.deferDraw=false;
      __p0.failDrawPiles=['A'];
      one('.shuffle-button').click();
      for(let i=0;i<100 && document.querySelectorAll('.pile-button').length!==3;i++)await sleep(20);
      one('.pile-button:nth-child(1)').click();
      one('.draw-button').click();
      for(let i=0;i<100 && !one('.reading-status').textContent.includes('確定済みの可能性');i++)await sleep(20);
      const before=__p0.drawCalls.length;
      one('.draw-button').click();
      await sleep(30);
      return {message:one('.reading-status').textContent,before,after:__p0.drawCalls.length,
        resultCount:document.querySelectorAll('.card-detail-trigger').length};
    })()`);
    assert.equal(unknown.resultCount,0);
    assert.equal(unknown.after,unknown.before);
    report('ALL-UNKNOWN-NO-RETRY',{status:'PASS',...unknown});

    // Two independent branches return in reverse order: view role and cards
    // must still be mapped to their own pile, not promise completion order.
    await navigate();
    const reordered=await evalInPage(`(async()=>{
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      const one=q=>document.querySelector(q);
      const all=q=>[...document.querySelectorAll(q)];
      one('.shuffle-button').click();
      for(let i=0;i<100 && all('.pile-button').length!==3;i++)await sleep(20);
      all('.pile-button')[0].click(); all('.pile-button')[1].click();
      one('.draw-button').click();
      for(let i=0;i<100 && __p0.deferredDraw.length!==2;i++)await sleep(20);
      const releases=__p0.deferredDraw.splice(0);
      releases[1]();
      await sleep(30);
      const prematurelyCompleted=one('.reading-status').textContent.includes('抽選完了');
      releases[0]();
      for(let i=0;i<100 && !one('.reading-status').textContent.includes('抽選完了');i++)await sleep(20);
      return {prematurelyCompleted,
        primaryLabel:one('.primary-pile-label').textContent,
        parallelLabel:one('.parallel-pile-label').textContent,
        primaryA:one('.primary-matrix .card-art')?.src.includes('major-fool'),
        parallelB:one('.parallel-matrix .card-art')?.src.includes('major-magician')};
    })()`);
    assert.equal(reordered.prematurelyCompleted,false);
    assert.equal(reordered.primaryLabel,'山 A');
    assert.equal(reordered.parallelLabel,'山 B');
    assert.equal(reordered.primaryA,true);
    assert.equal(reordered.parallelB,true);
    report('REORDERED-BRANCH-RESPONSES',{status:'PASS',...reordered});

    // Rate-limit errors are not safe to interpret as a draw rollback.
    await navigate();
    const limited=await evalInPage(`(async()=>{
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      const one=q=>document.querySelector(q);
      __p0.deferDraw=false;
      __p0.failDrawStatuses={A:429};
      one('.shuffle-button').click();
      for(let i=0;i<100 && document.querySelectorAll('.pile-button').length!==3;i++)await sleep(20);
      one('.pile-button:nth-child(1)').click();
      one('.draw-button').click();
      for(let i=0;i<100 && !one('.reading-status').textContent.includes('確定済みの可能性');i++)await sleep(20);
      const before=__p0.drawCalls.length;
      one('.draw-button').click();
      await sleep(30);
      return {before,after:__p0.drawCalls.length,message:one('.reading-status').textContent};
    })()`);
    assert.equal(limited.before,1);
    assert.equal(limited.after,1);
    report('RATE-LIMITED-NO-RETRY',{status:'PASS',...limited});
  }
  if (expectSafe) {
    // Full 80-card journey: no automatic pile crossover, no Parallel when
    // all three main piles are needed, and stable row-major merged positions.
    await navigate();
    const eighty = await evalInPage(`(async () => {
      const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
      const one = q => document.querySelector(q);
      const all = q => [...document.querySelectorAll(q)];
      __p0.deferDraw = false;
      for (let i=3;i<80;i++) one('.axis-add-header .axis-add-button').click();
      const capLabel = one('.layout-count').textContent;
      const eightyIsLimit = one('.axis-add-header .axis-add-button').disabled &&
        one('.axis-add-row-header .axis-add-button').disabled;
      one('.shuffle-button').click();
      for (let i=0;i<120 && all('.pile-button').length!==3;i++)await sleep(20);
      const a=all('.pile-button');
      a[0].click();
      const cueA=one('.selection-message').textContent;
      const drawingAfterA=one('.draw-button').disabled;
      a[1].click();
      const cueB=one('.selection-message').textContent;
      const drawingAfterB=one('.draw-button').disabled;
      a[2].click();
      const drawingAfterC=one('.draw-button').disabled;
      const parallelBlocked=all('.pile-button').every(button => button.disabled || button.getAttribute('aria-pressed')==='true');
      one('.draw-button').click();
      for(let i=0;i<160 && one('.reading-status').textContent!=='抽選完了';i++)await sleep(30);
      const cards=all('.primary-matrix .card-detail-trigger').length;
      const rows=all('.primary-matrix .reading-table tbody tr').length;
      const heading=one('.primary-pile-label').textContent;
      const ids=__p0.drawCalls.flatMap(call=>call.positions);
      const rowName=one('.primary-matrix .row-header');
      return {capLabel,eightyIsLimit,cueA,cueB,drawingAfterA,drawingAfterB,
        drawingAfterC,parallelBlocked,cards,rows,heading,unique:new Set(ids).size,
        count:ids.length,piles:__p0.drawCalls.map(call=>call.pile),
        rowWidth:rowName.getBoundingClientRect().width,
        writingMode:getComputedStyle(rowName.querySelector('.axis-inline-label')).writingMode};
    })()`);
    assert.match(eighty.capLabel,/80枚/);
    assert.equal(eighty.eightyIsLimit,true);
    assert.match(eighty.cueA,/枚数確保の為次の山を選択/);
    assert.match(eighty.cueB,/枚数確保の為次の山を選択/);
    assert.equal(eighty.drawingAfterA,true);
    assert.equal(eighty.drawingAfterB,true);
    assert.equal(eighty.drawingAfterC,false);
    assert.equal(eighty.parallelBlocked,true);
    assert.equal(eighty.cards,80);
    assert.equal(eighty.unique,80);
    assert.deepEqual(eighty.piles,['A','B','C']);
    assert.ok(eighty.rowWidth<=80);
    assert.equal(eighty.writingMode,'vertical-rl');
    report('MULTIPILE-80-FULL-JOURNEY',{status:'PASS',...eighty});
  }
  console.log(expectSafe ? 'P1 corrected controlled tests successful' :
    'P0 controlled baseline successful (known defects intentionally reproduced; not P1 acceptance)');
} finally {
  socket?.close();
  browser?.kill('SIGKILL');
  if (browser && browser.exitCode === null && browser.signalCode === null) {
    await Promise.race([once(browser, 'exit'), new Promise(resolve => setTimeout(resolve, 1500))]);
  }
  server.close();
  // Child Chrome cache writers may outlive the parent signal very briefly.
  await rm(profile,{recursive:true,force:true,maxRetries:12,retryDelay:150});
}
