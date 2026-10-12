// P0 controlled browser characterization; asserts baseline defects, NOT desired production behavior.
// Run with Node 22+ and CHROME_BIN=google-chrome|chromium; never accesses production API.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
      const options=JSON.parse(init.body||'{}');
      const includeTitle=options.include_title ?? options.include_custom ?? true;
      const includeSecondary=options.include_secondary ?? options.include_custom ?? true;
      const custom=includeTitle && includeSecondary;
      const majorOnly=options.major_only??false;
      const total=(majorOnly?22:78)+Number(includeTitle)+Number(includeSecondary);
      const each=Math.floor(total/3), remainder=total%3;
      const deckId=options.deck_id||'B';
      p0.deckId=deckId;
      p0.includeCustom=custom;
      const reply=()=>ok({
        include_custom:custom,include_title:includeTitle,include_secondary:includeSecondary,
        deck_id:deckId,major_only:majorOnly,total_cards:total,
        piles:[
          {pile_id:'A',count:each+Number(remainder>0)},
          {pile_id:'B',count:each+Number(remainder>1)},
          {pile_id:'C',count:each}
        ]
      });
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
      const cards=Object.fromEntries(positions.map((position,index)=>{
        const intro=p0.deckId==='A' && p0.includeCustom && branch.pile==='A' && index===0;
        const title=p0.deckId==='A' && p0.includeCustom && branch.pile==='A' && index===1;
        return [position,{
          card_id:intro?'meta.introduction':title?'meta.title':branch.pile==='A'?'major.fool':'major.magician',
          name_ja:intro?'パメラ・コールマン・スミス紹介カード':title?'タイトルカード':branch.pile==='A'?'愚者':'魔術師',
          orientation:title?'reversed':branch.pile==='A'?'upright':'reversed'
        }];
      }));
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
async function navigate(width=1440, retainSettings=false, verifyDefaultA=false) {
  if (!retainSettings) await cdp.call('Runtime.evaluate', { expression: 'try { localStorage.removeItem("tarot-draw.preferences.v1") } catch {}' });
  await cdp.call('Emulation.setDeviceMetricsOverride',{width,height:857,deviceScaleFactor:1,mobile:false});
  await cdp.call('Page.navigate',{url:base+'?p0='+Math.random()});
  for(let attempt=0;attempt<90;attempt++){
    try {
      if(await evalInPage("Boolean(document.querySelector('.axis-add-row-header .axis-add-button'))")) {
        // Baseline UX flows previously used Deck B. Select it explicitly in
        // tests that require legacy B fixtures; default-A assertions skip it.
        if (!verifyDefaultA) await evalInPage(`(() => {
          const q=s=>document.querySelector(s);
          q('#settingsButton').click();
          q('input[name="deckId"][value="B"]').click();
          q('#settingsDone').click();
        })()`);
        return;
      }
    }catch{}
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

  if (expectSafe) {
    // #78 settings are discoverable, native-dialog accessible and applied only
    // to the current unshuffled reading, never retroactively to a frozen draw.
    await navigate(390,false,true);
    const settings = await evalInPage(`(async()=>{
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      const q=s=>document.querySelector(s), all=s=>[...document.querySelectorAll(s)];
      const plus=q('.axis-add-actions-column .axis-add-button').getBoundingClientRect();
      const minus=q('.axis-add-actions-column .axis-remove-button').getBoundingClientRect();
      q('#settingsButton').click();
      const opened=q('#settingsDialog').open;
      const previewCount=all('#settingsDialog .deck-preview-face').length;
      const initialDisabled = all('.deck-preview-checkbox[data-deck="A"]').every(e=>!e.disabled) &&
        all('.deck-preview-checkbox[data-deck="B"]').every(e=>e.disabled);
      const dialogFits = q('#settingsDialog').scrollWidth <= q('#settingsDialog').clientWidth + 1;
      const majorTop=q('.settings-major-choice').getBoundingClientRect().top;
      const deckTop=q('.deck-choice-line').getBoundingClientRect().top;
      const headingHeight=q('.settings-heading').getBoundingClientRect().height;
      const dialogFullHeight=q('#settingsDialog .settings-panel').scrollHeight;
      const captions=all('.deck-preview-name').map(e=>e.textContent.trim());
      const cardFaceWidth = q('.deck-preview-face').getBoundingClientRect().width;
      for(let i=0;i<100 && all('[data-deck-a-image] img').length!==2;i++)await sleep(20);
      const aArt=all('[data-deck-a-image] img').map(im=>({
        src:im.getAttribute('src'),ok:im.complete&&im.naturalWidth===512&&im.naturalHeight===878
      }));
      q('input[name="deckId"][value="A"]').click();
      const selectedEnabled = all('.deck-preview-checkbox[data-deck="A"]').every(e=>!e.disabled) &&
        all('.deck-preview-checkbox[data-deck="B"]').every(e=>e.disabled);
      const cardRects = all('.deck-preview-checkbox[data-deck="A"]').map(e=>{
        const box=e.getBoundingClientRect(),face=e.parentElement.querySelector('.deck-preview-face').getBoundingClientRect();
        return {input:{x:box.x,y:box.y,width:box.width,height:box.height},face:{x:face.x,y:face.y,width:face.width,height:face.height}};
      });
      const controlOnCard = cardRects.every(({input,face})=> input.x>=face.x-1&&
        input.x+input.width<=face.x+face.width+1&&input.y>=face.y-1&&input.y+input.height<=face.y+face.height+1);
      q('#includeTitleCardA').click();
       q('#includeSecondaryCardA').click();
      const selectedA=q('.reading-deck-summary').textContent;
      q('#settingsDone').click();
      const closed=!q('#settingsDialog').open;
      q('.shuffle-button').click();
      for(let i=0;i<100&&all('.primary-pile-options .pile-button').length!==3;i++)await sleep(20);
      const counts=all('.primary-pile-options .pile-count').map(e=>e.textContent);
      const modeStatus=q('.reading-deck-summary').textContent;
      q('#settingsButton').click();
      q('input[name="deckId"][value="B"]').click();
      q('#includeTitleCard').click();
      q('#includeSecondaryCard').click();
      const immutability=q('.reading-deck-summary').textContent;
      const nextNotice=q('#settingsScope').textContent;
      q('#settingsClose').click();
      return {opened,closed,previewCount,aArt,initialDisabled,dialogFits,majorBeforeDeck:majorTop<deckTop,headingHeight,dialogFullHeight,captions,cardFaceWidth,selectedEnabled,controlOnCard,cardRects,
        squarePlus:Math.abs(plus.width-plus.height)<1&&plus.width>=26,
        squareMinus:Math.abs(minus.width-minus.height)<1&&minus.width>=26,
        selectedA,counts,modeStatus,immutability,nextNotice};
    })()`);
    assert.equal(settings.opened,true);
    assert.equal(settings.closed,true);
    assert.equal(settings.previewCount,4);
    assert.equal(settings.initialDisabled,true,'Deck A must be initially selected, while Deck B controls are disabled');
    assert.equal(settings.selectedEnabled,true,'Radio selection enables only active deck cards');
    assert.equal(settings.controlOnCard,true,'Checkbox overlay geometry '+JSON.stringify(settings.cardRects));
    assert.equal(settings.dialogFits,true,'Settings must have no horizontal clipping on mobile');
    assert.ok(settings.cardFaceWidth>=145,'390px two-up cards must remain usable');
    assert.equal(settings.majorBeforeDeck,true,'Major setting precedes deck choice');
    assert.ok(settings.headingHeight<=48,'Settings heading has no surplus padding');
    assert.ok(settings.dialogFullHeight<=990,'Settings content must be vertically compact');
    assert.deepEqual(settings.captions,['タイトルカード','紹介カード','タイトルカード','保証カード']);
    assert.equal(settings.aArt.length,2);
    assert.ok(settings.aArt.every(a=>a.ok&&a.src.endsWith('.webp')),'Both Deck A cards must load as fixed-font self-hosted WebP in browser');
    assert.equal(settings.squarePlus,true);
    assert.equal(settings.squareMinus,true);
    assert.equal(settings.selectedA,'デッキA・78枚');
    assert.deepEqual(settings.counts,['26枚','26枚','26枚']);
    assert.equal(settings.modeStatus,'デッキA・78枚');
    assert.equal(settings.immutability,'デッキA・78枚');
    assert.ok(settings.nextNotice.includes('次の新しい占い'));
    report('UX78-DECK-SETTINGS',{status:'PASS',...settings});

    // #111: persist only validated local settings (both deck-specific toggles)
    // through reload, and propagate the preference to a new Reading.
    await navigate(390,false,true);
    const beforeReload = await evalInPage(`(() => {
      const q=s=>document.querySelector(s);
      q('#settingsButton').click();
      q('#includeSecondaryCardA').click();
      q('input[name="deckId"][value="B"]').click();
      q('#includeTitleCard').click();
      q('#majorOnlyCheckbox').click();
      q('#settingsDone').click();
      return { summary:q('.reading-deck-summary').textContent,
        saved:localStorage.getItem('tarot-draw.preferences.v1') };
    })()`);
    assert.equal(beforeReload.summary,'デッキB・大アルカナ・23枚');
    assert.ok(beforeReload.saved && !beforeReload.saved.includes('question'),
      'Only preference values, never user questions, should persist');
    await navigate(390,true,true);
    const restored=await evalInPage(`(async()=> {
      const q=s=>document.querySelector(s), all=s=>[...document.querySelectorAll(s)];
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      __p0.deferDraw=false;
      const summary=q('.reading-deck-summary').textContent;
      q('#settingsButton').click();
      const bSelected=q('input[name="deckId"][value="B"]').checked;
      const bTitle=q('#includeTitleCard').checked;
      const bIntro=q('#includeSecondaryCard').checked;
      const major=q('#majorOnlyCheckbox').checked;
      q('input[name="deckId"][value="A"]').click();
      const aTitle=q('#includeTitleCardA').checked;
      const aIntro=q('#includeSecondaryCardA').checked;
      q('input[name="deckId"][value="B"]').click();
      q('#settingsDone').click();
      q('.shuffle-button').click();
      for(let i=0;i<120 && all('.primary-pile-options .pile-button').length!==3;i++)await wait(20);
      const counts=all('.primary-pile-options .pile-count').map(x=>x.textContent);
      all('.primary-pile-options .pile-button')[0].click();
      q('.draw-button').click();
      for(let i=0;i<160 && !q('.reading-status').textContent.includes('抽選完了');i++)await wait(20);
      const completed=q('.reading-status').textContent.includes('抽選完了');
      q('#newReadingButton').click();
      const newSummary=q('.reading-deck-summary').textContent;
      const readings=all('.reading-workbench').length;
      return {summary,bSelected,bTitle,bIntro,major,aTitle,aIntro,counts,completed,newSummary,readings};
    })()`);
    assert.deepEqual(restored,{
      summary:'デッキB・大アルカナ・23枚',bSelected:true,bTitle:false,bIntro:true,
      major:true,aTitle:true,aIntro:false,counts:['8枚','8枚','7枚'],
      completed:true,newSummary:'デッキB・大アルカナ・23枚',readings:2
    }, 'Settings must carry through reload and a newly created reading');
    report('UX111-SETTINGS-PERSISTENCE',{status:'PASS',...restored});


    await navigate(320);
    const mobileSettings=await evalInPage(`(() => {
      document.querySelector('#settingsButton').click();
      const d=document.querySelector('#settingsDialog');
      const face=d.querySelector('.deck-preview-face').getBoundingClientRect();
      const previews=[...d.querySelectorAll('.deck-preview-face')].map(el=>el.getBoundingClientRect());
      return {width:face.width,fits:d.scrollWidth<=d.clientWidth+1,
        totalHeight:d.querySelector('.settings-panel').scrollHeight,
        twoUp:Math.abs(previews[0].top-previews[1].top)<1,
        labels:[...d.querySelectorAll('.deck-preview-name')].length};
    })()`);
    assert.ok(mobileSettings.width>=120,'320px two-up card previews remain usable');
    assert.equal(mobileSettings.twoUp,true,'Card previews must be paired at 320px');
    assert.ok(mobileSettings.totalHeight<=930,'Settings should no longer require excessive vertical scrolling');
    assert.equal(mobileSettings.fits,true,'320px settings dialog must not scroll sideways');
    assert.equal(mobileSettings.labels,4);
    report('UX87-SETTINGS-320',{status:'PASS',...mobileSettings});
    const settings320Proof = await cdp.call('Page.captureScreenshot',{format:'png'});
    await writeFile('settings-deck-320.png',Buffer.from(settings320Proof.data,'base64'));


    // Re-navigate at the claimed 390px viewport; otherwise this proof would
    // silently duplicate the preceding 320px screenshot.
    await navigate(390);
    await evalInPage(`(() => document.querySelector('#settingsButton').click())()`);
    const settings390Proof = await cdp.call('Page.captureScreenshot',{format:'png'});
    await writeFile('settings-deck-390.png',Buffer.from(settings390Proof.data,'base64'));
    await evalInPage(`(() => document.querySelector('#settingsClose').click())()`);

    // #93: live 320px gestures — bottom grip and repeated column addition.
    await navigate(320);
    const axisFollow = await evalInPage(`(() => {
      const q=s=>document.querySelector(s);
      const host=q('.primary-matrix'), name=q('.row-header .axis-inline-label');
      const grip=q('.row-header .axis-menu-trigger');
      const label=name.getBoundingClientRect(), gripBox=grip.getBoundingClientRect();
      const bottomPadding=parseFloat(getComputedStyle(name).paddingBottom);
      const gripBelowName=gripBox.top>=label.bottom-bottomPadding-1 &&
        gripBox.bottom<=label.bottom+2;
      const deltas=[];
      for(let i=0;i<9;i++){
        q('.axis-add-header .axis-add-button').click();
        const scroll=q('.primary-matrix');
        const button=q('.axis-add-header .axis-add-button').getBoundingClientRect();
        const bounds=scroll.getBoundingClientRect();
        deltas.push({left:scroll.scrollLeft,max:scroll.scrollWidth-scroll.clientWidth,
          visible:button.left>=bounds.left-1 && button.right<=bounds.right+1});
      }
      return {gripBelowName,deltas};
    })()`);
    assert.equal(axisFollow.gripBelowName,true,'Reorder six-dot grip must be below row name ink');
    assert.equal(axisFollow.deltas.length,9);
    assert.ok(axisFollow.deltas.every(d=>Math.abs(d.left-d.max)<2 && d.visible),
      'Each column + must keep controls visible at the new far right: '+JSON.stringify(axisFollow.deltas));
    report('UX93-COLUMN-PLUS-AUTOFOLLOW',{status:'PASS',...axisFollow});

    // #109: 36px row gutter must fully contain its left-aligned +. Repeated
    // adds follow the new bottom controls downward without moving the X axis.
    for(const width of [320,390]) {
      await navigate(width);
      const follow=await evalInPage(`(async()=> {
        const q=s=>document.querySelector(s);
        const first=q('.axis-add-row-header .axis-add-actions');
        const initial=q('.axis-add-row-header .axis-add-button').getBoundingClientRect();
        const strip=q('.axis-add-row-header').getBoundingClientRect();
        const snapshots=[];
        for(let i=0;i<10;i++){
          q('.axis-add-row-header .axis-add-button').click();
          await new Promise(resolve=>requestAnimationFrame(resolve));
          const plus=q('.axis-add-row-header .axis-add-button').getBoundingClientRect();
          const minus=q('.axis-add-row-header .axis-remove-button').getBoundingClientRect();
          const parent=q('.axis-add-row-header').getBoundingClientRect();
          snapshots.push({
            left:plus.left, stripLeft:parent.left, stripRight:parent.right,
            plusRight:plus.right, minusLeft:minus.left,
            screenBottom:plus.bottom, viewportBottom:innerHeight,
            scrollY:scrollY, scrollLeft:q('.primary-matrix').scrollLeft
          });
        }
        const countBefore=q('.primary-matrix').querySelectorAll('.row-header').length;
        q('.axis-add-row-header .axis-remove-button').click();
        const countAfter=q('.primary-matrix').querySelectorAll('.row-header').length;
        return {initialLeft:initial.left,initialStripLeft:strip.left,
          justify:getComputedStyle(q('.axis-add-row-header .axis-add-actions')).justifyContent, snapshots,countBefore,countAfter};
      })()`);
      assert.equal(follow.justify,'flex-start');
      assert.ok(follow.initialLeft>=follow.initialStripLeft-1,
        'Initial row + clipped to the left: '+JSON.stringify(follow));
      assert.ok(follow.snapshots.every(d=>d.left>=d.stripLeft-1 &&
        Math.abs((d.plusRight+d.minusLeft)/2-d.stripRight)<=2 &&
        d.plusRight<d.stripRight && d.minusLeft>d.stripRight),
        'Row divider must fall between + and minus, not through minus: '+JSON.stringify(follow));
      assert.ok(follow.snapshots.every(d=>d.screenBottom<=d.viewportBottom-5),
        'Repeated row + must remain visible at bottom: '+JSON.stringify(follow.snapshots));
      assert.ok(follow.snapshots.every(d=>d.scrollLeft===follow.snapshots[0].scrollLeft),
        'Row auto-follow must not pan horizontally');
      assert.ok(follow.snapshots.at(-1).scrollY>follow.snapshots[0].scrollY,
        'Repeated + must scroll down as rows grow');
      assert.equal(follow.countBefore,11);
      assert.equal(follow.countAfter,10);
      report('UX109-ROW-PLUS-LEFT-AND-AUTOFOLLOW',{status:'PASS',width,
        scrollY:follow.snapshots.at(-1).scrollY,countAfter:follow.countAfter});
    }



    // #99: major-only option is not a CSS filter. The mock returns server
    // metadata (including mode) and all three authoritative pile capacities.
    for(const flags of [[false,false,22],[true,false,23],[false,true,23],[true,true,24]]) {
      await navigate(390);
      const mode = await evalInPage(`(async (flags)=>{
        const q=s=>document.querySelector(s), all=s=>[...document.querySelectorAll(s)];
        const wait=ms=>new Promise(r=>setTimeout(r,ms));
        q('#settingsButton').click();
        q('#majorOnlyCheckbox').click();
        if(!flags[0])q('#includeTitleCard').click();
        if(!flags[1])q('#includeSecondaryCard').click();
        const setting=q('#selectedDeckCount').textContent;
        q('#settingsDone').click();
        q('.shuffle-button').click();
        for(let i=0;i<100&&all('.primary-pile-options .pile-button').length<3;i++)await wait(20);
        return {setting,summary:q('.reading-deck-summary').textContent,
          counts:all('.primary-pile-options .pile-count').map(x=>x.textContent)};
      })(${JSON.stringify(flags)})`);
      assert.ok(mode.setting.startsWith(String(flags[2])+'枚'),JSON.stringify(mode));
      assert.ok(mode.summary.includes('大アルカナ'));
      assert.deepEqual(mode.counts,
        flags[2]===22?['8枚','7枚','7枚']:flags[2]===23?['8枚','8枚','7枚']:['8枚','8枚','8枚']);
      report('UX99-MAJOR-'+flags.join('-'),{status:'PASS',...mode});
    }


    await navigate(390);
    const complete24 = await evalInPage(`(async()=>{
      const q=s=>document.querySelector(s), all=s=>[...document.querySelectorAll(s)];
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      __p0.deferDraw=false;
      q('#settingsButton').click(); q('#majorOnlyCheckbox').click(); q('#settingsDone').click();
      for(let i=0;i<2;i++)q('.axis-add-row-header .axis-add-button').click();
      for(let i=0;i<5;i++)q('.axis-add-header .axis-add-button').click();
      q('.shuffle-button').click();
      for(let i=0;i<100&&all('.primary-pile-options .pile-button').length<3;i++)await wait(20);
      const independent=!q('.pile-set-parallel').classList.contains('hidden');
      for(let i=0;i<3;i++)all('.primary-pile-options .pile-button')[i].click();
      const ready=!q('.draw-button').disabled;
      q('.draw-button').click();
      for(let i=0;i<120&&q('.reading-status').textContent!=='抽選完了';i++)await wait(20);
      return {independent,ready,count:all('.primary-matrix .card-detail-trigger').length,
        piles:__p0.drawCalls.map(d=>[d.pile,d.positions.length]),
        excluded:all('.primary-matrix .cell-mask-excluded').length};
    })()`);
    assert.equal(complete24.independent,true);
    assert.equal(complete24.ready,true);
    assert.equal(complete24.count,24);
    assert.deepEqual(complete24.piles,[['A',8],['B',8],['C',8]]);
    assert.equal(complete24.excluded,0);
    report('UX99-MAJOR-24-FULL-DRAW',{status:'PASS',...complete24});

    // #90: <=26 keeps one shared selector, 27+ restores independent selectors.
    await navigate(320);
    const compact = await evalInPage(`(async()=>{
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      const q=s=>document.querySelector(s), all=s=>[...document.querySelectorAll(s)];
      const rowHeader=q('.row-header'), columnHeader=q('.column-header');
      const question=q('.question-input').getBoundingClientRect();
      const deck=q('.reading-deck-summary').getBoundingClientRect();
      const topbar=q('.topbar').getBoundingClientRect();
      const settings=q('#settingsButton').getBoundingClientRect();
      const deckRightAligned=deck.right<=settings.left+1 && settings.left-deck.right<=14 &&
        deck.top>=topbar.top-1 && deck.bottom<=topbar.bottom+1 &&
        deck.width>50 && question.width>100;
      const alignedAxisWidth=Math.abs(rowHeader.getBoundingClientRect().width-columnHeader.getBoundingClientRect().height)<1;
      const mask=q('.cell-mask-toggle');
      const maskStyle=getComputedStyle(mask);
      const noRoundFrame=maskStyle.borderTopWidth==='0px' && maskStyle.borderRadius==='0px' &&
        maskStyle.backgroundColor==='rgba(0, 0, 0, 0)';
      q('.shuffle-button').click();
      for(let i=0;i<100&&all('.primary-pile-options .pile-button').length!==3;i++)await sleep(20);
      const pane=q('.pile-panel'), stage=q('.matrix-stage'), matrix=q('.primary-matrix');
      const shared=pane.classList.contains('pile-panel-shared') &&
        q('.pile-set-parallel').classList.contains('hidden');
      const stacks=all('.primary-pile-options .pile-card-back');
      const overlay=stage.contains(pane) && stage.contains(matrix) &&
        getComputedStyle(pane).position==='absolute' &&
        stacks.length===3 && stacks.every(el=>getComputedStyle(el).backgroundImage!=='none');
      const stageBounds=stage.getBoundingClientRect(), paneBounds=pane.getBoundingClientRect();
      const overlayFits=paneBounds.top>=stageBounds.top-1 && paneBounds.bottom<=stageBounds.bottom+2 &&
        stacks.every(el=>{const r=el.getBoundingClientRect();return r.left>=stageBounds.left && r.right<=stageBounds.right;});
      const nearDraw=q('.pile-draw-button'), globalDraw=q('.draw-button');
      const inlineInitiallyDisabled=nearDraw.disabled && globalDraw.disabled;
      const drawBelowPiles=nearDraw.getBoundingClientRect().top >=
        all('.pile-set-primary .pile-button')[0].getBoundingClientRect().bottom-1 &&
        nearDraw.getBoundingClientRect().bottom <= pane.getBoundingClientRect().bottom+2;
      all('.primary-pile-options .pile-button')[0].click();
      const firstOnly=all('.primary-pile-options .pile-role').map(x=>x.textContent);
      all('.primary-pile-options .pile-button')[1].click();
      const both=all('.primary-pile-options .pile-role').map(x=>x.textContent);
      const drawReady=!q('.draw-button').disabled && !nearDraw.disabled;
      all('.primary-pile-options .pile-button')[1].click();
      const clearedParallel=all('.primary-pile-options .pile-button')[1].getAttribute('aria-pressed')==='false';
      return {shared,overlay,overlayFits,inlineInitiallyDisabled,drawBelowPiles,firstOnly,both,drawReady,clearedParallel,noRoundFrame,deckRightAligned,alignedAxisWidth};
    })()`);
    assert.equal(compact.shared,true);
    assert.equal(compact.overlay,true,'Three visual card stacks must cover the matrix');
    assert.equal(compact.overlayFits,true,'Piles must fit over the primary table at 320px');
    assert.equal(compact.inlineInitiallyDisabled,true,'Both Draw controls must begin disabled until pile selection');
    assert.equal(compact.drawBelowPiles,true,'Inline Draw must be directly below card piles');
    assert.deepEqual(compact.firstOnly,['Primary','','']);
    assert.deepEqual(compact.both,['Primary','Parallel','']);
    assert.equal(compact.drawReady,true);
    assert.equal(compact.clearedParallel,true);
    assert.equal(compact.noRoundFrame,true);
    assert.equal(compact.deckRightAligned,true);
    assert.equal(compact.alignedAxisWidth,true);
    report('UX90-SHARED-320',{status:'PASS',...compact});
    const compactProof=await cdp.call('Page.captureScreenshot',{format:'png'});
    await writeFile('ux90-compact-320.png',Buffer.from(compactProof.data,'base64'));

    await navigate(390);
    const boundary = await evalInPage(`(async()=>{
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      const q=s=>document.querySelector(s), all=s=>[...document.querySelectorAll(s)];
      for(let i=0;i<6;i++)q('.axis-add-header .axis-add-button').click();
      for(let i=0;i<2;i++)q('.axis-add-row-header .axis-add-button').click();
      q('.shuffle-button').click();
      for(let i=0;i<100&&all('.primary-pile-options .pile-button').length!==3;i++)await sleep(20);
      const independent=q('.pile-set-parallel').classList.contains('hidden')===false;
      const inlineDisabledAtStart=q('.pile-draw-button').disabled;
      const overlaid=q('.matrix-stage').contains(q('.pile-panel')) &&
        getComputedStyle(q('.pile-panel')).position==='absolute' &&
        all('.pile-set-primary .pile-card-back').length===3 &&
        all('.pile-set-parallel .pile-card-back').length===3;
      all('.primary-pile-options .pile-button')[0].click();
      const noOrdinalForSingle=all('.primary-pile-options .pile-role').every(e=>!e.textContent);
      all('.parallel-pile-options .pile-button')[1].click();
      const separate=all('.primary-pile-options .pile-button')[1].getAttribute('aria-pressed')==='false' &&
        all('.parallel-pile-options .pile-button')[1].getAttribute('aria-pressed')==='true';
      const inlineReady=!q('.pile-draw-button').disabled && !q('.draw-button').disabled;
      const inlineBelowParallel=q('.pile-draw-button').getBoundingClientRect().top >=
        q('.pile-set-parallel .pile-button').getBoundingClientRect().bottom - 1;
      q('.primary-matrix [data-position="r0c0"] .cell-mask-toggle').click();
      const collapsed=q('.pile-panel').classList.contains('pile-panel-shared') &&
        all('.primary-pile-options .pile-role')[0].textContent==='Primary' &&
        all('.primary-pile-options .pile-role')[1].textContent==='Parallel';
      q('.primary-matrix [data-position="r0c0"] .cell-mask-toggle').click();
      const expanded=!q('.pile-panel').classList.contains('pile-panel-shared') &&
        all('.parallel-pile-options .pile-button')[1].getAttribute('aria-pressed')==='true';
      return {independent,overlaid,inlineDisabledAtStart,inlineReady,inlineBelowParallel,noOrdinalForSingle,separate,collapsed,expanded};
    })()`);
    assert.deepEqual(boundary,{independent:true,overlaid:true,inlineDisabledAtStart:true,inlineReady:true,inlineBelowParallel:true,noOrdinalForSingle:true,separate:true,collapsed:true,expanded:true});
    report('UX90-27-BOUNDARY',{status:'PASS',...boundary});
    const independentProof=await cdp.call('Page.captureScreenshot',{format:'png'});
    await writeFile('ux90-independent-390.png',Buffer.from(independentProof.data,'base64'));

    // A/80 must use Deck A-only title and introduction keyword/meaning references.
    // Copy retains independent card IDs with no GUARANTEE.
    await navigate(390);
    const intro = await evalInPage(`(async()=>{
      const q=s=>document.querySelector(s), all=s=>[...document.querySelectorAll(s)];
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      __p0.deferDraw=false;
      q('#settingsButton').click();
      q('input[name="deckId"][value="A"]').click();
      q('#settingsDone').click();
      q('.shuffle-button').click();
      for(let i=0;i<100 && all('.primary-pile-options .pile-button').length!==3;i++)await sleep(20);
      const sizes=all('.primary-pile-options .pile-count').map(e=>e.textContent);
      all('.primary-pile-options .pile-button')[0].click();
      const inlineDrawReady=!q('.pile-draw-button').disabled && !q('.draw-button').disabled;
      q('.pile-draw-button').click();
      const inlineDrawLocked=q('.pile-draw-button').disabled && q('.draw-button').disabled;
      for(let i=0;i<120 && q('.reading-status').textContent!=='抽選完了';i++)await sleep(20);
      const first=q('.primary-matrix .card-detail-trigger');
      const visualTitle=first.querySelector('.card-title').textContent;
      const introResultName=first.getAttribute('aria-label');
      first.click();
      const introDetailOpen=q('#cardDetailDialog').open;
      const introKeywordRows=all('#cardDetailKeywordRows tbody tr').length;
      const introDetailName=q('#cardDetailTitle').textContent;
      const introOriginal=!q('#cardDetailOriginalMark').classList.contains('hidden') &&
        q('#cardDetailOriginalMark').textContent==='オリジナルカード';
      const introKeywordTerms=all('#cardDetailKeywordRows tbody td').length;
      const introEssence=q('#cardDetailEssence').textContent;
      const introUpright=q('#cardDetailUpright').textContent;
      const introReversed=q('#cardDetailReversed').textContent;
      const introSelected=q('#cardDetailUprightBlock').dataset.active;
      const introAProvenance=!q('#cardDetailDeckASource').classList.contains('hidden');
      const introTarotooHidden=q('#cardDetailTarotooSource').classList.contains('hidden');
      const introCustomHidden=q('#cardDetailCustom').classList.contains('hidden');
      q('#cardDetailClose').click();
      const second=all('.primary-matrix .card-detail-trigger')[1];
      second.click();
      const titleDetailOpen=q('#cardDetailDialog').open;
      const titleEssence=q('#cardDetailEssence').textContent;
      const titleDetailName=q('#cardDetailTitle').textContent;
      const titleOriginal=!q('#cardDetailOriginalMark').classList.contains('hidden');
      const titleUpright=q('#cardDetailUpright').textContent;
      const titleReversed=q('#cardDetailReversed').textContent;
      const titleKeywordRows=all('#cardDetailKeywordRows tbody tr').length;
      const titleSelected=q('#cardDetailReversedBlock').dataset.active;
      const titleAProvenance=!q('#cardDetailDeckASource').classList.contains('hidden');
      q('#cardDetailClose').click();
      const third=all('.primary-matrix .card-detail-trigger')[2];
      third.click();
      const standardOriginalHidden=q('#cardDetailOriginalMark').classList.contains('hidden');
      q('#cardDetailClose').click();
      q('.copy-button').click();
      for(let i=0;i<20&&!__p0.copiedText;i++)await sleep(20);
      return {
        sizes,summary:q('.reading-deck-summary').textContent,
        inlineDrawReady,inlineDrawLocked,introOriginal,titleOriginal,standardOriginalHidden,
        visualTitle,introResultName,introDetailName,introDetailOpen,introKeywordRows,introKeywordTerms,
        introEssence,introUpright,introReversed,introSelected,
        introAProvenance,introTarotooHidden,introCustomHidden,
        titleDetailOpen,titleDetailName,titleEssence,titleUpright,titleReversed,titleKeywordRows,
        titleSelected,titleAProvenance,
        copyIntro:__p0.copiedText?.includes('23 創り手'),
        copyTitle:__p0.copiedText?.includes('22 ウロボロス'),
        copyGuarantee:__p0.copiedText?.includes('GUARANTEE')
      };
    })()`);
    assert.deepEqual(intro.sizes,['27枚','27枚','26枚']);
    assert.equal(intro.summary,'デッキA・80枚');
    assert.ok(intro.visualTitle.includes('創り手'));
    assert.match(intro.introResultName,/創り手/);
    assert.match(intro.introDetailName,/23 創り手/);
    assert.match(intro.titleDetailName,/22 ウロボロス/);
    assert.equal(intro.inlineDrawReady,true,'Near-pile Draw must be ready alongside the global Draw');
    assert.equal(intro.inlineDrawLocked,true,'Both Draw actions must lock synchronously after near-pile activation');
    assert.equal(intro.introOriginal,true,'Deck A 創り手 must show the original-card marker');
    assert.equal(intro.titleOriginal,true,'Deck A ウロボロス must show the original-card marker');
    assert.equal(intro.standardOriginalHidden,true,'Standard tarot must not carry original-card marker');
    assert.equal(intro.introDetailOpen,true);
    assert.equal(intro.introKeywordRows,5);
    assert.equal(intro.introKeywordTerms,20);
    assert.match(intro.introEssence,/創り手（遺されるもの）/);
    assert.match(intro.introUpright,/創造の継承/);
    assert.match(intro.introReversed,/埋もれた創造/);
    assert.equal(intro.introSelected,'true');
    assert.equal(intro.introAProvenance,true);
    assert.equal(intro.introTarotooHidden,true);
    assert.equal(intro.introCustomHidden,true);
    assert.equal(intro.titleDetailOpen,true);
    assert.equal(intro.titleKeywordRows,5);
    assert.match(intro.titleEssence,/ウロボロス（境界の鏡）/);
    assert.match(intro.titleUpright,/終わりの始まり/);
    assert.match(intro.titleReversed,/始まりの終わり/);
    assert.equal(intro.titleSelected,'true');
    assert.equal(intro.titleAProvenance,true);
    assert.equal(intro.copyIntro,true);
    assert.equal(intro.copyTitle,true);
    assert.equal(intro.copyGuarantee,false);
    report('UX78-DECK-A-INTRO-DRAW',{status:'PASS',...intro});

    await navigate(390);
    const thirty = await evalInPage(`(async()=>{
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      const q=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
      __p0.deferDraw=false;
      for(let i=1;i<10;i++)q('.axis-add-row-header .axis-add-button').click();
      const needed=q('.layout-count').textContent;
      q('.shuffle-button').click();
      for(let i=0;i<100&&all('.primary-pile-options .pile-button').length!==3;i++)await sleep(20);
      all('.primary-pile-options .pile-button')[0].click();
      all('.primary-pile-options .pile-button')[1].click();
      all('.parallel-pile-options .pile-button')[2].click();
      all('.parallel-pile-options .pile-button')[0].click();
      const mainRoles=all('.primary-pile-options .pile-role').map(e=>e.textContent);
      const parallelRoles=all('.parallel-pile-options .pile-role').map(e=>e.textContent);
      const ready=!q('.draw-button').disabled;
      q('.draw-button').click();
      for(let i=0;i<120&&q('.reading-status').textContent!=='抽選完了';i++)await sleep(20);
      return {
        needed,mainRoles,parallelRoles,ready,
        mainCards:all('.primary-matrix .card-detail-trigger').length,
        parallelCards:all('.parallel-matrix .card-detail-trigger').length,
        mainHeading:q('.primary-pile-label').textContent,
        parallelHeading:q('.parallel-pile-label').textContent,
        drawMap:__p0.drawCalls.map(x=>({pile:x.pile,count:x.positions.length,
          first:x.positions[0]}))
      };
    })()`);
    assert.equal(thirty.needed,'計30枚');
    assert.deepEqual(thirty.mainRoles,['1番目','2番目','']);
    assert.deepEqual(thirty.parallelRoles,['2番目','','1番目']);
    assert.equal(thirty.ready,true);
    assert.equal(thirty.mainCards,30);
    assert.equal(thirty.parallelCards,30);
    assert.equal(thirty.mainHeading,'山 A → B');
    assert.equal(thirty.parallelHeading,'山 C → A');
    assert.deepEqual(thirty.drawMap.filter(x=>x.pile==='B').map(x=>x.count),[3]);
    assert.deepEqual(thirty.drawMap.filter(x=>x.pile==='C').map(x=>x.count),[26]);
    assert.deepEqual(thirty.drawMap.filter(x=>x.pile==='A').map(x=>x.count).sort((a,b)=>a-b),[4,27]);
    report('UX81-PARALLEL-30-INDEPENDENT',{status:'PASS',...thirty});
    await navigate(390);
    const maskBoth = await evalInPage(`(async()=>{
      const q=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      __p0.deferDraw=false;
      for(let i=1;i<10;i++)q('.axis-add-row-header .axis-add-button').click();
      for(const id of ['r0c0','r9c2'])q('.primary-matrix [data-position="'+id+'"] .cell-mask-toggle').click();
      q('.shuffle-button').click();
      for(let i=0;i<100&&all('.primary-pile-options .pile-button').length!==3;i++)await wait(20);
      for(const i of [0,1])all('.primary-pile-options .pile-button')[i].click();
      for(const i of [2,0])all('.parallel-pile-options .pile-button')[i].click();
      q('.draw-button').click();
      for(let i=0;i<120&&q('.reading-status').textContent!=='抽選完了';i++)await wait(20);
      const positions=s=>all('.'+s+'-matrix .cell-inactive').map(e=>e.dataset.position);
      const centered=s=>all('.'+s+'-matrix .cell-inactive').every(td=>{
        const mark=td.querySelector('.cell-mask-excluded'), t=td.getBoundingClientRect();
        const r=mark?.getBoundingClientRect();
        return mark?.textContent==='×' && r && Math.abs((r.left+r.right)/2-(t.left+t.right)/2)<2;
      });
      return {p:positions('primary'),q:positions('parallel'),
        centers:[centered('primary'),centered('parallel')],
        pCards:all('.primary-matrix .card-detail-trigger').length,
        qCards:all('.parallel-matrix .card-detail-trigger').length};
    })()`);
    assert.deepEqual(maskBoth.p,['r0c0','r9c2']);
    assert.deepEqual(maskBoth.q,maskBoth.p,'Parallel must use exactly the Primary exclusion mask');
    assert.deepEqual([maskBoth.pCards,maskBoth.qCards],[28,28]);
    assert.deepEqual(maskBoth.centers,[true,true]);
    report('UX97-PARALLEL-MASK',{status:'PASS',...maskBoth});
    await navigate(390);
    const headingStable = await evalInPage(`(()=>{
      const q=s=>document.querySelector(s), m=q('.primary-matrix');
      q('.axis-add-row-header .axis-add-button').click();
      const initial=m.getBoundingClientRect().top;
      const key=q('.row-header .axis-menu-trigger');
      key.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
      return {shift:Math.abs(m.getBoundingClientRect().top-initial),
        inline:q('.matrix-heading').contains(q('.layout-message')),
        text:q('.layout-message').textContent,
        marker:getComputedStyle(q('.layout-message'),'::before').content};
    })()`);
    assert.ok(headingStable.shift<2,'Status must not push grid down');
    assert.equal(headingStable.inline,true);
    assert.ok(headingStable.text.includes('順番'));
    assert.ok(headingStable.marker.includes('｜'));
    report('UX97-FIXED-HEADING-STATUS',{status:'PASS',...headingStable});



    await navigate(390);
    const mask = await evalInPage(`(async()=>{
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      const q=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
      __p0.deferDraw=false;
      for(let i=0;i<2;i++)q('.axis-add-row-header .axis-add-button').click();
      for(let i=0;i<2;i++)q('.axis-add-header .axis-add-button').click();
      const omitted=[];
      for(let row=0;row<3;row++)for(let col=0;col<5;col++){
        if(row===1||col===2)continue;
        const id='r'+row+'c'+col;
        q('.primary-matrix [data-position="'+id+'"] .cell-mask-toggle').click();
        omitted.push(id);
      }
      const before=q('.layout-count').textContent;
      q('.shuffle-button').click();
      for(let i=0;i<100&&all('.primary-pile-options .pile-button').length!==3;i++)await sleep(20);
      all('.primary-pile-options .pile-button')[0].click();
      q('.draw-button').click();
      for(let i=0;i<100&&q('.reading-status').textContent!=='抽選完了';i++)await sleep(20);
      const cards=all('.primary-matrix .card-detail-trigger').length;
      const excluded=all('.primary-matrix .cell-mask-excluded').length;
      q('.copy-button').click();
      for(let i=0;i<20&&!__p0.copiedText;i++)await sleep(20);
      return {before,cards,excluded,omitted,
        positions:__p0.drawCalls.flatMap(c=>c.positions),
        copiedMinus:(__p0.copiedText.match(/\\| - \\|/g)||[]).length};
    })()`);
    assert.equal(mask.before,'計7枚');
    assert.equal(mask.cards,7);
    assert.equal(mask.excluded,8);
    assert.equal(mask.positions.length,7);
    assert.ok(mask.positions.every(x=>!mask.omitted.includes(x)));
    assert.ok(mask.copiedMinus>=4);
    report('UX81-MASK-CROSS-SKIPS-DRAW',{status:'PASS',...mask});
  }

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
    for(let i=0;i<50 && document.querySelectorAll('.primary-pile-options .pile-button').length!==3;i++)await sleep(20);
    one('.primary-pile-options .pile-button:nth-child(1)').click();
    one('.draw-button').click();
    for(let i=0;i<50 && __p0.deferredDraw.length!==1;i++)await sleep(20);
    one('.primary-pile-options .pile-button:nth-child(1)').click(); // deselect Primary A
    one('.primary-pile-options .pile-button:nth-child(2)').click(); // choose Primary B
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
    for(let i=0;i<50 && document.querySelectorAll('.primary-pile-options .pile-button').length!==3;i++)await sleep(20);
    one('.primary-pile-options .pile-button:nth-child(1)').click();
    one('.draw-button').click();
    for(let i=0;i<50 && __p0.deferredDraw.length!==1;i++)await sleep(20);
    const disabledBefore=one('.draw-button').disabled;
    one('.primary-pile-options .pile-button:nth-child(2)').click();
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
    for(let i=0;i<100 && all('.primary-pile-options .pile-button').length!==3;i++)await sleep(20);
    all('.primary-pile-options .pile-button')[0].click();
    all('.parallel-pile-options .pile-button')[1].click();
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
      for(let i=0;i<100 && all('.primary-pile-options .pile-button').length!==3;i++)await sleep(20);
      one('.primary-pile-options .pile-button:nth-child(1)').click();
      const afterFirst={disabled:one('.draw-button').disabled,hint:one('.selection-message').textContent};
      one('.primary-pile-options .pile-button:nth-child(2)').click();
      const afterSecond={disabled:one('.draw-button').disabled,hint:one('.selection-message').textContent};
      if(${total}>54) one('.primary-pile-options .pile-button:nth-child(3)').click();
      const ready={drawEnabled:!one('.draw-button').disabled,
        canSelectParallel:all('.primary-pile-options .pile-button').some(b=>!b.disabled && b.getAttribute('aria-pressed')!=='true'),
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
    // #75: responsive 3/5 columns, no right dead space, slim column +/-,
    // fixed right-aligned header actions, narrow-screen horizontal scroll.
    for (const width of [1440, 390, 320]) {
      await navigate(width);
      const geom = await evalInPage(`(() => {
        const one=q=>document.querySelector(q), all=q=>[...document.querySelectorAll(q)];
        const snapshot=()=>{
          const scroll=one('.primary-matrix'), table=scroll.querySelector('table');
          const cells=all('.primary-matrix .column-header').map(node=>node.getBoundingClientRect().width);
          const heading=one('.matrix-heading'), actions=one('.heading-right-controls');
          return {
            columns: cells.length, widths: cells.map(Math.round),
            equal:Math.max(...cells)-Math.min(...cells)<1.6,
            overflow:scroll.scrollWidth>scroll.clientWidth+1,
            trailingBlank:Math.abs(table.getBoundingClientRect().width-scroll.clientWidth),
            headerHeight:one('.primary-matrix .column-header').getBoundingClientRect().height,
            columnPlusWidth:one('.axis-add-header').getBoundingClientRect().width,
            columnStacked:getComputedStyle(one('.axis-add-actions-column')).flexDirection==='column',
            rightGap:heading.getBoundingClientRect().right-actions.getBoundingClientRect().right,
            hiddenCopyInvisible:getComputedStyle(one('.copy-button')).display==='none'
          };
        };
        const three=snapshot();
        one('.axis-add-header .axis-add-button').click();
        one('.axis-add-header .axis-add-button').click();
        const five=snapshot();
        return {three,five};
      })()`);
      for (const [columns, measured] of [[3,geom.three],[5,geom.five]]) {
        assert.equal(measured.columns,columns);
        assert.equal(measured.equal,true,`Equal data cells ${columns} at ${width}`);
        assert.equal(measured.headerHeight<=40,true,`No thick column heading ${width}`);
        assert.ok(measured.columnPlusWidth<=34,`Column +/− strip should be half width at ${width}`);
        assert.equal(measured.columnStacked,true);
        assert.ok(measured.rightGap>=0&&measured.rightGap<10,`Right controls need true alignment at ${width}`);
        assert.equal(measured.hiddenCopyInvisible,true,`No phantom right-side button slot at ${width}`);
        if (width===1440) {
          assert.equal(measured.overflow,false,`Spare space should be distributed across ${columns} columns`);
          assert.ok(measured.trailingBlank<=3,`No right dead space for ${columns} columns`);
          assert.ok(measured.widths.every(w=>w>96),`Desktop cells expand evenly`);
        } else if (columns===5) {
          assert.equal(measured.overflow,true,`Five columns scroll at ${width}`);
          assert.ok(measured.widths.every(w=>w>=95),`Minimum 96px data widths under overflow`);
        }
      }
      report('UX75-FLUID-'+width,{status:'PASS',...geom});
    }
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
      const columnControlsStacked=getComputedStyle(one('.axis-add-actions-column')).flexDirection==='column';
      const rowControlsSideBySide=getComputedStyle(one('.axis-add-row-header .axis-add-actions')).flexDirection==='row';
      const historyOutsideHeading=one('.axis-history-actions').previousElementSibling.classList.contains('matrix-stage');
      const rowLabel=one('.row-header .axis-inline-label');
      rowLabel.click();
      const rowInput=one('.row-header .axis-inline-input');
      rowInput.value='行12';
      rowInput.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
      const verticalDigits=one('.row-header .axis-inline-label').textContent;
      one('.row-header .axis-inline-label').click();
      const editableRawDigits=one('.row-header .axis-inline-input').value;
      one('.row-header .axis-inline-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      one('.shuffle-button').click();
      for(let i=0;i<100 && all('.primary-pile-options .pile-button').length!==3;i++)await sleep(20);
      const piles=()=>all('.primary-pile-options .pile-button');
      const alternatives=()=>all('.primary-pile-options .pile-button'); // compact <=26 selection
      piles()[0].click();
      const primarySelected=piles()[0].getAttribute('aria-pressed')==='true';
      piles()[0].click();
      const cleared=piles().every(b=>b.getAttribute('aria-pressed')==='false');
      piles()[1].click();alternatives()[0].click();
      const roles={main:piles()[1].getAttribute('aria-pressed'),parallel:alternatives()[0].getAttribute('aria-pressed')};
      const drawReady=!one('.draw-button').disabled;
      // Regression: #70 previously returned early for a fully selected reading.
      alternatives()[0].click();
      const parallelClearedAfterDone=alternatives()[0].getAttribute('aria-pressed')==='false';
      piles()[1].click();
      const mainClearedAfterDone=piles().every(p=>p.getAttribute('aria-pressed')==='false');
      piles()[1].click();alternatives()[0].click();
      const drawEnabledAfterReselect=!one('.draw-button').disabled;
      const right=()=>one('.heading-right-controls').getBoundingClientRect().right;
      const initialRight=right();
      __p0.deferDraw=false;
      one('.draw-button').click();
      for(let i=0;i<100 && one('.reading-status').textContent!=='抽選完了';i++)await sleep(20);
      const completeRight=right();
      one('.copy-button').click();
      for(let i=0;i<30 && !one('.copy-feedback').textContent;i++)await sleep(20);
      const afterCopyRight=right();
      const statusRight=one('.reading-status').getBoundingClientRect().right;
      const feedbackRight=one('.copy-feedback').getBoundingClientRect().right;
      const controlsLeft=one('.heading-right-controls').getBoundingClientRect().left;
      const stableControls=Math.abs(initialRight-completeRight)<1 && Math.abs(initialRight-afterCopyRight)<1;
      const parallelDigits=one('.parallel-matrix .row-header .axis-inline-label')?.textContent ?? '';
      const copiedRawDigits=__p0.copiedText?.includes('行12') ?? false;
      const apiDrawsBeforeLabels=__p0.drawCalls.length;
      const editParallel=(selector,name)=>{
        const button=one(selector), host=button.parentElement;
        button.click();
        const input=host.querySelector('.axis-inline-input');
        if(!input)throw Error('Parallel direct edit did not open for '+selector);
        input.value=name;
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
      };
      editParallel('.parallel-matrix .row-header .axis-inline-label','並列行12');
      editParallel('.parallel-matrix .column-header .axis-inline-label','並列列名');
      const syncedLabels={
        primaryRow:one('.primary-matrix .row-header .axis-inline-label').textContent,
        parallelRow:one('.parallel-matrix .row-header .axis-inline-label').textContent,
        primaryColumn:one('.primary-matrix .column-header .axis-inline-label').textContent,
        parallelColumn:one('.parallel-matrix .column-header .axis-inline-label').textContent,
        drawCallsUnchanged:__p0.drawCalls.length===apiDrawsBeforeLabels
      };
      one('.copy-button').click();
      for(let i=0;i<20&&!__p0.copiedText?.includes('並列列名');i++)await sleep(10);
      syncedLabels.copyUpdated=__p0.copiedText?.includes('並列列名') && __p0.copiedText?.includes('並列行12');
      return {inlineQ,divider,footer,initialCount,afterAdd,afterBlankDelete,
        afterRefusedDelete,afterConfirmedDelete,confirmations,preview,reordered,ghostRemoved,
        primarySelected,cleared,roles,drawReady,parallelClearedAfterDone,
        mainClearedAfterDone,drawEnabledAfterReselect,stableControls,
        columnControlsStacked,rowControlsSideBySide,historyOutsideHeading,
        verticalDigits,editableRawDigits,parallelDigits,copiedRawDigits,syncedLabels,
        statusBeforeControls:statusRight<=controlsLeft+1,
        feedbackBeforeControls:feedbackRight<=controlsLeft+1};
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
    assert.equal(ux70.parallelClearedAfterDone,true,'Selected Parallel must untoggle at ready/done');
    assert.equal(ux70.mainClearedAfterDone,true,'Selected Main must untoggle at ready/done');
    assert.equal(ux70.drawEnabledAfterReselect,true);
    assert.equal(ux70.columnControlsStacked,true);
    assert.equal(ux70.rowControlsSideBySide,true);
    assert.equal(ux70.historyOutsideHeading,true);
    assert.equal(ux70.verticalDigits,'行１２');
    assert.equal(ux70.editableRawDigits,'行12');
    assert.equal(ux70.parallelDigits,'行１２');
    assert.equal(ux70.copiedRawDigits,true);
    assert.deepEqual(ux70.syncedLabels,{
      primaryRow:'並列行１２',parallelRow:'並列行１２',
      primaryColumn:'並列列名',parallelColumn:'並列列名',
      drawCallsUnchanged:true,copyUpdated:true
    });
    assert.equal(ux70.stableControls,true,'Fixed right controls must not move on status/copy feedback');
    assert.equal(ux70.statusBeforeControls,true);
    assert.equal(ux70.feedbackBeforeControls,true);
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
      for(let i=0;i<100 && all('.primary-pile-options .pile-button').length!==3;i++)await sleep(20);
      all('.primary-pile-options .pile-button')[0].click(); all('.primary-pile-options .pile-button')[1].click(); // <=26 shared selection
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
      for(let i=0;i<100 && document.querySelectorAll('.primary-pile-options .pile-button').length!==3;i++)await sleep(20);
      one('.primary-pile-options .pile-button:nth-child(1)').click();
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
      for(let i=0;i<100 && all('.primary-pile-options .pile-button').length!==3;i++)await sleep(20);
      all('.primary-pile-options .pile-button')[0].click(); all('.primary-pile-options .pile-button')[1].click(); // <=26 shared selection
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
      for(let i=0;i<100 && document.querySelectorAll('.primary-pile-options .pile-button').length!==3;i++)await sleep(20);
      one('.primary-pile-options .pile-button:nth-child(1)').click();
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
      one('#settingsButton').click();
      one('#includeTitleCard').click();
      const rejected78At80 = one('#includeTitleCard').checked === true &&
        one('.reading-deck-summary').textContent === 'デッキB・80枚' &&
        one('#settingsScope').textContent.includes('先に配置を減らしてください');
      one('#settingsDone').click();
      one('.shuffle-button').click();
      for (let i=0;i<120 && all('.primary-pile-options .pile-button').length!==3;i++)await sleep(20);
      const a=all('.primary-pile-options .pile-button');
      a[0].click();
      const cueA=one('.selection-message').textContent;
      const drawingAfterA=one('.draw-button').disabled;
      a[1].click();
      const cueB=one('.selection-message').textContent;
      const drawingAfterB=one('.draw-button').disabled;
      a[2].click();
      const drawingAfterC=one('.draw-button').disabled;
      const parallelBlocked=all('.parallel-pile-options .pile-button').every(button => button.disabled);
      all('.primary-pile-options .pile-button')[2].click();
      const thirdCleared=all('.primary-pile-options .pile-button')[2].getAttribute('aria-pressed')==='false';
      const disabledAfterClear=one('.draw-button').disabled;
      all('.primary-pile-options .pile-button')[2].click();
      const restoredAfterRetap=!one('.draw-button').disabled;
      one('.draw-button').click();
      for(let i=0;i<160 && one('.reading-status').textContent!=='抽選完了';i++)await sleep(30);
      const cards=all('.primary-matrix .card-detail-trigger').length;
      const rows=all('.primary-matrix .reading-table tbody tr').length;
      const heading=one('.primary-pile-label').textContent;
      const ids=__p0.drawCalls.flatMap(call=>call.positions);
      const rowName=one('.primary-matrix .row-header');
      return {capLabel,eightyIsLimit,rejected78At80,cueA,cueB,drawingAfterA,drawingAfterB,
        drawingAfterC,parallelBlocked,thirdCleared,disabledAfterClear,restoredAfterRetap,cards,rows,heading,unique:new Set(ids).size,
        count:ids.length,piles:__p0.drawCalls.map(call=>call.pile),
        rowWidth:rowName.getBoundingClientRect().width,
        writingMode:getComputedStyle(rowName.querySelector('.axis-inline-label')).writingMode};
    })()`);
    assert.match(eighty.capLabel,/80枚/);
    assert.equal(eighty.eightyIsLimit,true);
    assert.equal(eighty.rejected78At80,true,'78-card toggle must explain why a prepared 80-card layout cannot fit');
    assert.match(eighty.cueA,/枚数確保の為次の山を選択/);
    assert.match(eighty.cueB,/枚数確保の為次の山を選択/);
    assert.equal(eighty.drawingAfterA,true);
    assert.equal(eighty.drawingAfterB,true);
    assert.equal(eighty.drawingAfterC,false);
    assert.equal(eighty.parallelBlocked,false,'Separate Parallel selector allows all three piles, even when Primary consumes all three');
    assert.equal(eighty.thirdCleared,true);
    assert.equal(eighty.disabledAfterClear,true);
    assert.equal(eighty.restoredAfterRetap,true);
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
