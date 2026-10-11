#!/usr/bin/env node
/**
 * Independent 1909-era print inspired Deck A card faces, Issue #83.
 * Zero copyrighted modern-card scan data: new typography, public-domain ouroboros, prose.
 * One historical portrait is fetched for BUILD ONLY from Wikimedia Commons,
 * then embedded as a data URI. Static runtime assets are entirely self-hosted.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import opentype from 'opentype.js';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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
// Reconstructed letterpress typography: render actual font outlines ONCE at
// build. Never ask each browser (or libvips textLength/shaping) to reposition text.
const liberationMatch = spawnSync('fc-match',
  ['-f','%{family}|%{file}', 'Liberation Serif:style=Bold'], { encoding: 'utf8' });
if (liberationMatch.status !== 0 || !liberationMatch.stdout.startsWith('Liberation Serif|')) {
  throw Error('Build requires system Liberation Serif Bold (fonts-liberation) for fixed print glyphs');
}
const liberationFont = (() => {
  const file=liberationMatch.stdout.split('|').slice(1).join('|').trim();
  const buffer=readFileSync(file);
  return opentype.parse(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
})();

/** Exact independent ink rectangles measured from user-provided 1024x1536
 * scan *after normalizing to our 1024x1755 master canvas*. These are numerical
 * geometry observations only, NOT pixels taken from that reference image.
 * A large initial and smaller remaining caps mimic the user's letterpress.
 */
