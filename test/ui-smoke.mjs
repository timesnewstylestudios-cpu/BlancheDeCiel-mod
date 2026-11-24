import { chromium } from 'playwright-core';

const base = process.env.BDC_URL || 'http://127.0.0.1:4176/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
await page.goto(base, { waitUntil: 'networkidle' });

const panes = ['ai', 'import', 'grid', 'unix', 'backpack', 'settings', 'help'];
for (const pane of panes) {
  await page.click(`button[data-pane="${pane}"]`);
  await page.waitForSelector(`[data-tool-panel="${pane}"]:not([hidden])`);
}
const toolTabs = await page.$eval('#tool-tabs', (el) => el.childElementCount);
if (toolTabs !== 0) errors.push(`tool tabs ${toolTabs}`);
const labels = await page.$$eval('#tabs button', (els) => els.map((el) => el.textContent));
if (new Set(labels).size !== labels.length) errors.push(`duplicate tabs ${labels.join(',')}`);

await page.click('button[data-pane="settings"]');
await page.selectOption('#theme', 'dark');
const theme = await page.evaluate(() => document.documentElement.dataset.theme);
if (theme !== 'dark') errors.push(`theme ${theme}`);
await page.selectOption('#theme', 'contrast');
await page.selectOption('#theme', 'light');
if (await page.$('#api-key')) errors.push('key field');
if (await page.$('[data-x-login]')) errors.push('x login');

await page.click('#code-in');
const zoom = await page.$eval('#scripts', (el) => el.style.zoom);
if (Number(zoom) <= 1) errors.push(`zoom ${zoom}`);
const splits = await page.$$eval('.split', (els) => els.length);
if (splits < 3) errors.push(`splits ${splits}`);

await page.click('button[data-category="neural"]');
const before = await page.$$eval('.workspace .block', (els) => els.length);
await page.$eval('#palette [data-opcode="nnnew"]', (el) => el.click());
const after = await page.$$eval('.workspace .block', (els) => els.length);
if (after <= before) errors.push(`nnnew ${before} -> ${after}`);

await page.click('button[data-pane="ai"]');
await page.click('#ai-local');
const suggestion = await page.$eval('#ai-output', (el) => el.value);
if (!suggestion.includes('sprite')) errors.push(suggestion);
await page.click('#ai-apply');
const status = await page.$eval('#ai-status', (el) => el.textContent);
if (!status.includes('eingesetzt')) errors.push(status);

const download = page.waitForEvent('download');
await page.click('#export');
const file = await download;
if (!file.suggestedFilename().endsWith('.sb3')) errors.push(file.suggestedFilename());
await page.click('button[data-pane="unix"]');
await page.click('#shell-run');
await page.waitForFunction(() => document.querySelector('#shell-out').textContent.includes('schreibbar'));

await page.setViewportSize({ width: 390, height: 800 });
await page.click('button[data-pane="blocks"]');
await page.click('button[data-pane="scripts"]');
await page.click('button[data-pane="stage"]');
const mobileTools = await page.$eval('#tool-tabs', (el) => el.childElementCount);
if (mobileTools !== 0) errors.push('mobile tool tabs');

console.log(JSON.stringify({ errors, status, zoom, splits }, null, 2));
await browser.close();
if (errors.length) process.exit(1);
