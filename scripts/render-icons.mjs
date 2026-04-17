/**
 * Render icons/icon.svg to PNG at the sizes Chrome requires (16, 48, 128).
 * Runs inside the dev Docker container which already has Chromium installed
 * for the Puppeteer e2e tests. Re-render after editing icon.svg via:
 *
 *   make icons
 */
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';

const SIZES = [16, 48, 128];
const SVG_PATH = 'icons/icon.svg';

const svg = readFileSync(SVG_PATH, 'utf-8');

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();

  for (const size of SIZES) {
    await page.setViewport({
      width: size,
      height: size,
      deviceScaleFactor: 1,
    });

    await page.setContent(
      `<!DOCTYPE html>
       <html>
         <head><style>
           html, body { margin: 0; padding: 0; background: transparent; }
           svg { width: ${size}px; height: ${size}px; display: block; }
         </style></head>
         <body>${svg}</body>
       </html>`,
      { waitUntil: 'load' }
    );

    const buffer = await page.screenshot({
      type: 'png',
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });

    const out = `icons/icon${size}.png`;
    writeFileSync(out, buffer);
    console.log(`Rendered ${out} (${buffer.length} bytes)`);
  }
} finally {
  await browser.close();
}
