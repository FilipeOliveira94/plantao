// End-to-end test: plays a full shift in every unit/specialty, always picking the correct answers.
// Requires Playwright (`npm ci && npx playwright install chromium`) and Python 3 to serve the files.
// Usage: node tools/e2e.mjs [--shots dir]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  if (e.code !== 'MODULE_NOT_FOUND') throw e;
  console.error('Playwright not found: run `npm ci && npx playwright install chromium`.');
  process.exit(1);
}

const PORT = Number(process.env.E2E_PORT) || 8765; // set E2E_PORT when another checkout already serves 8765
const shotsIdx = process.argv.indexOf('--shots');
const SHOTS = shotsIdx > -1 ? process.argv[shotsIdx + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { stdio: 'ignore' });
process.on('exit', () => server.kill()); // never leave the server running, whatever fails below
// wait until our server answers (a slow CI runner can take more than a second)
for (let tries = 0; ; tries++) {
  if (server.exitCode !== null) {
    console.error(`E2E server exited (is port ${PORT} already in use?).`);
    process.exit(1);
  }
  try { if ((await fetch(`http://localhost:${PORT}/index.html`, { signal: AbortSignal.timeout(1000) })).ok) break; } catch { /* not up yet */ }
  if (tries >= 50) {
    console.error(`E2E server did not start on port ${PORT}.`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch();
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 820 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // arrival popups: the full-shift runs answer "Depois"; the arrival check near the end covers both answers
  const arrivalCard = page.locator('.popup.arrival:not(.out)');
  const dismissArrival = async () => { await arrivalCard.getByRole('button', { name: 'Depois' }).click(); };
  await page.addLocatorHandler(arrivalCard, dismissArrival, { noWaitAfter: true });
  // random event popups (P1-09, about one shift in six): the full-shift runs close them; the event check below covers them
  const eventCard = page.locator('.popup.event:not(.out)');
  await page.addLocatorHandler(eventCard, async () => { await eventCard.getByRole('button', { name: 'Entendi' }).click(); }, { noWaitAfter: true });
  // next step (P2-01): exactly one highlighted action on screen, skipping a popup on its way out
  const steps = () => page.evaluate(() => [...document.querySelectorAll('.next-step')].filter((el) => !el.closest('.popup.out')).map((el) => el.dataset.step));
  const expectStep = async (want, what) => {
    try {
      await page.waitForFunction((w) => {
        const on = [...document.querySelectorAll('.next-step')].filter((el) => !el.closest('.popup.out'));
        return on.length === 1 && (!w || on[0].dataset.step === w);
      }, want, { timeout: 3000 });
    } catch { throw new Error(`${what}: next step ${JSON.stringify(await steps())}, expected exactly one${want ? ` (${want})` : ''}`); }
  };
  await page.goto(`http://localhost:${PORT}/index.html?clock=manual`); // the test steps the clock itself (P1-11)
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

  // save: the menu says progress lives in this browser; the v1 seed above was migrated
  if (!/só neste navegador/.test(await page.locator('.save-notice').textContent())) throw new Error('menu misses the browser-only save notice');
  if (await page.evaluate(() => window.__plantao.state.version) !== 2) throw new Error('v1 save was not migrated to version 2');
  // export as a code, reset, import the code back
  await page.getByRole('button', { name: /Exportar progresso/ }).click();
  const code = await page.locator('.modal .save-code').inputValue();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/01b-export.png` });
  await page.getByRole('button', { name: 'Fechar' }).click();
  await page.getByRole('button', { name: 'Zerar progresso' }).click();
  await page.getByRole('button', { name: 'Zerar', exact: true }).click();
  if (await page.evaluate(() => window.__plantao.state.xp) !== 0) throw new Error('reset did not clear XP');
  // a bad code is rejected and changes nothing
  await page.getByRole('button', { name: /Importar progresso/ }).click();
  await page.locator('.modal .save-code').fill('bm90IGEgc2F2ZQ==');
  await page.getByRole('button', { name: 'Ler código' }).click();
  if (!/não é um progresso/.test(await page.locator('.modal .import-error').textContent())) throw new Error('bad import code shows no error');
  if (await page.evaluate(() => window.__plantao.state.xp) !== 0) throw new Error('bad import changed the progress');
  await page.locator('.modal .save-code').fill(code);
  await page.getByRole('button', { name: 'Ler código' }).click();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/01c-import.png` });
  await page.getByRole('button', { name: 'Substituir' }).click();
  if (await page.evaluate(() => window.__plantao.state.xp) !== 2000) throw new Error('import did not restore XP');
  await page.reload();
  if (await page.evaluate(() => JSON.parse(localStorage.getItem('plantao.save.v1')).xp) !== 2000) throw new Error('imported progress was not saved');
  // export as a file
  await page.getByRole('button', { name: /Exportar progresso/ }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Baixar plantao-progresso-/ }).click()]);
  if (!/^plantao-progresso-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename())) throw new Error(`export file name: ${dl.suggestedFilename()}`);
  await page.getByRole('button', { name: 'Fechar' }).click();
  // import the downloaded file over a reset progress
  const file = await dl.path();
  await page.getByRole('button', { name: 'Zerar progresso' }).click();
  await page.getByRole('button', { name: 'Zerar', exact: true }).click();
  await page.getByRole('button', { name: /Importar progresso/ }).click();
  await page.locator('.modal input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: 'Substituir' }).click();
  if (await page.evaluate(() => window.__plantao.state.xp) !== 2000) throw new Error('file import did not restore XP');
  console.log('✔ save: notice, migration, export and import (file, code), bad code');

  const units = await page.$$eval('.unit', (els) => els.length);
  let reportChecked = false;
  let tabsChecked = false;
  let menuChecked = false;
  let talkChecked = false;
  let musicChecked = false;
  let shuffledSeen = 0;
  let roomWaitSeen = false;
  let criticalChecked = false;
  for (let u = 0; u < units; u++) {
    await page.locator('.unit').nth(u).click();
    const specs = await page.locator('.spec').count();
    for (let s = 0; s < specs; s++) {
      await page.locator('.spec').nth(s).click();
      await page.getByRole('button', { name: /Começar plantão/ }).click();
      await page.waitForSelector('.game');
      // music: the unit's track (and weather) plays during the shift, and the slider sets and saves the volume
      const mus = await page.evaluate(() => ({ playing: window.__plantao.music, expected: window.__plantao.shift.unit.music }));
      if (!mus.expected?.track || mus.playing?.track !== mus.expected.track || mus.playing.weather !== (mus.expected.weather ?? null)) throw new Error(`music ${JSON.stringify(mus.playing)} != ${JSON.stringify(mus.expected)}`);
      if (!musicChecked) {
        musicChecked = true;
        await page.locator('.topbar .music-vol input').fill('20');
        const vol = await page.evaluate(() => JSON.parse(localStorage.getItem('plantao.save.v1')).settings.musicVolume);
        if (vol !== 0.2) throw new Error(`music volume not saved: ${vol}`);
      }
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
        await expectStep(null, `${enc} called`);
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
          if (!talkChecked && i === 0) {
            // dialogue on the stage: the question in the doctor's balloon, the answer in the patient side's, no transcript in the chart
            talkChecked = true;
            const exp = await page.evaluate(() => { const e = window.__plantao.shift.current; const l = e.log.filter((x) => x.kind === 'q').at(-1); const sp = e.speakerFor(l.a); return { q: l.q, a: sp.text, who: sp.name }; });
            const got = await page.evaluate(() => {
              const b = (w) => document.querySelector(`.talk .balloon[data-who=${w}]`);
              const stage = document.querySelector('.talk').getBoundingClientRect();
              const inside = (el) => { const r = el.getBoundingClientRect(); return r.left >= stage.left && r.right <= stage.right && r.top >= stage.top && r.bottom <= stage.bottom; };
              return { q: b('doctor').querySelector('.text').textContent, a: b('pt').querySelector('.text').textContent, who: b('pt').querySelector('.who').textContent, dim: b('doctor').classList.contains('old'), inside: inside(b('doctor')) && inside(b('pt')) };
            });
            if (got.q !== exp.q || got.a !== exp.a || got.who !== exp.who) throw new Error(`stage dialogue ${JSON.stringify(got)} != ${JSON.stringify(exp)}`);
            if (!got.dim) throw new Error('the question balloon should be dimmed once the answer arrives');
            if (!got.inside) throw new Error('a balloon is outside the stage');
            if (await page.locator('.pane .chat, .pane .msg').count()) throw new Error('the chart still shows a transcript');
            if (!/Já perguntado \(1\)/.test(await page.locator('.pane details.asked summary').textContent())) throw new Error('missing "Já perguntado (1)"');
          }
        }
        await page.getByRole('tab', { name: /Exame físico/ }).click();
        const p = page.locator('.pane .opt').first();
        if (await p.count()) await p.click();
        if (u === 0 && s === 0 && SHOTS) await page.screenshot({ path: `${SHOTS}/02-atendimento.png` });
        if (!criticalChecked && await page.evaluate(() => !!window.__plantao.shift.current.c.timeCritical)) {
          // the critical-window chip counts consultation time, thinking included (P1-12)
          criticalChecked = true;
          await page.evaluate(async () => { const { REAL_SECONDS_PER_MINUTE } = await import('./src/game/time.js'); window.__plantao.clock.step(2 * REAL_SECONDS_PER_MINUTE * 1000); });
          const exp = await page.evaluate(() => { const e = window.__plantao.shift.current; return { pct: Math.round((e.minutesSpent / e.c.timeCritical.minutes) * 100), thinking: e.time.thinking }; });
          const chip = await page.locator('.chart .critical-chip').textContent();
          if (exp.thinking < 2 || chip !== `⏱ Janela crítica: ${exp.pct}%`) throw new Error(`critical chip "${chip}" does not count thinking: ${JSON.stringify(exp)}`);
          console.log(`✔ critical-window chip counts thinking: ${chip}`);
        }
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
          // ordering a point-of-care test costs 1 consultation minute; the result comes after its duration
          const before = await page.evaluate(() => window.__plantao.shift.current.minutesSpent);
          await page.locator('.test-search').fill('glicemia capilar');
          await page.locator('.test-cat[open] .opt').first().click();
          const after = await page.evaluate(() => { const s = window.__plantao.shift; const r = s.current.requested.get('capillary_glucose'); return { spent: s.current.minutesSpent, wait: r.readyAt - s.clock }; });
          if (after.spent !== before + 1 || after.wait <= 0) throw new Error(`test order cost: ${JSON.stringify({ before, ...after })}`);
          if (!/Tempo de consulta\s*\d+% do alvo/.test(await page.locator('.chart .consult-chip').textContent())) throw new Error('chart does not show consultation time against its target');
          await page.getByRole('button', { name: /Aguardar aqui/ }).click();
          if (await page.evaluate(() => window.__plantao.shift.current.minutesSpent) !== after.spent) throw new Error('waiting in the room counted as consultation time');
          if (!(await page.locator('.exam-row', { hasText: 'Glicemia capilar' }).getByText('Liberado').count())) throw new Error('point-of-care result not ready after waiting in the room');
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
        {
          // feedback shows where the consultation went, as shares of the target (never minutes), the room
          // timeline in clock times, and the queue's cost as one line per affected patient
          const tb = await page.evaluate(() => {
            const { enc: e, result: r } = window.__plantao.shift.results.at(-1);
            const txt = (k) => document.querySelector(`.modal .time-breakdown [data-k=${k}]`)?.textContent || '';
            const pc = (k) => Number(/(\d+)%/.exec(txt(k))?.[1]);
            return { r: { time: r.time, spent: r.minutesSpent, target: r.consultTarget, paid: r.queuePaid.length, waits: e.roomWaits.length },
              q: pc('questions'), p: pc('physical'), o: pc('orders'), th: pc('thinking'), total: txt('total'), timeline: txt('timeline'), queue: txt('queue'),
              items: document.querySelectorAll('.modal .queue-paid li').length, mins: /\d+ min/.test(document.querySelector('.modal .time-breakdown').textContent) };
          });
          const { time: t, target } = tb.r;
          const pct = (m) => Math.round((m / target) * 100);
          if (tb.q !== pct(t.questions) || tb.p !== pct(t.physical) || tb.o !== pct(t.orders) || tb.th !== pct(t.thinking) || t.questions + t.physical + t.orders + t.thinking !== tb.r.spent) throw new Error(`time breakdown parts: ${JSON.stringify(tb)}`);
          if (!tb.total.includes(`${pct(tb.r.spent)}% do tempo-alvo`)) throw new Error(`time breakdown total: ${JSON.stringify(tb)}`);
          if (tb.mins) throw new Error(`time breakdown shows minutes: ${JSON.stringify(tb)}`);
          if (!/consultório \d\d:\d\d–\d\d:\d\d/.test(tb.timeline) || (tb.r.waits > 0) !== /aguardando resultado/.test(tb.timeline)) throw new Error(`timeline: ${JSON.stringify(tb)}`);
          if (!/O que a fila pagou/.test(tb.queue) || tb.items !== tb.r.paid || (tb.r.paid === 0) !== /ninguém passou/.test(tb.queue)) throw new Error(`queue cost: ${JSON.stringify(tb)}`);
          if (tb.r.waits > 0) roomWaitSeen = true;
        }
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
      if (await page.locator('.modal li.unseen').count()) throw new Error(`focused play left patients unseen in unit ${u} · specialty ${s}`);
      if (u === units - 1 && SHOTS) await page.screenshot({ path: `${SHOTS}/04-fim.png` });
      console.log(`✔ unit ${u} · specialty ${s}`);
      await page.getByRole('button', { name: /Voltar ao menu/ }).click();
      if (await page.evaluate(() => window.__plantao.music)) throw new Error('music still playing on the menu');
      await page.locator('.unit').nth(u).click();
    }
  }
  if (!reportChecked) throw new Error('report link was never checked');
  if (!tabsChecked) throw new Error('tab states were never checked');
  if (!menuChecked) throw new Error('test menu was never checked');
  if (!criticalChecked) throw new Error('no time-critical case was played');
  if (!shuffledSeen) throw new Error('answer options were never shuffled in any encounter');
  console.log(`✔ options shuffled in ${shuffledSeen} encounters`);
  if (!roomWaitSeen) throw new Error('no feedback showed a wait for a result in the room');
  console.log('✔ feedback time breakdown matches the encounter, in shares and clock times');
  // the same seed gives the same option order
  const sameSeed = await page.evaluate(async () => {
    const { Shift } = await import('./src/game/shift.js');
    const { UNITS } = await import('./src/data/catalog.js');
    const order = () => new Shift({ unit: UNITS[0], specialty: UNITS[0].specialties[0], seed: 42 }).encounters.map((e) => [...e.dxOptions, ...e.cdOptions].map((o) => o.id).join()).join('|');
    return order() === order();
  });
  if (!sameSeed) throw new Error('option order is not deterministic for a fixed seed');
  // consultation time budget: the focused path costs nothing, asking everything is penalized and capped,
  // and the old efficiency bonus is gone
  const budget = await page.evaluate(async () => {
    const { Encounter, consultTarget, focusedMinutes, OVERTIME_CAP } = await import('./src/game/encounter.js');
    const { CASES } = await import('./src/data/cases/index.js');
    const bad = [];
    for (const c of CASES) {
      const pick = { diagnosisId: c.diagnosis.correct, conductId: c.conduct.correct, now: 0 };
      const focused = new Encounter(c, c.settings[0]);
      const keyQ = new Set(); const add = (q) => { if (q && !keyQ.has(q.id)) { keyQ.add(q.id); add(c.questions.find((x) => x.id === q.requires)); } };
      c.questions.filter((q) => q.key).forEach(add);
      // ask prerequisites first
      for (const q of c.questions) if (keyQ.has(q.id)) focused.ask(q.id);
      c.physical.filter((p) => p.key).forEach((p) => focused.examine(p.id));
      Object.entries(c.exams || {}).filter(([, e]) => e.relevance === 'key' && !e.brought).forEach(([id]) => focused.request(id, 0));
      const f = focused.score(pick);
      if (focused.minutesSpent !== focusedMinutes(c)) bad.push(`${c.id}: focused path ${focused.minutesSpent} min, helper says ${focusedMinutes(c)}`);
      if (f.lines.some((l) => /tempo-alvo|eficiente/.test(l.label))) bad.push(`${c.id}: focused path penalized: ${f.lines.map((l) => l.label)}`);
      const all = new Encounter(c, c.settings[0]);
      for (let i = 0; i < 3; i++) c.questions.forEach((q) => { if (!q.requires || all.asked.has(q.requires)) all.ask(q.id); });
      c.physical.forEach((p) => all.examine(p.id));
      const line = all.score(pick).lines.find((l) => /tempo-alvo/.test(l.label));
      const over = all.minutesSpent - consultTarget(c);
      if (over > 0 && (!line || line.v !== -Math.min(OVERTIME_CAP, 2 * over))) bad.push(`${c.id}: ${all.minutesSpent} min vs ${consultTarget(c)}: ${JSON.stringify(line)}`);
    }
    return bad;
  });
  if (budget.length) throw new Error(budget.join('\n'));
  console.log('✔ consultation budget: focused paths free, overtime penalized and capped');
  // arrivals: same seed, same schedule; 5 patients (PICU 4) or the whole pool, spread over the arrival window
  const arrivals = await page.evaluate(async () => {
    const { Shift, ARRIVAL_WINDOW, PATIENTS_PER_SHIFT } = await import('./src/game/shift.js');
    const { UNITS } = await import('./src/data/catalog.js');
    const { casesFor } = await import('./src/data/cases/index.js');
    const bad = [];
    for (const unit of UNITS) for (const specialty of unit.specialties) {
      const times = (seed) => new Shift({ unit, specialty, seed, completedCases: { any: 1 } }).encounters.map((e) => e.arrivedAt);
      const a = times(7), want = Math.min(PATIENTS_PER_SHIFT[unit.type] ?? PATIENTS_PER_SHIFT.default, casesFor(specialty, unit.type).length);
      if (a.join() !== times(7).join()) bad.push(`${unit.id}/${specialty}: arrivals not deterministic`);
      if (a.length !== want) bad.push(`${unit.id}/${specialty}: ${a.length} patients, expected ${want}`);
      if (a[0] !== 0 || a.some((t, i) => i && (t <= a[i - 1] || t > ARRIVAL_WINDOW))) bad.push(`${unit.id}/${specialty}: arrivals ${a}`);
    }
    return bad;
  });
  if (arrivals.length) throw new Error(arrivals.join('\n'));
  // the shift has an end: after 19:00 (the fictitious 12-hour clock) no one else is called, the patient in the room can be finished,
  // and patients left unseen are listed in the summary and cost XP from the closing bonus
  await page.locator('.unit').first().click();
  await page.locator('.spec').first().click();
  await page.getByRole('button', { name: /Começar plantão/ }).click();
  await page.waitForSelector('.game');
  if (!/fim 19:00/.test(await page.locator('.clock').textContent())) throw new Error('top bar does not show the end of the shift');
  await page.locator('.qcard button:not([disabled])').first().click();
  const xpBefore = await page.evaluate(() => { const s = window.__plantao.shift; s.advance(s.endsAt - s.clock); return window.__plantao.state.xp; });
  await page.getByRole('tab', { name: /Anamnese/ }).click();
  await page.locator('.pane .opt').first().click(); // any action re-renders and announces the end
  await page.getByText(/fim do turno/).first().waitFor();
  if (await page.locator('.qcard button:not([disabled])').count()) throw new Error('a patient can still be called after the end of the shift');
  const endCase = await page.evaluate(() => { const s = window.__plantao.shift; return { dx: s.current.c.diagnosis.correct, cd: s.current.c.conduct.correct, unseen: s.encounters.length - 1 }; });
  await page.getByRole('tab', { name: /Decisão/ }).click();
  await page.locator(`input[name=dx][value="${endCase.dx}"]`).check();
  await page.locator(`input[name=cd][value="${endCase.cd}"]`).check();
  await page.getByRole('button', { name: /Finalizar atendimento/ }).click();
  await page.waitForSelector('.modal');
  await page.locator('.modal .btn.primary').click();
  await page.waitForSelector('text=Fim de plantão', { timeout: 3000 });
  const listed = await page.locator('.modal li.unseen').count();
  if (listed !== endCase.unseen) throw new Error(`summary lists ${listed} unseen patients, expected ${endCase.unseen}`);
  const penaltyLine = await page.locator('.modal li', { hasText: 'Pacientes sem atendimento' }).textContent();
  if (!penaltyLine.includes(`(${endCase.unseen})`) || !penaltyLine.includes(`-${30 * endCase.unseen}`)) throw new Error(`unexpected penalty line: ${penaltyLine}`);
  if (await page.evaluate(() => window.__plantao.state.xp) < xpBefore) throw new Error('XP went down at the end of the shift');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/06-fim-com-pendentes.png` });
  console.log(`✔ shift end: ${endCase.unseen} unseen patients listed`);
  await page.getByRole('button', { name: /Voltar ao menu/ }).click();
  // real-time clock (P1-11): stepped real time moves the clock and, with a patient in the room, the consultation;
  // the pause screen, the feedback modal and a blocking popup hold it, and it runs again once each one closes
  {
    await page.locator('.unit').first().click();
    await page.locator('.spec').first().click();
    await page.getByRole('button', { name: /Começar plantão/ }).click();
    await page.waitForSelector('.game');
    const step = (ms) => page.evaluate((v) => {
      const s = window.__plantao.shift;
      const before = { clock: s.clock, spent: s.current?.minutesSpent ?? 0 };
      window.__plantao.clock.step(v);
      return { clock: s.clock - before.clock, spent: (s.current?.minutesSpent ?? 0) - before.spent, label: document.querySelector('.clock').textContent, chip: document.querySelector('.consult-chip')?.textContent ?? null };
    }, ms);
    const idle = await step(25000); // 2.5 internal minutes: the half minute carries over
    if (idle.clock !== 2 || idle.spent !== 0 || !idle.label.startsWith('07:08')) throw new Error(`real time with the room free: ${JSON.stringify(idle)}`);
    if ((await step(5000)).clock !== 1) throw new Error('the half minute of real time did not carry over');
    // a tick swaps only the clock face: the volume slider keeps the focus
    await page.locator('.topbar input[type=range]').focus();
    await step(10000);
    if (!(await page.locator('.topbar input[type=range]').evaluate((el) => el === document.activeElement))) throw new Error('a clock tick took the focus off the volume slider');
    await page.locator('.qcard button:not([disabled])').first().click();
    await page.getByRole('tab', { name: /Exames/ }).click();
    const search = page.locator('.test-search');
    await search.fill('ecg');
    const chip0 = await page.locator('.consult-chip').textContent();
    const think = await step(20000);
    if (think.clock !== 2 || think.spent !== 2 || think.chip === chip0) throw new Error(`thinking in the room: ${JSON.stringify(think)} (chip was ${chip0})`);
    if (await search.inputValue() !== 'ecg' || !(await search.evaluate((el) => el === document.activeElement))) throw new Error('a clock tick reset the test search box');
    // pause screen: an opaque overlay; Escape resumes
    await page.getByRole('button', { name: /Pausar/ }).click();
    await page.waitForSelector('.modal-back.paused');
    if ((await step(30000)).clock !== 0) throw new Error('the clock ran on the pause screen');
    await page.keyboard.press('Escape');
    if (await page.locator('.modal-back.paused').count()) throw new Error('Escape did not close the pause screen');
    if ((await step(10000)).clock !== 1) throw new Error('the clock did not resume after the pause screen');
    // a blocking popup holds the clock until it closes
    await page.evaluate(async () => { const { popup } = await import('./src/ui/popup.js'); window.__p = popup(document.createTextNode('teste'), { blocking: true, actions: [{ label: 'Ok' }] }); });
    if ((await step(30000)).clock !== 0) throw new Error('the clock ran under a blocking popup');
    await page.keyboard.press('Escape');
    if ((await step(10000)).clock !== 1) throw new Error('the clock did not resume after the blocking popup');
    // feedback holds it; the breakdown shows the thinking share
    const ids = await page.evaluate(() => { const e = window.__plantao.shift.current; return [e.c.diagnosis.correct, e.c.conduct.correct, e.time.thinking]; });
    if (ids[2] !== 4) throw new Error(`thinking minutes: ${ids[2]}, expected 4`); // 2 + 1 after the pause + 1 after the popup
    await page.getByRole('tab', { name: /Decisão/ }).click();
    await page.locator(`input[name=dx][value="${ids[0]}"]`).check();
    await page.locator(`input[name=cd][value="${ids[1]}"]`).check();
    await page.getByRole('button', { name: /Finalizar atendimento/ }).click();
    await page.waitForSelector('.modal .time-breakdown');
    if (!/Raciocínio\s*\d+%/.test(await page.locator('.modal .time-breakdown [data-k=thinking]').textContent())) throw new Error('breakdown has no thinking share');
    if ((await step(30000)).clock !== 0) throw new Error('the clock ran on the feedback screen');
    await page.locator('.modal .btn.primary').click();
    if ((await step(10000)).clock !== 1) throw new Error('the clock did not resume after the feedback');
    console.log('✔ real-time clock: ticks, thinking counts in the room, holds on pause, popup and feedback');
    await page.getByRole('button', { name: '←' }).click();
    await page.getByRole('button', { name: 'Sair' }).click();
  }
  // time on screen (P2-02): the queue's patience bars and the consultation bar drain as the clock runs, hovering an
  // action previews its cut and picking it takes that cut, an action shows its clock jump, and test bars fill up
  {
    await page.locator('.unit').first().click();
    await page.locator('.spec').first().click();
    await page.getByRole('button', { name: /Começar plantão/ }).click();
    await page.waitForSelector('.game');
    // a second patient waits from 07:00, so the queue has someone waiting while the first is seen
    await page.evaluate(() => { const e = window.__plantao.shift.encounters[1]; e.arrivedAt = 0; e._arrivalNotified = true; });
    const step = (ms) => page.evaluate((v) => window.__plantao.clock.step(v), ms);
    const width = (sel) => page.locator(sel).first().evaluate((el) => parseFloat(el.style.width));
    await step(10000);
    const patience = '.qcard .tbar.patience .fill';
    if (await page.locator('.qcard .tbar.patience').count() !== 2) throw new Error('queue cards have no patience bar');
    const p0 = await width(patience);
    await step(30000);
    const p1 = await width(patience);
    if (!(p1 < p0)) throw new Error(`patience bar did not drain: ${p0} -> ${p1}`);
    await page.locator('.qcard button:not([disabled])').first().click();
    if (await page.locator('.qcard .tbar.patience').count() !== 1) throw new Error('the patient still waiting lost the patience bar');
    const fill = '.consult-chip .tbar.consult .fill';
    const cut = '.consult-chip .tbar.consult .cut';
    if (await width(fill) !== 100) throw new Error('the consultation bar does not start full');
    await step(20000);
    const c1 = await width(fill);
    if (!(c1 < 100)) throw new Error(`the consultation bar did not drain while thinking: ${c1}`);
    await page.getByRole('tab', { name: /Anamnese/ }).click();
    const opt = page.locator('.pane .opt').first();
    await opt.hover();
    const preview = await width(cut);
    if (!(preview > 0)) throw new Error('hovering a question does not preview its cut');
    await page.mouse.move(2, 2);
    if (await width(cut) !== 0) throw new Error('the preview stays after the pointer leaves');
    await opt.hover();
    const before = { left: await width(fill), clock: await page.locator('.clock').evaluate((el) => el.firstChild.textContent) };
    await opt.click();
    const after = await width(fill);
    if (Math.abs(after - (before.left - preview)) > 0.2) throw new Error(`picking the question did not take the previewed cut: ${before.left} - ${preview} -> ${after}`);
    const jump = await page.locator('.clock-jump').textContent();
    if (!jump.startsWith(`${before.clock} → `) || !/→ \d\d:\d\d/.test(jump)) throw new Error(`no clock jump after the action: ${jump}`);
    if (/min/.test(jump)) throw new Error(`the clock jump shows minutes: ${jump}`);
    // a point-of-care test's bar fills toward its result
    await page.getByRole('tab', { name: /Exames/ }).click();
    await page.locator('.test-search').fill('a'); // opens every group with a match
    await page.locator('.test-cats .opt', { hasText: 'resultado na consulta' }).first().click();
    const exam = '.exam-row .tbar.exam .fill';
    if (await page.locator(exam).count() !== 1) throw new Error('the pending test has no progress bar');
    const e0 = await width(exam);
    await step(10000);
    if (!(await width(exam) > e0)) throw new Error('the test bar did not fill as the clock ran');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/06b-tempo-na-tela.png` });
    console.log('✔ time on screen: patience and consultation bars drain, hover previews the cut, the action takes it and shows the clock jump');
    await page.getByRole('button', { name: '←' }).click();
    await page.getByRole('button', { name: 'Sair' }).click();
  }
  // waiting has consequences (P1-06): a green patient left waiting complains, then leaves unseen,
  // and the summary shows the departure and a lower satisfaction. UBS internal medicine always has the green cystitis case.
  // the green patient must wait while someone else is seen: restart until another patient is in the queue at 07:00
  for (let tries = 0; ; tries++) {
    await page.locator('.unit').first().click();
    await page.locator('.spec').first().click();
    await page.getByRole('button', { name: /Começar plantão/ }).click();
    await page.waitForSelector('.game');
    if (await page.evaluate(() => window.__plantao.shift.encounters.find((e) => e.arrivedAt === 0).c.triage.priority !== 'green')) break;
    if (tries >= 20) throw new Error('the green patient arrived first in 20 shifts');
    await page.evaluate(() => { location.reload(); });
    await page.waitForSelector('.unit');
  }
  const green = await page.evaluate(async () => {
    const { impatienceAt, leaveAt } = await import('./src/game/shift.js');
    const s = window.__plantao.shift;
    const g = s.encounters.find((e) => e.c.triage.priority === 'green');
    if (!g) return null;
    g.arrivedAt = 0; // waiting from 07:00
    s.waitRnd = () => 0; // every impatient patient complains, so the toast is deterministic
    return { name: g.c.patient.name, impatientAt: impatienceAt('green'), leaveAt: leaveAt('green') };
  });
  if (!green) throw new Error('UBS internal medicine has no green patient');
  await page.locator('.qcard', { hasNotText: green.name }).locator('button:not([disabled])').first().click();
  await page.getByRole('tab', { name: /Anamnese/ }).click();
  const askUntil = async (minute) => {
    await page.evaluate((m) => { const s = window.__plantao.shift; s.advance(m - 1 - s.clock); }, minute);
    await page.locator('.pane .opt').first().click(); // 2 game minutes: crosses the threshold through the UI
  };
  await askUntil(green.impatientAt);
  await page.locator('.toast', { hasText: /reclamar da demora|perguntou de novo/ }).first().waitFor();
  if (!await page.evaluate(() => window.__plantao.shift.encounters.find((e) => e.c.triage.priority === 'green').impatient)) throw new Error('green patient not impatient after its target + margin');
  await askUntil(green.leaveAt);
  await page.locator('.toast', { hasText: 'foi embora sem atendimento' }).first().waitFor();
  if (await page.locator('.qcard', { hasText: green.name }).count()) throw new Error('a patient who left is still in the queue');
  const waitCase = await page.evaluate(() => { const s = window.__plantao.shift; s.advance(s.endsAt - s.clock); return { dx: s.current.c.diagnosis.correct, cd: s.current.c.conduct.correct, satisfaction: s.satisfaction }; });
  if (waitCase.satisfaction >= 100) throw new Error('satisfaction did not drop');
  await page.getByRole('tab', { name: /Decisão/ }).click();
  await page.locator(`input[name=dx][value="${waitCase.dx}"]`).check();
  await page.locator(`input[name=cd][value="${waitCase.cd}"]`).check();
  await page.getByRole('button', { name: /Finalizar atendimento/ }).click();
  await page.waitForSelector('.modal');
  await page.locator('.modal .btn.primary').click();
  await page.waitForSelector('text=Fim de plantão', { timeout: 3000 });
  const leftLine = await page.locator('.modal li.unseen.left', { hasText: green.name }).textContent();
  if (!leftLine.includes(green.name) || !/foi embora sem atendimento às \d\d:\d\d/.test(leftLine)) throw new Error(`unexpected departure line: ${leftLine}`);
  const satLine = await page.locator('.modal li.satisfaction').textContent();
  if (!satLine.includes(`Satisfação dos pacientes: ${waitCase.satisfaction}/100`) || !/impaciente/.test(satLine) || !/reclamaç/.test(satLine)) throw new Error(`unexpected satisfaction line: ${satLine}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/07-espera-satisfacao.png` });
  console.log(`✔ waiting: ${green.name} complained and left, satisfaction ${waitCase.satisfaction}/100`);
  await page.getByRole('button', { name: /Voltar ao menu/ }).click();
  // arrival popups: non-urgent ones leave the game usable and "Depois" keeps the consultation;
  // red ones block, and "Atender agora" pauses the patient in the room with everything kept
  await page.removeLocatorHandler(arrivalCard);
  await page.locator('.unit').first().click();
  await page.locator('.spec').first().click();
  await page.getByRole('button', { name: /Começar plantão/ }).click();
  await page.waitForSelector('.game');
  await page.locator('.qcard button:not([disabled])').first().click();
  await page.getByRole('tab', { name: /Anamnese/ }).click();
  await page.locator('.pane .opt').first().click();
  await page.getByRole('tab', { name: /Exames/ }).click();
  await page.locator('.test-search').fill('glicemia capilar');
  await page.locator('.test-cat[open] .opt').first().click();
  await page.getByRole('tab', { name: /Anamnese/ }).click();
  // give the next arrivals known priorities (copies of the case, the shared data is untouched) and bring the first in
  const arr = await page.evaluate(() => {
    const s = window.__plantao.shift;
    const cur = s.current;
    const [green, red, yellow] = s.upcoming();
    const set = (e, priority, at) => { e.c = { ...e.c, triage: { ...e.c.triage, priority } }; e.arrivedAt = at; };
    set(green, 'green', s.clock + 1); set(red, 'red', s.clock + 30); set(yellow, 'yellow', s.clock + 60);
    s.advance(1);
    return { cur: cur.c.id, asked: [...cur.asked], tests: [...cur.requested.keys()], green: green.c.id, greenName: green.c.patient.name, greenAge: green.c.patient.age, greenComplaint: green.c.triage.complaint, red: red.c.id, redName: red.c.patient.name };
  });
  const nextQuestion = () => page.locator('.pane .opt').first().click(); // any clinical action announces arrivals
  await nextQuestion();
  await arrivalCard.waitFor();
  const greenText = await arrivalCard.innerText();
  if (![arr.greenName, arr.greenAge, arr.greenComplaint, 'Pouco urgente'].every((t) => greenText.includes(t))) throw new Error(`arrival popup misses triage, name, age or complaint: ${greenText}`);
  if (await page.locator('.popup-wrap.blocking').count()) throw new Error('a green arrival must not block the screen');
  await page.getByRole('tab', { name: /Exame físico/ }).click(); // the game stays usable under a non-blocking card
  if (SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/08-chegada-verde.png` }); } // after the slide-in
  await arrivalCard.getByRole('button', { name: 'Depois' }).click();
  await arrivalCard.waitFor({ state: 'detached' });
  if (await page.evaluate(() => window.__plantao.shift.current?.c.id) !== arr.cur) throw new Error('"Depois" changed the patient in the room');
  // red arrival: blocking, then "Atender agora"
  await page.evaluate(() => { const s = window.__plantao.shift; s.advance(s.upcoming()[0].arrivedAt - s.clock); });
  await page.getByRole('tab', { name: /Anamnese/ }).click();
  await nextQuestion();
  await page.locator('.popup-wrap.blocking .popup.arrival').waitFor();
  if (!(await arrivalCard.innerText()).includes(arr.redName)) throw new Error('red arrival popup shows the wrong patient');
  if (SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/09-chegada-vermelha.png` }); } // after the slide-in
  await arrivalCard.getByRole('button', { name: 'Atender agora' }).click();
  const swapped = await page.evaluate((id) => {
    const s = window.__plantao.shift;
    const paused = s.encounters.find((e) => e.c.id === id);
    return { current: s.current?.c.id, status: paused.status, asked: paused.asked.size, tests: [...paused.requested.keys()], inQueue: s.queue().includes(paused) };
  }, arr.cur);
  if (swapped.current !== arr.red || swapped.status !== 'paused' || !swapped.inQueue) throw new Error(`"Atender agora" did not swap patients: ${JSON.stringify(swapped)}`);
  if (swapped.asked < arr.asked.length + 1 || arr.tests.some((t) => !swapped.tests.includes(t))) throw new Error(`paused patient lost progress: ${JSON.stringify({ arr, swapped })}`);
  if (!(await page.locator('.qcard', { hasText: /pausad/i }).count())) throw new Error('the queue does not show the paused patient');
  // a yellow arrival goes away on its own
  await page.evaluate(() => { const s = window.__plantao.shift; s.advance(s.upcoming()[0].arrivedAt - s.clock); });
  await page.getByRole('tab', { name: /Anamnese/ }).click();
  await nextQuestion();
  await arrivalCard.waitFor();
  await arrivalCard.waitFor({ state: 'detached', timeout: 9000 });
  if (await page.evaluate(() => window.__plantao.shift.current?.c.id) !== arr.red) throw new Error('an ignored arrival changed the patient in the room');
  console.log('✔ arrival popups: details, non-blocking "Depois", auto-dismiss, red "Atender agora" pauses with progress kept');
  await page.locator('.topbar .btn.ghost').first().click(); // ←: leave the shift
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  // random events (P1-09): a system-down event scheduled on the live shift shows its popup and the effect chip,
  // and each action costs extra shift time while it lasts
  await page.removeLocatorHandler(eventCard);
  await page.locator('.unit').first().click();
  await page.locator('.spec').first().click();
  await page.getByRole('button', { name: /Começar plantão/ }).click();
  await page.waitForSelector('.game');
  await page.locator('.qcard button:not([disabled])').first().click();
  await page.getByRole('tab', { name: /Anamnese/ }).click();
  const evAt = await page.evaluate(() => {
    const s = window.__plantao.shift;
    for (const e of s.upcoming()) e.arrivedAt = s.endsAt - 1; // no arrival card in the way
    s.pendingEvents = []; // drop any rolled event: this check schedules its own
    const at = s.clock + 20;
    s.scheduleEvent('system_down', at);
    s.advance(at - 1 - s.clock);
    return at;
  });
  await page.locator('.pane .opt').first().click(); // crosses the event minute through the UI
  await eventCard.waitFor();
  const evText = await eventCard.innerText();
  if (!/sistema do prontuário caiu/.test(evText) || !/Sistema fora do ar até \d\d:\d\d/.test(evText)) throw new Error(`unexpected event popup: ${evText}`);
  if (/\d+\s*min\b/.test(evText)) throw new Error(`event popup shows scaled minutes: ${evText}`);
  if (await page.locator('.popup-wrap.blocking').count()) throw new Error('an event popup must not block the screen');
  const chip = page.locator('.topbar .chip.effect', { hasText: /Sistema fora do ar até/ });
  await chip.waitFor();
  if (SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/10-imprevisto.png` }); }
  await eventCard.getByRole('button', { name: 'Entendi' }).click();
  await eventCard.waitFor({ state: 'detached' });
  const t0 = await page.evaluate(() => window.__plantao.shift.clock);
  await page.locator('.pane .opt').first().click();
  const t1 = await page.evaluate(() => window.__plantao.shift.clock);
  if (t1 - t0 !== 3) throw new Error(`a question during the system-down event advanced the clock by ${t1 - t0}, expected 3`);
  await page.evaluate(() => { const s = window.__plantao.shift; s.advance(s.activeEffects()[0].until - s.clock); });
  await page.locator('.pane .opt').first().click();
  if (await chip.count()) throw new Error('the effect chip stays after the event ends');
  // a loss the event caused shows in the summary but does not count in the bonus
  const evEnd = await page.evaluate(() => {
    const s = window.__plantao.shift;
    s.changeSatisfaction(-15, 'impatient', s.encounters[1], { excused: 'system_down' });
    s.advance(s.endsAt - s.clock);
    return { dx: s.current.c.diagnosis.correct, cd: s.current.c.conduct.correct };
  });
  await page.getByRole('tab', { name: /Decisão/ }).click();
  await page.locator(`input[name=dx][value="${evEnd.dx}"]`).check();
  await page.locator(`input[name=cd][value="${evEnd.cd}"]`).check();
  await page.getByRole('button', { name: /Finalizar atendimento/ }).click();
  await page.waitForSelector('.modal');
  await page.locator('.modal .btn.primary').click();
  await page.waitForSelector('text=Fim de plantão', { timeout: 3000 });
  const evSat = await page.locator('.modal li.satisfaction').textContent();
  if (!/Satisfação dos pacientes: 85\/100/.test(evSat) || !/15 pontos atribuídos ao imprevisto \(não contam no bônus\)/.test(evSat) || !/\+10$/.test(evSat.trim())) throw new Error(`unexpected satisfaction line after an event: ${evSat}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/11-imprevisto-resumo.png` });
  console.log(`✔ random event: "system_down" at ${evAt}, popup, chip, slower actions, excused loss in the summary`);
  await page.getByRole('button', { name: /Voltar ao menu/ }).click();
  // next step (P2-01): one highlighted action per state, empty states say what to do, a result toast opens the results
  await page.locator('.unit').nth(1).click(); // UPA: lab results come back during the shift
  await page.locator('.spec').first().click();
  await page.getByRole('button', { name: /Começar plantão/ }).click();
  await page.waitForSelector('.game');
  await page.evaluate(() => {
    const s = window.__plantao.shift;
    s.pendingEvents = [];
    for (const e of s.upcoming()) e.arrivedAt = s.endsAt - 1; // patients arrive only when this check brings them in
  });
  // bring the next upcoming patient in now; `calm` makes them green, `quiet` skips their arrival card
  const bringIn = (opts) => page.evaluate(({ calm, quiet }) => {
    const s = window.__plantao.shift;
    const e = s.upcoming()[0];
    if (calm) e.c = { ...e.c, triage: { ...e.c.triage, priority: 'green' } }; // a copy: the shared case data is untouched
    e.arrivedAt = s.clock;
    e._arrivalNotified = !!quiet;
    window.__plantao.clock.step(10000); // one shift minute: the screen picks the arrival up
    return e.c.id;
  }, opts);
  await expectStep('call', 'room free, a patient waiting');
  if (!/Chame para começar/.test(await page.locator('.free-room-hint').textContent())) throw new Error('the free room does not say to call the next patient');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/12a-next-call.png` });
  await page.locator('[data-step=call]').click();
  await expectStep('tab:triage', 'patient just called');
  if (!/Siga com o atendimento/.test(await page.locator('.queue .empty').textContent())) throw new Error('the empty queue does not say what to do');
  await page.getByRole('tab', { name: /Anamnese/ }).click();
  await expectStep('tab:history', 'anamnese not started');
  await page.locator('.pane .opt').first().click();
  await expectStep('tab:physical', 'physical exam not started');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/12e-next-tab.png` });
  await page.getByRole('tab', { name: /Exame físico/ }).click();
  await page.locator('.pane .opt').first().click();
  await expectStep('decide', 'enough gathered');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/12b-next-decide.png` });
  await page.getByRole('tab', { name: /Exames/ }).click();
  await page.evaluate(() => document.querySelectorAll('.test-cat').forEach((d) => { d.open = true; }));
  await page.locator('.pane .opt', { hasText: '· laboratório' }).first().click();
  await expectStep('wait-here', 'a test still out and no one else to see');
  await page.locator('[data-step=send-wait]').click();
  await expectStep('wait-next', 'room free, no one to call yet');
  if (!/Aguardar próximo/.test(await page.locator('.free-room-hint').textContent())) throw new Error('the free room does not say how to move on');
  await bringIn({ quiet: true });
  await expectStep('call', 'a new patient waiting');
  await page.locator('[data-step=call]').click();
  const p2 = await page.evaluate(() => window.__plantao.shift.current.c.id);
  await page.evaluate(() => { const s = window.__plantao.shift; const e = s.encounters[0]; s.advance(Math.max(...[...e.requested.values()].map((r) => r.readyAt)) - s.clock); });
  await page.getByRole('tab', { name: /Anamnese/ }).click();
  await page.locator('.pane .opt').first().click(); // any action announces the results
  const resultToast = page.locator('.toast.clickable', { hasText: /^Resultados de .* Clique para abrir\.$/ });
  await resultToast.first().waitFor();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/12c-next-result-toast.png` });
  await resultToast.first().click();
  const opened = await page.evaluate(() => { const s = window.__plantao.shift; return { cur: s.current?.c.id, first: s.encounters[0].c.id, tab: document.querySelector('.tab.active')?.dataset.step, paused: s.encounters.filter((e) => e.status === 'paused').map((e) => e.c.id) }; });
  if (opened.cur !== opened.first || opened.tab !== 'tab:tests' || opened.paused.join() !== p2) throw new Error(`the result toast did not open that patient's results: ${JSON.stringify(opened)}`);
  await expectStep('decide', 'results opened, enough gathered');
  await page.locator('[data-step=decide]').click();
  await expectStep('finish', 'decision tab');
  const finishRight = async () => {
    const d = await page.evaluate(() => { const c = window.__plantao.shift.current.c; return { dx: c.diagnosis.correct, cd: c.conduct.correct }; });
    await page.locator(`input[name=dx][value="${d.dx}"]`).check();
    await page.locator(`input[name=cd][value="${d.cd}"]`).check();
    await page.locator('[data-step=finish]').click();
    await page.waitForSelector('.modal-back.feedback');
    await expectStep('feedback-next', 'feedback');
    await page.locator('[data-step=feedback-next]').click();
  };
  await finishRight();
  await expectStep('call', 'a paused patient in the queue');
  if (!/Retomar atendimento/.test(await page.locator('[data-step=call]').textContent())) throw new Error('the call button does not say it resumes the paused patient');
  if (!/pausado/.test(await page.locator('.free-room-hint').textContent())) throw new Error('the free room does not say the patient is paused');
  await page.getByRole('button', { name: /Pausar/ }).click();
  await expectStep('continue', 'pause screen');
  await page.locator('[data-step=continue]').click();
  await bringIn({ calm: true });
  await arrivalCard.waitFor();
  await expectStep('attend', 'arrival with the room free');
  await arrivalCard.getByRole('button', { name: 'Depois' }).click();
  await arrivalCard.waitFor({ state: 'detached' });
  await page.locator('[data-step=call]').click();
  if (await page.evaluate(() => window.__plantao.shift.current?.c.id) !== p2) throw new Error('"Retomar atendimento" did not resume the paused patient');
  await bringIn({ calm: true });
  await arrivalCard.waitFor();
  await expectStep('later', 'calm arrival during a consultation');
  if (SHOTS) { await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}/12d-next-arrival-later.png` }); }
  await arrivalCard.getByRole('button', { name: 'Depois' }).click();
  await arrivalCard.waitFor({ state: 'detached' });
  // end of the shift: the summary takes the step
  await page.evaluate(() => { const s = window.__plantao.shift; s.advance(s.endsAt - s.clock); });
  await page.getByRole('tab', { name: /Decisão/ }).click();
  await finishRight();
  await page.waitForSelector('.modal-back.summary', { timeout: 3000 });
  await expectStep('summary-menu', 'shift summary');
  // calm by default, no animation; the tutorial switch (P2-04) makes it stronger
  const look = await page.evaluate(() => {
    const el = document.querySelector('.next-step');
    const calm = getComputedStyle(el);
    window.__plantao.setNextStepEmphasis(true);
    const strong = getComputedStyle(el).outlineWidth;
    window.__plantao.setNextStepEmphasis(false);
    return { calm: calm.outlineWidth, anim: calm.animationName, strong };
  });
  if (look.calm !== '2px' || look.anim !== 'none' || look.strong !== '3px') throw new Error(`next-step highlight: ${JSON.stringify(look)}`);
  console.log('✔ next step: one highlight per state (call, triage, anamnese, physical, decide, finish, wait, feedback, paused, pause, arrival, summary); result toast opens the results');
  await page.locator('[data-step=summary-menu]').click();
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
