#!/usr/bin/env node
/**
 * Fail-closed release verification for two *new* self-hosted period-print SVGs.
 * Former 1993 printed-scan WebP assets are deliberately neither embedded nor deployed.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=resolve(fileURLToPath(new URL('../web/assets/cards/',import.meta.url)));
const entries=[
  { name:'deck-a-title.svg',limit:80*1024, portrait:false },
  { name:'deck-a-introduction.svg',limit:225*1024, portrait:true }
];
let failed=0;
for(const dir of ['grid','detail']) {
  for(const entry of entries){
    const name=dir+'/'+entry.name;
    try{
      const bytes=await readFile(resolve(root,name));
      const svg=bytes.toString('utf8');
      if(bytes.length<1800 || bytes.length>entry.limit)throw Error('invalid size '+bytes.length);
      if(!svg.startsWith('<svg ') || !svg.includes('viewBox="0 0 1024 1755"') ||
         !svg.includes('width="1024" height="1755"') || !svg.endsWith('</svg>')){
        throw Error('invalid SVG size or root');
      }
      if(!svg.includes('rx="58"') || !svg.includes('paperGrain') ||
         !svg.includes('role="img"') || !svg.includes('aria-labelledby='))throw Error('missing vintage frame/accessible image title');
      if(/<script|onload=|javascript:|xlink:href="https?:|<image[^>]+href="https?:/i.test(svg)){
        throw Error('unexpected executable/remote SVG dependency');
      }
      if(/Reprinted from|Encyclopedia of Tarot|MADE IN CHINA/i.test(svg))throw Error('protected old print claim present');
      const photo=svg.match(/<image[^>]+href="data:image\/jpeg;base64,([A-Za-z0-9+/=]+)"/);
      if(entry.portrait && !photo)throw Error('1912 portrait not embedded');
      if(!entry.portrait && photo)throw Error('unexpected image in recreated serpent title');
      if(photo){
        const jpeg=Buffer.from(photo[1],'base64');
        if(jpeg.length<12000 || jpeg[0]!==0xff || jpeg[1]!==0xd8)throw Error('invalid embedded archival portrait');
        console.log('Public-domain 1912 portrait SHA256: '+createHash('sha256').update(jpeg).digest('hex'));
      }
      const rasterPath=resolve(root,dir,entry.name.replace('.svg','.webp'));
      const raster=await readFile(rasterPath);
      if(raster.length<1200 || raster.length>1_200_000 ||
         raster.toString('ascii',0,4)!=='RIFF' || raster.toString('ascii',8,12)!=='WEBP')
         throw Error('missing or invalid font-baked WebP raster');
      const targetSize=dir==='grid' ? [256,439] : [512,878];
      // Decode metadata using the same pinned rasterizer as the generator.
      const sharp=(await import('sharp')).default;
      const dimensions=await sharp(raster).metadata();
      if(dimensions.width!==targetSize[0] || dimensions.height!==targetSize[1])
         throw Error('incorrect raster dimensions '+dimensions.width+'x'+dimensions.height);
      console.log('PASS '+dir+'/'+entry.name.replace('.svg','.webp')+' '+raster.length+' bytes WebP '+targetSize.join('x'));
      console.log('PASS '+name+' '+bytes.length+' bytes SVG 1024x1755, archival/ornament, no hotlinks');
    }catch(err){
      failed++;
      console.error('BLOCKED '+name+': '+err.message);
    }
  }
}
if(failed) {
  console.error('Deck A reconstructed artwork release guard FAIL '+failed+'/4');
  process.exitCode=1;
}