const TITLE_INK_BOXES = [
  [['T',230,166,289,250],['HE',290,183,391,250],
   ['O',424,166,490,250],['RIGINAL',491,183,793,250]],
  [['R',252,300,313,383],['IDER',314,318,491,382],
   ['W',524,300,599,383],['AITE',600,318,772,382]],
  [['T',263,435,328,520],['AROT',329,452,518,520],
   ['D',552,435,617,520],['ECK',618,452,764,520]]
];
function typePathInBox([letters,x1,y1,x2,y2]) {
  const path=liberationFont.getPath(letters,0,0,120,{kerning:true});
  const bb=path.getBoundingBox();
  if (!Number.isFinite(bb.x1)||bb.x2<=bb.x1||bb.y2<=bb.y1) throw Error('invalid font outline '+letters);
  const sx=(x2-x1)/(bb.x2-bb.x1),sy=(y2-y1)/(bb.y2-bb.y1);
  // Horizontal AND vertical stretch are calibrated separately for each segment.
  // Fixed glyph geometry forbids collisions/overflow from font substitutions.
  return '<path d="'+path.toPathData(2)+'" fill="#f6e8b8" transform="translate('+
    x1+' '+y1+') scale('+sx.toFixed(7)+' '+sy.toFixed(7)+') translate('+
    (-bb.x1).toFixed(3)+' '+(-bb.y1).toFixed(3)+')"/>';
}
function titleText() {
  return '<g aria-label="The Original Rider Waite Tarot Deck">'+
    TITLE_INK_BOXES.flatMap(row=>row.map(typePathInBox)).join('')+'</g>';
}
function ouroboros() {
  // Adapted directly from AnonMoos's PD "Ouroboros-simple.svg", originally
  // based on toa267's PD Fnord Hodge-Podge glyph. Source and license:
  // https://commons.wikimedia.org/wiki/File:Ouroboros-simple.svg
  // Fixed local vectors (not a third-party runtime dependency).
  // The prior independently drawn ellipse + head is intentionally GONE.
  const paths = [
    '<path d="m 604,24 c 231,47 396,246 396,476 0,276 -224,500 -500,500 C 224,1000 0,776 0,500 0,283 146,92 358,30 c 5,-1 7,-2 12,-2 18,0 33,-13 53,-13 10,0 35,3 45,3 30,0 74,-18 104,-18 13,0 28,10 32,24 z M 342,136 C 192,198 95,341 95,500 95,724 276,905 500,905 724,905 905,724 905,500 905,328 795,176 632,120 c 1,18 -22,29 -48,29 -14,0 -27,-5 -34,-5 -10,0 -28,11 -46,11 -20,0 -54,-8 -84,-13 -30,-5 -63,-12 -78,-6 z" fill="#f2e1ad"/>',
    '<path d="m 604,24 c 231,47 396,246 396,476 0,276 -224,500 -500,500 C 224,1000 0,776 0,500 0,283 146,92 358,30 c 5,-1 7,-2 12,-2 18,0 33,-13 53,-13 10,0 35,3 45,3 30,0 74,-18 104,-18 13,0 28,10 32,24 z M 357,43 C 152,104 12,290 12,500 12,770 230,988 500,988 770,988 988,770 988,500 988,269 818,72 585,32 c -36,-6 -86,16 -86,23 0,5 21,12 25,14 C 763,81 950,270 950,500 950,749 749,950 500,950 251,950 50,749 50,500 50,346 133,202 268,123 c 13,-6 37,-7 47,-7 10,0 46,2 56,7 10,5 49,10 69,15 20,5 47,9 62,9 25,0 48,-15 56,-14 v 2 c 0,3 9,5 27,5 20,0 41,-7 39,-23 l -24,-9 C 580,102 571,103 561,99 536,91 530,80 507,70 484,60 450,60 450,55 c 0,-3 15,-4 25,-5 25,-3 50,-23 80,-26 20,-2 25,-1 39,0 -1,-5 -9,-15 -22,-15 -32,0 -72,19 -99,19 -15,0 -26,-6 -41,-6 -22,0 -47,18 -67,30 -5,3 -10,6 -15,6 -5,0 -5,-1 -5,-2 0,-4 20,-10 20,-13 0,-2 -3,-1 -8,0 z M 572,92 C 772,127 917,299 917,500 917,730 730,917 500,917 270,917 83,730 83,500 83,337 183,189 337,125 313,122 285,124 272,130 139,208 58,348 58,500 58,744 256,942 500,942 744,942 942,744 942,500 942,280 767,97 539,78 c 5,2 13,12 33,14 z M 342,136 C 192,198 95,341 95,500 95,724 276,905 500,905 724,905 905,724 905,500 905,328 795,176 632,120 c 1,18 -22,29 -48,29 -14,0 -27,-5 -34,-5 -10,0 -28,11 -46,11 -20,0 -54,-8 -84,-13 -30,-5 -63,-12 -78,-6 z m 104,-16 c 0,-2 4,-3 14,-3 15,-1 18,-13 30,-13 21,0 30,9 37,9 l 10,-2 1,2 c -10,7 -25,17 -35,17 -5,0 -10,-1 -20,-4 -15,-4 -37,-4 -37,-6 z m 134,7 c 18,-3 17,-9 27,-9 3,0 5,2 5,5 0,3 -12,6 -31,7 z" fill="#32245b"/>',
    '<path d="m 472,119 15,3 c 0,-5 3,-10 5,-13 -9,0 -15,8 -20,10 z m 50,-2 -17,-7 c 1,5 1,10 0,15 8,-2 12,-5 17,-8 z" fill="#fff2c5"/>'
  ];
  // The native path plus Y reflection places the head at bottom. Rotate its
  // enclosing group 180 degrees so the head is at TOP as in the supplied
  // print, and match the reference ring center/extent (scan is not shipped).
  return '<g transform="translate(512 840) rotate(180) scale(.385) translate(-500 -500)">'+
    '<g transform="translate(0 1000) scale(1 -1)">'+paths.join('')+'</g></g>';
}
function titleCard() {
  return base('title',grainDefs()+
    '<title id="titletitle">The Original Rider Waite Tarot Deck — independently reconstructed title</title>'+
    '<desc id="titledesc">Deep-indigo vintage-style three-line cream serif title, public-domain AnonMoos ouroboros ring, historical Waite and Smith credits. Independently authored.</desc>'+
    cardBorder()+
    '<g clip-path="url(#cardClip)"><rect x="51" y="35" width="922" height="1683" filter="url(#paperGrain)" opacity=".28"/></g>'+
    titleText()+
        ouroboros()+
    '<g fill="#f8ebc2" font-family="Georgia, Times New Roman, serif" text-anchor="middle" font-weight="bold">'+
    '<text x="512" y="1169" font-size="55">Conceived by</text>'+
    '<text x="512" y="1240" font-size="56" font-variant="small-caps">A. E. Waite</text>'+
    '<text x="512" y="1396" font-size="54">Cards designed by</text>'+
    '<text x="512" y="1464" font-size="48" font-variant="small-caps">Pamela Colman Smith</text></g>');
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
  return sum*size*1.04;
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
  // Natural browser-shaped words remain legible. Prior forced tspan offsets
  // could fuse neighbouring words; glyph-space stretching distorted letters.
  return lines.map((line,i)=>
    '<text x="'+x+'" y="'+(y+i*leading)+'" xml:space="preserve" font-family="Arial, Helvetica, sans-serif" font-size="'+size+'" fill="#0b0b0b">'+esc(line)+'</text>'
  ).join('');
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
    // Keep SVG as the editable master, but the app consumes font-resolved
    // raster WebP. Browser/device font substitution cannot shift this title.
    await writeFile(join(CARD_DIR,dir,name),svg,'utf8');
    const size = dir === 'detail' ? { width: 512, height: 878 } : { width: 256, height: 439 };
    const image = await sharp(Buffer.from(svg)).resize(size.width,size.height,{fit:'fill'})
      .webp({ quality: 92, effort: 5 }).toBuffer();
    const rasterName = name.replace('.svg','.webp');
    await writeFile(join(CARD_DIR,dir,rasterName),image);
    console.log('Built '+dir+'/'+name+' master, raster '+rasterName+' '+image.byteLength+' bytes');
  }
}
