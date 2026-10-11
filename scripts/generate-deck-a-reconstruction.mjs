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
const ARCHIVE_PHOTO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Pamela_Colman_Smith_The_Craftsman_cropped.jpg/250px-Pamela_Colman_Smith_The_Craftsman_cropped.jpg';
const PHOTO_SHA256 = 'dfb4efb05f8ed5489e28b0999a7e440adad2e058e38d3477c7dc6365c08ec70b'; // Pinned Commons 250px archival photo, CI 38064594635
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
function titleText(text, y, size, targetWidth) {
  // Preserve tall period capitals but follow the reference's narrower line measure.
  return '<text x="512" y="'+y+'" text-anchor="middle" font-family="Georgia, Times New Roman, serif" font-weight="bold" font-variant="small-caps" letter-spacing="-1.1" font-size="'+size+'" textLength="'+targetWidth+'" lengthAdjust="spacingAndGlyphs" fill="#f6e8b8">'+esc(text)+'</text>';
}
function ouroboros() {
  // Original restrained single-headed engraved serpent. The old monster-like
  // tongue, excessive eye and ragged extra rings are deliberately removed.
  // PD comparison reference: Wikimedia Commons Ouroboros-simple.svg (AnonMoos).
  const cx=512,cy=872,rx=189,ry=194;
  const p=[];
  p.push('<g fill="none" stroke-linecap="round" stroke-linejoin="round">');
  p.push('<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+rx+'" ry="'+ry+'" stroke="#f3e5af" stroke-width="39"/>');
  p.push('<ellipse cx="'+cx+'" cy="'+cy+'" rx="170" ry="175" stroke="#483672" stroke-width="2.5" opacity=".85"/>');
  p.push('<ellipse cx="'+cx+'" cy="'+cy+'" rx="209" ry="214" stroke="#f3e5af" stroke-width="1.7"/>');
  p.push('<ellipse cx="'+cx+'" cy="'+cy+'" rx="184" ry="189" stroke="#322260" stroke-width="1.4"/>');
  // Fine irregular ink engravings cross the body without changing the silhouette.
  const hatch=[];
  for(let a=0;a<360;a+=6.8){
    if(a>242&&a<313)continue;
    const t=a*Math.PI/180;
    const inner=175+(Math.sin(a*1.7)*1.4),outer=202+(Math.sin(a*2.1)*.9);
    hatch.push('M'+(cx+Math.cos(t)*inner).toFixed(1)+' '+(cy+Math.sin(t)*inner*1.026).toFixed(1)+
      'L'+(cx+Math.cos(t+.015)*outer).toFixed(1)+' '+(cy+Math.sin(t+.015)*outer*1.026).toFixed(1));
  }
  p.push('<path d="'+hatch.join(' ')+'" stroke="#413267" stroke-width=".85" opacity=".67"/>');
  p.push('</g>');
  // Classical horizontal head at the top, mouth touching its own fine tail.
  p.push('<path d="M457 690 Q486 666 525 665 Q546 665 565 674 Q585 673 602 680 L611 690 Q600 699 584 701 Q558 699 542 691 Q500 686 468 709 Z" fill="#f3e5af" stroke="#3e2d66" stroke-width="2.5"/>');
  p.push('<path d="M571 678 Q582 674 594 681 M584 701 Q598 698 611 690" stroke="#3e2d66" stroke-width="1.3" fill="none"/>');
  p.push('<circle cx="568" cy="681" r="3.3" fill="#39285f"/>');
  p.push('<path d="M610 691 Q623 685 634 682" stroke="#f3e5af" stroke-width="3.8" fill="none"/>');
  const dots=[];
  for(let i=0;i<150;i++){
    const t=((i*137.508)%360)*Math.PI/180;
    const rr=176+(i*31%23);
    const px=cx+Math.cos(t)*rr,py=cy+Math.sin(t)*rr*1.027;
    if(py<713&&px>440&&px<637)continue;
    dots.push('<circle cx="'+px.toFixed(1)+'" cy="'+py.toFixed(1)+'" r="'+(i%4===0?1.3:.67)+'" fill="#45346b" opacity=".7"/>');
  }
  return '<g>'+p.join('')+dots.join('')+'</g>';
}
function titleCard() {
  return base('title',grainDefs()+
    '<title id="titletitle">The Original Rider Waite Tarot Deck — independently reconstructed title</title>'+
    '<desc id="titledesc">Deep-indigo vintage-style three-line cream serif title, single-head ouroboros ring, historical Waite and Smith credits. Independently authored.</desc>'+
    cardBorder()+
    '<g clip-path="url(#cardClip)"><rect x="51" y="35" width="922" height="1683" filter="url(#paperGrain)" opacity=".28"/></g>'+
    titleText('THE ORIGINAL',245,104,587)+titleText('RIDER WAITE',378,114,566)+titleText('TAROT DECK',513,114,557)+
    ouroboros()+
    '<g fill="#f8ebc2" font-family="Georgia, Times New Roman, serif" text-anchor="middle" font-weight="bold">'+
    '<text x="512" y="1248" font-size="55">Conceived by</text>'+
    '<text x="512" y="1319" font-size="56" font-variant="small-caps">A. E. Waite</text>'+
    '<text x="512" y="1460" font-size="54">Cards designed by</text>'+
    '<text x="512" y="1528" font-size="48" font-variant="small-caps">Pamela Colman Smith</text></g>');
}
function textWidth(s,size) {
  let sum=0;
  for(const c of s){
    if(c===' ')sum+=.28;
    else if('mwMW@'.includes(c))sum+=.82;
    else if('ilI.,;:\'!'.includes(c))sum+=.31;
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
function typeset(text,x,y,width,size=26,leading=30) {
  const lines=linesOf(text,width,size);
  return lines.map((line,i)=>{
    const words=line.split(' ');
    const baseline=y+i*leading;
    // Justification adjusts WORD spacing only. SVG textLength would spread
    // the spacing between every glyph, producing unnatural stretched letters.
    if(i<lines.length-1 && words.length>1) {
      const lengths=words.map(w=>textWidth(w,size));
      const gap=Math.max(4,(width-lengths.reduce((a,b)=>a+b,0))/(words.length-1));
      let left=x;
      const spans=words.map((word,j)=>{
        const span='<tspan x="'+left.toFixed(1)+'" y="'+baseline+'">'+esc(word)+'</tspan>';
        left+=lengths[j]+gap;
        return span;
      }).join('');
      return '<text font-family="Arial, Helvetica, sans-serif" font-size="'+size+'" fill="#0b0b0b">'+spans+'</text>';
    }
    return '<text x="'+x+'" y="'+baseline+'" xml:space="preserve" font-family="Arial, Helvetica, sans-serif" font-size="'+size+'" fill="#0b0b0b">'+esc(line)+'</text>';
  }).join('');
}
function bioCard(photoData) {
  const pd='data:image/jpeg;base64,'+photoData;
  // Independent historical composition: matches the reference's ~310-word
  // density and factual coverage, not Kaplan's sentence syntax or sequence.
  const top1="Pamela Colman Smith was born in Middlesex, England, on 16 February 1878, into an American family. Her childhood moved among London, New York and Kingston, Jamaica, giving her a transatlantic upbringing that later informed her varied visual work.";
  const top2="During her adolescence, the touring theatrical circle of Ellen Terry and Henry Irving exposed her to stagecraft and performance. Smith then trained at the Pratt Institute in Brooklyn, completing her formal studies in 1897 and returning to an active artistic life in England.";
  const right1="Smith designed miniature theatres and theatrical settings while also providing illustrations for books, magazines and posters. Her bold outlines, lively figures and dramatic compositions brought a performer's eye to printed pictures and stories.";
  const right2="By about 1903 she had joined the Hermetic Order of the Golden Dawn, an organisation concerned with ceremonial magic and symbolism. She also described images arising in response to music, which she translated into vivid artwork.";
  const right3="Her association with Arthur Edward Waite led to the 1909 tarot commission. She created pictures for all seventy-eight cards, including narrative scenes on the numbered suit cards, rather than relying only on conventional symbols. The pack was published that year by William Rider.";
  const bottom1="Beyond the tarot, Smith worked with publishers, illustrated legends and literature, edited and produced a small magazine, and exhibited her pictures. Despite exhibitions and encouraging notices, sales remained uncertain, and sustained financial security did not follow her artistic achievements.";
  const bottom2="She never married and later lived in Cornwall, where she died on 18 September 1951. Many of her illustrations, paintings and stage designs are now scattered or lost; much of her wider career was overlooked for decades after her death.";
  const bottom3="Today the widely circulated tarot illustrations are increasingly recognised as Smith's work rather than solely the product of the publisher and Waite. Their distinctive fusion of ordinary human gestures, storytelling and esoteric symbols has influenced generations of tarot readers and artists.";
  const prose=[top1,top2,right1,right2,right3,bottom1,bottom2,bottom3];
  const words=prose.join(' ').split(/\s+/).length;
  if(words<290||words>345)throw Error('Biography density drift from the reference: '+words);
  const topSize=26,topLead=28,rightSize=25,rightLead=26,bottomSize=25,bottomLead=27;
  const top1Y=179;
  const top2Y=top1Y+linesOf(top1,784,topSize).length*topLead+12;
  const portraitY=top2Y+linesOf(top2,784,topSize).length*topLead+14;
  const r1Y=portraitY+19;
  const r2Y=r1Y+linesOf(right1,357,rightSize).length*rightLead+10;
  const r3Y=r2Y+linesOf(right2,357,rightSize).length*rightLead+10;
  const rightEnd=r3Y+linesOf(right3,357,rightSize).length*rightLead;
  const portraitBottom=1150;
  const lower1Y=Math.max(portraitBottom+33,rightEnd+8);
  const lower2Y=lower1Y+linesOf(bottom1,788,bottomSize).length*bottomLead+9;
  const lower3Y=lower2Y+linesOf(bottom2,788,bottomSize).length*bottomLead+9;
  const lastY=lower3Y+(linesOf(bottom3,788,bottomSize).length-1)*bottomLead;
  if(portraitY>590||lastY>1646)throw Error('Biography typesetting overflows: photoY='+portraitY+' last='+lastY);
  return base('bio',grainDefs()+
    '<title id="biotitle">Pamela Colman Smith — illustrated biography</title>'+
    '<desc id="biodesc">Original independently written biographical text with archival 1912 portrait; black print on pale ivory.</desc>'+
    '<rect x="51" y="35" width="922" height="1683" rx="58" fill="#fbfaf6" stroke="#a7a49d" stroke-width="2"/>'+
    '<g clip-path="url(#cardClip)"><rect x="51" y="35" width="922" height="1683" filter="url(#paperGrain)" opacity=".09"/></g>'+
    '<text x="512" y="142" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="900" letter-spacing="-.65" fill="#080808">PAMELA COLMAN SMITH</text>'+
    typeset(top1,121,top1Y,784,topSize,topLead)+typeset(top2,121,top2Y,784,topSize,topLead)+
    '<defs><clipPath id="portraitCut"><rect x="122" y="'+portraitY+'" width="391" height="'+(portraitBottom-portraitY)+'"/></clipPath><filter id="archiveBW" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="1.38" intercept="-.14"/><feFuncG type="linear" slope="1.38" intercept="-.14"/><feFuncB type="linear" slope="1.38" intercept="-.14"/></feComponentTransfer></filter></defs>'+
    '<rect x="122" y="'+portraitY+'" width="391" height="'+(portraitBottom-portraitY)+'" fill="#767676"/>'+
    '<g clip-path="url(#portraitCut)"><image x="122" y="'+portraitY+'" width="391" height="'+(portraitBottom-portraitY)+'" preserveAspectRatio="xMidYMid slice" filter="url(#archiveBW)" href="'+pd+'"/></g>'+
    '<rect x="122" y="'+portraitY+'" width="391" height="'+(portraitBottom-portraitY)+'" fill="none" stroke="#555" stroke-width="1"/>'+
    typeset(right1,549,r1Y,357,rightSize,rightLead)+typeset(right2,549,r2Y,357,rightSize,rightLead)+
    typeset(right3,549,r3Y,357,rightSize,rightLead)+
    typeset(bottom1,120,lower1Y,788,bottomSize,bottomLead)+
    typeset(bottom2,120,lower2Y,788,bottomSize,bottomLead)+
    typeset(bottom3,120,lower3Y,788,bottomSize,bottomLead)+
    '<text x="512" y="1685" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" fill="#323232">Independent biography · Archival portrait: The Craftsman, October 1912</text>');
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
