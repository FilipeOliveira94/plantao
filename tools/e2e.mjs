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
  // the menu states that the cases are AI-generated and links to the references table
  const refs = page.locator('.ai-notice a');
  if (!/docs\/REFERENCES\.md$/.test(await refs.getAttribute('href'))) throw new Error('menu notice does not link to docs/REFERENCES.md');
  if (await refs.getAttribute('target') !== '_blank' || !/noopener/.test(await refs.getAttribute('rel') || '')) throw new Error('references link must open in a new tab with rel=noopener');
  // career screen and locked unit cards, at three points of the track
  const career = async (xp) => {
    await page.evaluate((v) => { localStorage.setItem('plantao.save.v1', JSON.stringify({ xp: v })); }, xp);
    await page.reload();
    await page.getByRole('button', { name: /Carreira/ }).click();
    const rows = page.locator('.career-level');
    const out = { count: await rows.count(), rows: [] };
    for (let i = 0; i < out.count; i++) {
      const r = rows.nth(i);
      out.rows.push({ cls: await r.getAttribute('class'), text: await r.innerText(), bar: await r.getByRole('progressbar').count() });
    }
    await page.locator('.modal-back').click({ position: { x: 5, y: 5 } });
    return out;
  };
  const state = (row) => row.cls.split(' ').find((c) => ['reached', 'current', 'locked'].includes(c));
  let c = await career(0);
  if (c.count !== 8) throw new Error(`career screen shows ${c.count} levels, expected 8`);
  if (state(c.rows[0]) !== 'current' || !c.rows[0].bar) throw new Error('at 0 XP level 1 must be current with a progress bar');
  if (state(c.rows[1]) !== 'locked' || !/faltam 300 XP/.test(c.rows[1].text)) throw new Error(`level 2 at 0 XP: ${c.rows[1].text}`);
  if (!/Hospital Geral Santa Efigênia/.test(c.rows[1].text) || !/Hospital Infantil Pinheirinho/.test(c.rows[1].text)) throw new Error('level 2 must list the two units it unlocks');
  if (!/Nenhum desbloqueio por enquanto/.test(c.rows[3].text)) throw new Error('level 4 must say it unlocks nothing yet');
  const lockedCard = page.locator('.unit.locked').first();
  const lockedText = await lockedCard.innerText();
  if (!/Nível 2 · Residente R1/.test(lockedText) || !/faltam 300 XP/.test(lockedText) || !(await lockedCard.getByRole('progressbar').count())) throw new Error(`locked card lacks requirement or progress: ${lockedText}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/00-locked-cards.png` });
  c = await career(900);
  if (c.rows.slice(0, 2).some((r) => state(r) !== 'reached') || state(c.rows[2]) !== 'current' || !c.rows[2].bar) throw new Error('at 900 XP levels 1-2 must be reached and level 3 current');
  if (!/faltam 600 XP/.test(c.rows[3].text)) throw new Error(`level 4 at 900 XP: ${c.rows[3].text}`);
  c = await career(9000);
  if (c.rows.slice(0, 7).some((r) => state(r) !== 'reached') || state(c.rows[7]) !== 'current' || !/Nível máximo/.test(c.rows[7].text)) throw new Error('at 9000 XP levels 1-7 must be reached and level 8 current at max');
  // unlock every unit for the test
  await page.evaluate(() => { localStorage.setItem('plantao.save.v1', JSON.stringify({ xp: 2000 })); });
  await page.reload();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/01-menu.png` });

  const units = await page.$$eval('.unit', (els) => els.length);
  let reportChecked = false;
  let tabsChecked = false;
  let menuChecked = false;
  let shuffledSeen = 0;
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
        if (!tabsChecked) {
          // chart tabs name their state: only the opening tab has been seen
          tabsChecked = true;
          const labels = await page.$$eval('.tab', (els) => els.map((e) => e.getAttribute('aria-label')));
          if (!/já vista/.test(labels[0]) || labels.slice(1).some((l) => !/não aberta/.test(l))) throw new Error(`unexpected tab states: ${labels}`);
        }
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
        if (!menuChecked) {
          menuChecked = true;
          // test menu: groups start collapsed, search is accent-insensitive and opens the matching group
          await page.getByRole('tab', { name: /Exames/ }).click();
          if (await page.locator('.test-cat[open]').count()) throw new Error('test groups should start collapsed');
          await page.locator('.test-search').fill('GLICEMIA');
          const hits = await page.locator('.test-cat[open] .opt').allTextContents();
          if (hits.length !== 1 || !/Glicemia capilar/.test(hits[0])) throw new Error(`test search failed: ${hits}`);
          await page.locator('.test-search').fill('bioquimica');
          if (!(await page.locator('.test-cat[open] summary', { hasText: 'Bioquímica' }).count())) throw new Error('category search did not open Bioquímica');
          await page.locator('.test-search').fill('');
        }
        // correct decision
        await page.getByRole('tab', { name: /Decisão/ }).click();
        // pick the correct options by id, never by position: the options are shuffled
        const correct = await page.evaluate(() => {
          const e = window.__plantao.shift.current;
          return { dx: e.c.diagnosis.correct, cd: e.c.conduct.correct, fileOrder: e.dxOptions.every((o, i) => o.id === e.c.diagnosis.options[i].id) && e.cdOptions.every((o, i) => o.id === e.c.conduct.options[i].id) };
        });
        const renderedOrder = () => page.evaluate(() => ['dx', 'cd'].map((n) => [...document.querySelectorAll(`input[name=${n}]`)].map((el) => el.value).join()).join('|'));
        const rendered = await renderedOrder();
        const expected = await page.evaluate(() => { const e = window.__plantao.shift.current; return [e.dxOptions, e.cdOptions].map((l) => l.map((o) => o.id).join()).join('|'); });
        if (rendered !== expected) throw new Error(`options render out of the encounter's order: ${rendered} vs ${expected}`);
        if (!correct.fileOrder) shuffledSeen++;
        await page.locator(`input[name=dx][value="${correct.dx}"]`).check();
        await page.locator(`input[name=cd][value="${correct.cd}"]`).check();
        // switching tabs re-renders the chart; the order must stay the same
        await page.getByRole('tab', { name: /Triagem/ }).click();
        await page.getByRole('tab', { name: /Decisão/ }).click();
        if (await renderedOrder() !== rendered) throw new Error('option order changed on re-render');
        if (!(await page.locator(`input[name=dx][value="${correct.dx}"]`).isChecked())) throw new Error('diagnosis choice lost on re-render');
        await page.getByRole('button', { name: /Finalizar atendimento/ }).click();
        await page.waitForSelector('.modal');
        if (!reportChecked) {
          // feedback links to a prefilled GitHub issue with the case id and the answer given
          reportChecked = true;
          const a = page.locator('.modal .report-case a');
          const url = new URL(await a.getAttribute('href'));
          if (url.origin + url.pathname !== 'https://github.com/FilipeOliveira94/plantao/issues/new') throw new Error(`report link points elsewhere: ${url}`);
          const title = url.searchParams.get('title'), body = url.searchParams.get('body');
          const ids = await page.evaluate(() => { const { enc: e } = window.__plantao.shift.results.at(-1); return [e.c.diagnosis.correct, e.c.conduct.correct]; });
          if (!title.includes(enc) || !body.includes(`\`${enc}\``) || ids.some((id) => !body.includes(`\`${id}\``))) throw new Error(`report link misses the case or answer: ${title}\n${body}`);
          if (await a.getAttribute('target') !== '_blank' || !/noopener/.test(await a.getAttribute('rel') || '')) throw new Error('report link must open in a new tab with rel=noopener');
        }
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
  if (!reportChecked) throw new Error('report link was never checked');
  if (!tabsChecked) throw new Error('tab states were never checked');
  if (!menuChecked) throw new Error('test menu was never checked');
  if (!shuffledSeen) throw new Error('answer options were never shuffled in any encounter');
  console.log(`✔ options shuffled in ${shuffledSeen} encounters`);
  // the same seed gives the same option order
  const sameSeed = await page.evaluate(async () => {
    const { Shift } = await import('./src/game/shift.js');
    const { UNITS } = await import('./src/data/catalog.js');
    const order = () => new Shift({ unit: UNITS[0], specialty: UNITS[0].specialties[0], seed: 42 }).encounters.map((e) => [...e.dxOptions, ...e.cdOptions].map((o) => o.id).join()).join('|');
    return order() === order();
  });
  if (!sameSeed) throw new Error('option order is not deterministic for a fixed seed');
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
