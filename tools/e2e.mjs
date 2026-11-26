// End-to-end test: plays a full shift in every unit/specialty, always picking the correct answers.
// Requires Playwright (global or local) and Python 3 to serve the files.
// Usage: node tools/e2e.mjs [--shots dir]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const PORT = 8765;
const shotsIdx = process.argv.indexOf('--shots');
const SHOTS = shotsIdx > -1 ? process.argv[shotsIdx + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 820 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

try {
  await page.goto(`http://localhost:${PORT}/index.html`);
  // unlock every unit for the test
  await page.evaluate(() => { localStorage.setItem('plantao.save.v1', JSON.stringify({ xp: 2000 })); });
  await page.reload();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/01-menu.png` });

  const units = await page.$$eval('.unit', (els) => els.length);
  for (let u = 0; u < units; u++) {
    await page.locator('.unit').nth(u).click();
    const specs = await page.locator('.spec').count();
    for (let s = 0; s < specs; s++) {
      await page.locator('.spec').nth(s).click();
      await page.getByRole('button', { name: /Começar plantão/ }).click();
      await page.waitForSelector('.game');
      let guard = 0;
      while (guard++ < 60) {
        const done = await page.evaluate(() => window.__plantao.shift?.done);
        if (done) break;
        // call the next patient or wait
        const call = page.locator('.qcard button:not([disabled])').first();
        if (await call.count()) await call.click();
        else {
          const wait = page.getByRole('button', { name: /Aguardar próximo/ });
          if (await wait.count()) { await wait.click(); continue; }
        }
        const enc = await page.evaluate(() => window.__plantao.shift?.current?.c.id);
        if (!enc) continue;
        // ask a few questions and do one physical exam item
        await page.getByRole('tab', { name: /Anamnese/ }).click();
        for (let i = 0; i < 4; i++) {
          const opt = page.locator('.pane .opt').first();
          if (await opt.count()) await opt.click();
        }
        await page.getByRole('tab', { name: /Exame físico/ }).click();
        const p = page.locator('.pane .opt').first();
        if (await p.count()) await p.click();
        if (u === 0 && s === 0 && SHOTS) await page.screenshot({ path: `${SHOTS}/02-atendimento.png` });
        // correct decision
        await page.getByRole('tab', { name: /Decisão/ }).click();
        const correct = await page.evaluate(() => {
          const c = window.__plantao.shift.current.c;
          return { dx: c.diagnosis.options.findIndex((o) => o.id === c.diagnosis.correct), cd: c.conduct.options.findIndex((o) => o.id === c.conduct.correct) };
        });
        await page.locator('input[name=dx]').nth(correct.dx).check();
        await page.locator('input[name=cd]').nth(correct.cd).check();
        await page.getByRole('button', { name: /Finalizar atendimento/ }).click();
        await page.waitForSelector('.modal');
        if (u === 0 && s === 0 && guard < 3 && SHOTS) await page.screenshot({ path: `${SHOTS}/03-feedback.png` });
        await page.locator('.modal .btn.primary').click();
        await page.waitForTimeout(150);
      }
      await page.waitForSelector('text=Fim de plantão', { timeout: 3000 });
      if (u === units - 1 && SHOTS) await page.screenshot({ path: `${SHOTS}/04-fim.png` });
      console.log(`✔ unit ${u} · specialty ${s}`);
      await page.getByRole('button', { name: /Voltar ao menu/ }).click();
      await page.locator('.unit').nth(u).click();
    }
  }
  // PICU scene
  if (SHOTS) {
    await page.locator('.unit').last().click();
    await page.getByRole('button', { name: /Começar plantão/ }).click();
    await page.locator('.qcard button:not([disabled])').first().click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/05-utip.png` });
  }
} finally {
  await browser.close();
  server.kill();
}

if (errors.length) { console.error('Console errors:\n' + errors.join('\n')); process.exit(1); }
console.log('E2E OK');
