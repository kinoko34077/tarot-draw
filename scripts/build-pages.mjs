import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const WEB_ROOT = resolve(fileURLToPath(new URL('../web/', import.meta.url)));

export async function buildPagesSite({
  outputDir = resolve(process.cwd(), '_site'),
  apiBaseUrl = process.env.TAROT_API_BASE_URL ?? ''
} = {}) {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await cp(WEB_ROOT, outputDir, { recursive: true });

  // Favicon SVG is the single editable source. Render raster touch icons
  // at build time without storing generated binaries in Git history.
  const icon = await readFile(resolve(WEB_ROOT, 'favicon.svg'));
  for (const [size, name] of [[180, 'apple-touch-icon.png'], [192, 'icon-192.png'], [512, 'icon-512.png']]) {
    await sharp(icon).resize(size, size).png({ compressionLevel: 9 }).toFile(resolve(outputDir, name));
  }

  const config = {
    apiMode: 'external',
    apiBaseUrl: String(apiBaseUrl).trim()
  };
  const configSource = 'globalThis.__TAROT_DRAW_CONFIG__ = Object.freeze(' + JSON.stringify(config, null, 2) + ');\n';
  await writeFile(resolve(outputDir, 'config.js'), configSource, 'utf8');
  await writeFile(resolve(outputDir, '.nojekyll'), '', 'utf8');
  return config;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputDir = process.argv[2] ? resolve(process.argv[2]) : resolve(process.cwd(), '_site');
  const config = await buildPagesSite({ outputDir });
  console.log('Pages site built at ' + outputDir + '; API configured: ' + Boolean(config.apiBaseUrl));
}
