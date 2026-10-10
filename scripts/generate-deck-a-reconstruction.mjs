#!/usr/bin/env node
/**
 * Independent 1909-era print inspired Deck A card faces, Issue #83.
 * Zero copyrighted modern-card scan data: new typography, ouroboros, prose.
 * One historical portrait is fetched for BUILD ONLY from Wikimedia Commons,
 * then embedded as a data URI. Static runtime assets are entirely self-hosted.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const CARD_DIR = resolve(fileURLToPath(new URL('../web/assets/cards/', import.meta.url)));
const W = 1024, H = 1755;
const ARCHIVE_PHOTO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Pamela_Colman_Smith_The_Craftsman_cropped.jpg/500px-Pamela_Colman_Smith_The_Craftsman_cropped.jpg';
const PHOTO_SHA256 = ''; // Fill after first verified build; fail on drift in subsequent builds.
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const base = (id, content) => '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1755" width="1024" height="1755" role="img" aria-labelledby="' + id + 'title ' + id + 'desc">'+content+'</svg>';

function grainDefs() {
  return '<defs><clipPath id="cardClip"><rect x="51" y="35" width="922" height="1683" rx="58"/></clipPath>'+
    '<filter id="paperGrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".63" numOctaves="3" seed="42" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".055"/></feComponentTransfer></filter>'+
    '<radialGradient id="purple"><stop offset="0" stop-color="#292268"/><stop offset="1" stop-color="#1d174e"/></radialGradient></defs>';
}
function cardBorder() {
  return '<rect x="51" y="35" width="922" height="1683" rx="58" fill="#efece3" stroke="#bab6a9" stroke-width="2.1"/>'+
    '<rect x="101" y="91" width="822" height="1567" rx="43" fill="url(#purple)" stroke="#1d174e" stroke-width="2"/>';
}
function titleText(text, y, size) {
  return '<text x="512" y="'+y+'" text-anchor="middle" font-family="Georgia, Times New Roman, serif" font-weight="bold" font-variant="small-caps" letter-spacing="-1.1" font-size="'+size+'" fill="#f6e8b8">'+esc(text)+'</text>';
}
function ouroboros() {
  const x=510,y=910,rx=196,ry=200;
  const g=[];
  g.push('<g fill="none" stroke="#f1dfa5" stroke-linecap="round" stroke-linejoin="round">');
  g.push('<ellipse cx="'+x+'" cy="'+y+'" rx="'+rx+'" ry="'+ry+'" stroke-width="52"/>');
  g.push('<ellipse cx="'+x+'" cy="'+y+'" rx="174" ry="178" stroke="#211a55" stroke-width="1.7"/>');
  g.push('<ellipse cx="'+x+'" cy="'+y+'" rx="181" ry="185" stroke="#332663" stroke-width="3.5"/>');
  g.push('<ellipse cx="'+x+'" cy="'+y+'" rx="207" ry="211" stroke-width="1.5"/>');
  g.push('<ellipse cx="'+x+'" cy="'+y+'" rx="216" ry="220" stroke-width="1.2" opacity=".6"/>');
  g.push('</g>');
  // Small hatches engraved radially inside the independently illustrated ring.
  const hatch=[];
  for (let a=0;a<360;a+=4.1) {
    if (a>249 && a<301) continue;
    const q=a*Math.PI/180;const r1=181+(Math.sin(a*2.1)*2);const r2=202+(Math.sin(a*1.3)*1.5);
    hatch.push('M'+(x+Math.cos(q)*r1).toFixed(1)+' '+(y+Math.sin(q)*r1*1.017).toFixed(1)+
      'L'+(x+Math.cos(q+.018)*r2).toFixed(1)+' '+(y+Math.sin(q+.018)*r2*1.017).toFixed(1));
  }
  g.push('<path d="'+hatch.join(' ')+'" stroke="#3d2d70" fill="none" stroke-width=".9" opacity=".63"/>');
  const dots=[];
  for(let i=0;i<225;i++){
    const angle=(i*137.508)%360*Math.PI/180;
    const r=184+(i*37%20);
    const dx=x+Math.cos(angle)*r,dy=y+Math.sin(angle)*r*1.018;
    if(dy<746 && dx>420&&dx<650)continue;
    dots.push('<circle cx="'+dx.toFixed(1)+'" cy="'+dy.toFixed(1)+'" r="'+(i%5===0?1.7:.75)+'" fill="#352662" opacity=".82"/>');
  }
  g.push(dots.join(''));
  // Serpent's independently drawn head, eye, neck and narrow forked tongue.
  g.push('<path d="M431 725 C459 702 509 694 549 710 C576 722 587 738 618 741 C638 742 648 728 652 715 C656 735 645 752 628 758 C600 766 577 748 550 748 C500 742 467 742 431 757Z" fill="#f2e0aa" stroke="#34235c" stroke-width="2.6"/>');
  g.push('<path d="M559 719 C576 724 578 734 594 735 M478 718 C496 709 511 710 522 715" stroke="#4a3673" stroke-width="1.9" fill="none"/>');
  g.push('<path d="M625 737 Q649 729 678 697 M649 728 L674 703 M649 728 L680 714" stroke="#f5e7b5" stroke-width="3.2" fill="none"/>');
  g.push('<ellipse cx="554" cy="725" rx="10" ry="9" fill="#453168"/><circle cx="558" cy="722" r="3.2" fill="#f5e6b2"/>');
  for(let i=0;i<65;i++){
    const px=449+(i*37%157),py=718+(i*19%30);
    if(px>573&&py>740)continue;
    g.push('<circle cx="'+px+'" cy="'+py+'" r="'+(i%3?1:1.5)+'" fill="#5b477b" opacity=".62"/>');
  }
  return '<g>'+g.join('')+'</g>';
}
function titleCard() {
  return base('title',grainDefs()+
    '<title id="titletitle">The Original Rider Waite Tarot Deck — reconstructed title card</title>'+
    '<desc id="titledesc">Vintage indigo and cream title, engraved ouroboros, Arthur E. Waite and Pamela Colman Smith historical credits. New independent design.</desc>'+
    cardBorder()+
    '<g clip-path="url(#cardClip)"><rect x="51" y="35" width="922" height="1683" filter="url(#paperGrain)" opacity=".47"/></g>'+
    titleText('THE ORIGINAL',252,94)+titleText('RIDER WAITE',379,103)+titleText('TAROT DECK',508,110)+
    ouroboros()+
    '<g fill="#f3e3b2" font-family="Georgia, Times New Roman, serif" text-anchor="middle" font-weight="bold">'+
    '<text x="512" y="1326" font-size="50">Conceived by</text>'+
    '<text x="512" y="1394" font-size="51" font-variant="small-caps">A. E. Waite</text>'+
    '<text x="512" y="1521" font-size="49">Cards designed by</text>'+
    '<text x="512" y="1592" font-size="43" font-variant="small-caps">Pamela Colman Smith</text></g>'+
    '<path d="M314 1650H710" stroke="#f4e5b5" stroke-width="1.2" opacity=".56"/>');
}
function textWidth(s,size) {
  let sum=0;
  for(const c of s){
    if(c===' ')sum+=.27;
    else if('mwMW@'.includes(c))sum+=.82;
    else if('ilI.,;:\'!'.includes(c))sum+=.3;
    else if(c===c.toUpperCase())sum+=.61;
    else sum+=.49;
  }
  return sum*size;
}
function linesOf(text,width,size) {
  const words=text.split(/\s+/);
  const lines=[],cur=[];
  for(const w of words){
    const next=cur.length?cur.join(' ')+' '+w:w;
    if(cur.length && textWidth(next,size)>width){lines.push(cur.join(' '));cur.length=0;}
    cur.push(w);
  }
  if(cur.length)lines.push(cur.join(' '));
  return lines;
}
function typeset(text,x,y,width,size=30,leading=39) {
  return linesOf(text,width,size).map((line,i)=>{
    return '<text x="'+x+'" y="'+(y+i*leading)+'" xml:space="preserve" font-family="Arial, Helvetica, sans-serif" font-size="'+size+'" letter-spacing=".05" fill="#20201f">'+esc(line)+'</text>';
  }).join('');
}
function bioCard(photoData) {
  const pd='data:image/jpeg;base64,'+photoData;
  const top1='Pamela Colman Smith was an illustrator, author, and theatre designer whose artistry transformed the modern tarot. Born in London in 1878 to American parents, she spent her early years moving between England, New York, and Jamaica.';
  const top2='She studied at the Pratt Institute in Brooklyn. Returning to England, she became part of a creative world of actors, writers, illustrators and makers, drawing upon performance, folklore and music.';
  const right1='Smith worked with the theatre, creating costumes and stage imagery while also illustrating books, stories, and printed ephemera. Her pictures are known for expressive gestures and strongly patterned forms.';
  const right2='In the early twentieth century she encountered the Hermetic Order of the Golden Dawn. There she met Arthur Edward Waite, who commissioned her to illustrate a new tarot deck.';
  const right3='In 1909 she completed seventy-eight vivid card designs. Each scene gave its symbols a human setting, helping readers discover stories in the everyday details of the pictures.';
  const bottom1='Her interests extended far beyond tarot. Smith ran a small press, illustrated folklore and literature, and contributed graphic work to the women\'s suffrage movement.';
  const bottom2='For many years the deck was widely known chiefly by the names of its publishers and organiser. Her authorship is now increasingly recognised: the pictures remain among the most familiar images in the history of tarot.';
  const sz=29;
  const top1Y=223,top2Y=375;
  const right1Y=533,right2Y=776,right3Y=1016;
  const lower1Y=1280,lower2Y=1431;
  return base('bio',grainDefs()+
    '<title id="biotitle">Pamela Colman Smith — artist biography</title>'+
    '<desc id="biodesc">Original biographical text, period newspaper-inspired typography, and public-domain portrait first published in The Craftsman, October 1912.</desc>'+
    '<rect x="51" y="35" width="922" height="1683" rx="58" fill="#f2f0e8" stroke="#c7c3b9" stroke-width="2"/>'+
    '<g clip-path="url(#cardClip)"><rect x="51" y="35" width="922" height="1683" filter="url(#paperGrain)" opacity=".3"/></g>'+
    '<text x="512" y="148" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="800" letter-spacing=".2" fill="#141414">PAMELA COLMAN SMITH</text>'+
    typeset(top1,120,top1Y,785,sz,40)+typeset(top2,120,top2Y,785,sz,40)+
    '<defs><clipPath id="portraitCut"><rect x="122" y="496" width="398" height="663"/></clipPath></defs>'+
    '<rect x="122" y="496" width="398" height="663" fill="#a3a09b"/>'+
    '<g clip-path="url(#portraitCut)"><image x="122" y="496" width="398" height="663" preserveAspectRatio="xMidYMid slice" href="'+pd+'"/></g>'+
    '<rect x="122" y="496" width="398" height="663" fill="none" stroke="#aaa69d" stroke-width="1"/>'+
    typeset(right1,549,right1Y,361,28,38)+typeset(right2,549,right2Y,361,28,38)+
    typeset(right3,549,right3Y,361,28,38)+
    typeset(bottom1,120,lower1Y,786,29,39)+
    typeset(bottom2,120,lower2Y,786,29,39)+
    '<path d="M125 1663H900" stroke="#8d897f" stroke-width=".75"/>'+
    '<text x="512" y="1687" text-anchor="middle" font-family="Georgia, Times New Roman, serif" font-size="20" font-style="italic" fill="#45433d">Portrait: The Craftsman, October 1912 · Historical sources: Whitney, Morgan &amp; British Museum</text>');
}
async function archivalPhoto() {
  const response=await fetch(ARCHIVE_PHOTO,{headers:{'User-Agent':'TarotDrawArtworkBuild/1.0 (PD archival illustration recreation)'}});
  if(!response.ok) throw new Error('Commons 1912 photo unavailable: HTTP '+response.status);
  const data=Buffer.from(await response.arrayBuffer());
  if (data.length<12000 || data.length>2_500_000 || data[0]!==0xff || data[1]!==0xd8) throw new Error('Unexpected archival photo bytes');
  const sha=createHash('sha256').update(data).digest('hex');
  console.log('Commons public-domain portrait SHA256 '+sha+' bytes '+data.length);
  if(PHOTO_SHA256 && sha!==PHOTO_SHA256) throw new Error('Archival photo changed unexpectedly; copyright/source recheck needed');
  return data.toString('base64');
}
const photo=await archivalPhoto();
for(const [dir] of [['grid'],['detail']]){
  await mkdir(join(CARD_DIR,dir),{recursive:true});
  for(const [name,svg] of [
    ['deck-a-title.svg',titleCard()],
    ['deck-a-introduction.svg',bioCard(photo)]
  ]) {
    await writeFile(join(CARD_DIR,dir,name),svg,'utf8');
    console.log('Built '+dir+'/'+name+' '+Buffer.byteLength(svg)+' bytes');
  }
}
