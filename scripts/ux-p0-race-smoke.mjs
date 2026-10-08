// P0 controlled browser characterization; asserts baseline defects, NOT desired production behavior.
// Run with Node 22+ and CHROME_BIN=google-chrome|chromium; never accesses production API.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTarotServer } from '../src/server.js';

const bin = process.env.CHROME_BIN || ['google-chrome','chromium','chromium-browser']
  .map(name => spawnSync('which',[name],{encoding:'utf8'}))
  .find(result => result.status === 0)?.stdout.trim();
if (!bin) throw Error('P0 requires Chromium');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
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
    copiedText: null
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
      return ok({branch_id:id},201);
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
      const reply=()=>ok({pile_id:branch.pile,positions:cards});
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
    '--remote-debugging-port=0','--user-data-dir='+profile,'--window-size=1440,1000','about:blank'],{stdio:'ignore'});
  // Dynamic debugging port is written to DevToolsActivePort in the isolated profile.
  const {readFile}=await import('node:fs/promises');
  let port;
  for(let i=0;i<100;i++){
    try {port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}
    await sleep(100);
  }
  if(!port)throw Error('Chromium debugging endpoint unavailable');
  let target;
  for(let i=0;i<70;i++){
    try {
      const tabs=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
      target=tabs.find(tab=>tab.type==='page');
      if(target)break;
    }catch{}
    await sleep(100);
  }
  if(!target)throw Error('Chromium tab not ready');
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
    one('.axis-add-row-header .axis-add-button').click();
    const enabledAfter=!one('.shuffle-button').disabled;
    if(enabledAfter)one('.shuffle-button').click();
    await sleep(30);
    return {disabledBefore,enabledAfter,sessionCalls:__p0.sessions,shuffleCalls:__p0.shuffleCalls};
  })()`);
  assert.equal(shuffle.disabledBefore,true);
  assert.equal(shuffle.enabledAfter,true,'Known C04 shuffle rerender race should reproduce');
  assert.ok(shuffle.sessionCalls>=2,'Duplicate shuffle session request should reproduce');
  report('C04-SHUFFLE-REENABLE',{status:'REPRODUCED',...shuffle});

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
  assert.equal(pendingC03.label,'山 B','Expected selected mutable B pile label on A response');
  assert.equal(pendingC03.resultPile,'A','Expected actual card identity from branch A');
  report('C03-PILE-MISATTRIBUTION',{status:'REPRODUCED',...pendingC03});

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
  assert.equal(duplicate.enabledAfter,true);
  assert.ok(duplicate.branches.filter(x=>x==='A').length>=2);
  report('C04-DRAW-REENABLE',{status:'REPRODUCED',...duplicate});

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
      copiedQuestion:copied?.includes('P0 baseline question'),copiedParallel:copied?.includes('Parallel'),
      copiedTabs:copied?.includes('\\t'),visibleCue,detail};
  })()`);
  assert.deepEqual(ready.dims,{rows:3,columns:9});
  assert.equal(ready.cards,54);
  assert.deepEqual(ready.drawPiles,['A','B']);
  assert.equal(ready.copiedQuestion,true);
  assert.equal(ready.copiedParallel,true);
  assert.equal(ready.copiedTabs,true);
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
  console.log('P0 controlled baseline successful (known defects intentionally reproduced; not P1 acceptance)');
} finally {
  socket?.close();
  browser?.kill('SIGKILL');
  server.close();
  await rm(profile,{recursive:true,force:true});
}
