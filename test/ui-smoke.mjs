import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.env.BDC_URL || 'http://127.0.0.1:4177/';
const shots = '/opt/cursor/artifacts';
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
await page.goto(base, { waitUntil: 'networkidle' });
if (await page.$('#tour:not([hidden])')) await page.click('#tour-skip');
await page.screenshot({ path: `${shots}/ui-classic.png` });

await page.click('#menu-view');
await page.click('[data-format="stage"]');
await page.screenshot({ path: `${shots}/ui-stage-large.png` });
await page.click('#menu-view');
await page.click('[data-format="classic"]');

for (const pane of ['ai', 'import', 'grid', 'unix', 'backpack', 'settings']) {
  await page.click('#menu-ext');
  await page.click(`button[data-pane="${pane}"]`);
  await page.waitForSelector(`[data-tool-panel="${pane}"]:not([hidden])`);
}
await page.click('#menu-help');
await page.click('button[data-pane="help"]');
await page.waitForSelector('[data-tool-panel="help"]:not([hidden])');
const toolTabs = await page.$eval('#tool-tabs', (el) => el.childElementCount);
if (toolTabs !== 0) errors.push(`tool tabs ${toolTabs}`);

await page.click('#menu-view');
await page.selectOption('#theme', 'dark');
const theme = await page.evaluate(() => document.documentElement.dataset.theme);
if (theme !== 'dark') errors.push(`theme ${theme}`);
await page.selectOption('#theme', 'light');
await page.click('[data-blocks="flat"]');
if (await page.evaluate(() => document.documentElement.dataset.blocks) !== 'flat') errors.push('blocks');
await page.click('#menu-view');
await page.click('[data-blocks="normal"]');

await page.click('#code-in');
const zoom = await page.$eval('#scripts', (el) => el.style.zoom);
const label = await page.$eval('#zoom-label', (el) => el.textContent);
if (Number(zoom) <= 1) errors.push(`zoom ${zoom}`);
if (!label.includes('%')) errors.push(`label ${label}`);
await page.click('#code-reset');
if (await page.$eval('#zoom-label', (el) => el.textContent) !== '100%') errors.push('reset');
const splits = await page.$$eval('.split', (els) => els.length);
if (splits < 3) errors.push(`splits ${splits}`);

await page.click('button[data-category="neural"]');
const before = await page.$$eval('.workspace .block', (els) => els.length);
await page.$eval('#palette [data-opcode="nnnew"]', (el) => el.click());
const after = await page.$$eval('.workspace .block', (els) => els.length);
if (after <= before) errors.push(`nnnew ${before} -> ${after}`);

await page.click('#menu-ext');
await page.click('button[data-pane="ai"]');
await page.click('#ai-local');
const suggestion = await page.$eval('#ai-output', (el) => el.value);
if (!suggestion.includes('sprite')) errors.push(suggestion);
await page.click('#ai-apply');
const status = await page.$eval('#ai-status', (el) => el.textContent);
if (!status.includes('eingesetzt')) errors.push(status);

await page.click('#menu-file');
const download = page.waitForEvent('download');
await page.click('#export');
const file = await download;
if (!file.suggestedFilename().endsWith('.sb3')) errors.push(file.suggestedFilename());

await page.click('#menu-ext');
await page.click('button[data-pane="unix"]');
await page.click('#shell-run');
await page.waitForFunction(() => document.querySelector('#shell-out').textContent.includes('schreibbar'));

await page.click('button[data-category="motion"]');
const say = await page.locator('#palette [data-opcode="move"]').boundingBox();
const workspace = await page.locator('#workspace').boundingBox();
const beforeDrag = await page.locator('.workspace article.block').count();
await page.mouse.move(say.x + 16, say.y + 12);
await page.mouse.down();
await page.mouse.move(workspace.x + 180, workspace.y + 200, { steps: 12 });
await page.screenshot({ path: `${shots}/drag-ghost.png` });
await page.mouse.up();
const afterDrag = await page.locator('.workspace article.block').count();
if (afterDrag <= beforeDrag) errors.push(`drag ${beforeDrag}->${afterDrag}`);
await page.screenshot({ path: `${shots}/drag-dropped.png` });
const touchAdded = await page.evaluate(() => {
  const before = document.querySelectorAll('.workspace article.block').length;
  const el = document.querySelector('#palette [data-opcode="turn"]');
  const from = el.getBoundingClientRect();
  const to = document.querySelector('#workspace').getBoundingClientRect();
  const root = document.querySelector('#app');
  const event = (type, x, y, target) => target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'touch', button: 0,
  }));
  event('pointerdown', from.x + 10, from.y + 10, el);
  event('pointermove', to.x + 220, to.y + 240, root);
  event('pointerup', to.x + 220, to.y + 240, root);
  return document.querySelectorAll('.workspace article.block').length - before;
});
if (touchAdded < 1) errors.push(`touch drag ${touchAdded}`);
await page.click('#tidy');
await page.click('#stage-large');
const stageZoom = await page.$eval('#stage-mount', (el) => el.style.zoom);
if (Number(stageZoom) < 1.2) errors.push(`stage ${stageZoom}`);

const phone = await browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true });
await phone.goto(base, { waitUntil: 'networkidle' });
if (await phone.$('#tour:not([hidden])')) await phone.click('#tour-skip');
await phone.click('button[data-pane="code"]');
await phone.click('button[data-pane="stage"]');
await phone.click('button[data-pane="sprites"]');
await phone.screenshot({ path: `${shots}/ui-mobile.png` });
const mobileTools = await phone.$eval('#tool-tabs', (el) => el.childElementCount);
if (mobileTools !== 0) errors.push('mobile tool tabs');

console.log(JSON.stringify({ errors, status, zoom, label, splits, stageZoom }, null, 2));
await browser.close();
if (errors.length) process.exit(1);
