/* Capturas del mundo 3D para el repositorio (docs/portfolio/).
   Uso: node scripts/capture-world.mjs   (necesita el server en :8769 y Playwright con Chromium) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = 'http://localhost:8769/world.html';
const OUT = resolve(new URL('..', import.meta.url).pathname, 'docs/portfolio');
mkdirSync(OUT, { recursive: true });

async function withPage(fn) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 });
  await fn(page);
  await browser.close();
}

async function shot(page, name) {
  await page.screenshot({ path: resolve(OUT, name) });
  console.log('✓', name);
}

async function stills() {
  await withPage(async page => {
    await page.goto(`${BASE}?state=community`);
    await page.waitForTimeout(1800);
    await shot(page, '19-mundo-comunidad.png');

    await page.evaluate(() => World.go('building', { building: 'torre-a' }));
    await page.waitForTimeout(2200);
    await shot(page, '20-mundo-edificio.png');

    await page.goto(`${BASE}?state=connections`);
    await page.waitForTimeout(1800);
    await page.fill('#world-input', 'Necesito un vestido largo talla M para una boda este sábado.');
    await page.evaluate(() => World.need(document.querySelector('#world-input').value));
    await page.waitForTimeout(9500);
    await shot(page, '21-mundo-necesidad.png');

    await page.evaluate(() => document.querySelector('[data-world="photo"]')?.click());
    await page.waitForTimeout(1400);
    await shot(page, '22-mundo-visual-confirm.png');
  });
}

async function revealGif() {
  await withPage(async page => {
    await page.goto(`${BASE}?state=community`);
    await page.waitForTimeout(1200);
    const frameDir = '/tmp/entre-todos-reveal-frames';
    mkdirSync(frameDir, { recursive: true });
    await page.evaluate(() => World.reveal());
    const stops = [0, 1900, 2000, 2000, 2000, 2200, 3000, 4000]; // ms entre cuadros
    let t = 0;
    for (let i = 0; i < stops.length; i++) {
      await page.waitForTimeout(stops[i]);
      t += stops[i];
      await page.screenshot({ path: `${frameDir}/f${String(i).padStart(2, '0')}.png` });
      console.log('frame', i, 'at', t, 'ms');
    }
  });
}

const mode = process.argv[2] || 'all';
if (mode === 'stills' || mode === 'all') await stills();
if (mode === 'gif' || mode === 'all') await revealGif();
