import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.env.BDC_URL || 'http://127.0.0.1:4178/';
const shots = '/opt/cursor/artifacts';
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const errors = [];

async function skipTour(page) {
  if (await page.$('#tour:not([hidden])')) await page.click('#tour-skip');
}

function places(page) {
  return page.$$eval('.script-card', (els) => els.map((el) => `${el.style.left},${el.style.top}`));
}

async function swipe(page, x, y, dx, dy) {
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let step = 1; step <= 8; step += 1) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + (dx * step) / 8, y: y + (dy * step) / 8, id: 1 }],
    });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
}

const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await desk.goto(base, { waitUntil: 'networkidle' });
await skipTour(desk);
const spot = await desk.evaluate(() => {
  const workspace = document.querySelector('#workspace');
  const rect = workspace.getBoundingClientRect();
  for (let y = rect.bottom - 80; y > rect.top + 20; y -= 12) {
    for (let x = rect.left + 24; x < rect.right - 40; x += 16) {
      const hit = document.elementFromPoint(x, y);
      if (hit && hit.closest('#workspace') && !hit.closest('article.block, button, header')) return { x, y };
    }
  }
  return { x: rect.left + 30, y: rect.top + rect.height / 2 };
});
const beforeCards = await places(desk);
const before = await desk.$eval('#workspace', (el) => ({ l: el.scrollLeft, t: el.scrollTop }));
await desk.mouse.move(spot.x, spot.y);
await desk.mouse.wheel(0, 240);
const wheeled = await desk.$eval('#workspace', (el) => ({ l: el.scrollLeft, t: el.scrollTop }));
if (wheeled.t <= before.t) errors.push(`wheel ${before.t}->${wheeled.t}`);
await desk.keyboard.down('Shift');
await desk.mouse.wheel(0, 240);
await desk.keyboard.up('Shift');
const shifted = await desk.$eval('#workspace', (el) => el.scrollLeft);
if (shifted <= wheeled.l) errors.push(`shift-wheel ${wheeled.l}->${shifted}`);
const panFrom = await desk.$eval('#workspace', (el) => ({ l: el.scrollLeft, t: el.scrollTop }));
await desk.mouse.move(spot.x, spot.y);
await desk.mouse.down();
await desk.mouse.move(spot.x - 80, spot.y - 70, { steps: 8 });
await desk.mouse.up();
const panned = await desk.$eval('#workspace', (el) => ({ l: el.scrollLeft, t: el.scrollTop }));
if (panned.l <= panFrom.l || panned.t <= panFrom.t) errors.push(`pan ${JSON.stringify(panFrom)}->${JSON.stringify(panned)}`);
const afterCards = await places(desk);
if (afterCards.join('|') !== beforeCards.join('|')) errors.push('blocks moved while panning');
const bar = await desk.locator('#workspace').boundingBox();
const barBefore = await desk.$eval('#workspace', (el) => el.scrollTop);
await desk.mouse.move(bar.x + bar.width - 8, bar.y + 60);
await desk.mouse.down();
await desk.mouse.move(bar.x + bar.width - 8, bar.y + 180, { steps: 8 });
await desk.mouse.up();
const barAfter = await desk.$eval('#workspace', (el) => el.scrollTop);
if (barAfter <= barBefore) errors.push(`scrollbar ${barBefore}->${barAfter}`);
const holdBefore = await desk.$eval('#workspace', (el) => el.scrollTop);
await desk.evaluate(() => {
  const button = document.querySelector('#scroll-down');
  button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 3, pointerType: 'mouse', button: 0 }));
});
await desk.waitForTimeout(450);
await desk.evaluate(() => document.querySelector('#scroll-down').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 3, pointerType: 'mouse', button: 0 })));
const held = await desk.$eval('#workspace', (el) => el.scrollTop);
if (held < holdBefore + 300) errors.push(`hold ${holdBefore}->${held}`);
const paletteRoom = await desk.$eval('#palette', (el) => el.scrollHeight - el.clientHeight);
const paletteBefore = await desk.$eval('#palette', (el) => el.scrollTop);
const paletteBox = await desk.locator('#palette').boundingBox();
await desk.mouse.move(paletteBox.x + 40, paletteBox.y + 80);
await desk.mouse.wheel(0, 280);
const paletteAfter = await desk.$eval('#palette', (el) => el.scrollTop);
if (paletteRoom > 20 && paletteAfter <= paletteBefore) errors.push(`palette wheel ${paletteBefore}->${paletteAfter} room ${paletteRoom}`);
await desk.screenshot({ path: `${shots}/scroll-desktop.png` });

const phone = await browser.newPage({
  viewport: { width: 412, height: 915 },
  hasTouch: true,
  isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
});
await phone.goto(base, { waitUntil: 'networkidle' });
await skipTour(phone);
await phone.click('button[data-pane="code"]');
const phoneSpot = await phone.evaluate(() => {
  const workspace = document.querySelector('#workspace');
  const rect = workspace.getBoundingClientRect();
  if (rect.height < 80) return null;
  for (let y = rect.bottom - 70; y > rect.top + 16; y -= 10) {
    for (let x = rect.left + 16; x < rect.right - 36; x += 14) {
      const hit = document.elementFromPoint(x, y);
      if (hit && hit.closest('#workspace') && !hit.closest('article.block, button, header, #scroll-pad')) return { x, y, h: rect.height };
    }
  }
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, h: rect.height };
});
if (!phoneSpot) errors.push('phone workspace not visible');
else {
  const cards = await places(phone);
  const top = await phone.$eval('#workspace', (el) => el.scrollTop);
  await swipe(phone, phoneSpot.x, phoneSpot.y, 0, -220);
  const next = await phone.$eval('#workspace', (el) => el.scrollTop);
  if (next <= top) errors.push(`touch pan ${top}->${next} h=${phoneSpot.h}`);
  const cardsAfter = await places(phone);
  if (cardsAfter.join('|') !== cards.join('|')) errors.push('touch pan moved blocks');
  const thumb = await phone.$eval('#scroll-down', (el) => el.getBoundingClientRect().height);
  if (thumb < 24) errors.push(`thumb ${thumb}`);
  const paletteTop = await phone.$eval('#palette', (el) => el.scrollTop);
  const block = await phone.locator('#palette .block').first().boundingBox();
  if (block) {
    await swipe(phone, block.x + 20, block.y + 12, 0, -160);
    const paletteNext = await phone.$eval('#palette', (el) => el.scrollTop);
    if (paletteNext <= paletteTop) errors.push(`palette touch ${paletteTop}->${paletteNext}`);
  } else errors.push('no palette block');
}
await phone.screenshot({ path: `${shots}/scroll-mobile.png` });

console.log(JSON.stringify({ errors, phoneSpot }, null, 2));
await browser.close();
if (errors.length) process.exit(1);
