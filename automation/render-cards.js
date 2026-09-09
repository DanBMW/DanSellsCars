/* Render finance-post HTML cards to 1080x1350 PNGs. */
const { chromium } = require('playwright');
(async () => {
  const files = process.argv.slice(2);
  if (!files.length) return;
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  for (const f of files) {
    await p.goto('file://' + require('path').resolve(f), { waitUntil: 'load' });
    await p.waitForTimeout(250);
    await p.screenshot({ path: f.replace(/\.html$/, '.png') });
  }
  await b.close();
})();
