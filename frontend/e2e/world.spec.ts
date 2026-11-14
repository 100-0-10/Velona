import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { PNG } from 'pngjs';
import type { WorldSnapshot } from '../src/types';

type TestState = { snapshot: WorldSnapshot | null; status: string; diagnostics: Record<string, number> | null };

async function state(page: Page): Promise<TestState> {
  return page.evaluate(() => (window as unknown as { __VELONA_TEST_STATE__: TestState }).__VELONA_TEST_STATE__);
}

async function joined(page: Page, name: string) {
  await page.goto('/');
  await page.getByTestId('guest-name').fill(name);
  await page.getByTestId('join-world').click();
  await expect.poll(async () => (await state(page))?.status, { timeout: 20_000 }).toBe('connected');
  await expect(page.getByTestId('world-canvas')).toBeVisible();
}

async function position(page: Page) {
  const snapshot = (await state(page)).snapshot!;
  return snapshot.players.find(p => p.id === snapshot.selfPlayerId)!;
}

async function inventory(page: Page, itemId: string) {
  return (await state(page)).snapshot?.inventory.find(i => i.itemId === itemId)?.quantity ?? 0;
}

async function release(page: Page) {
  for (const key of ['w', 'a', 's', 'd']) await page.keyboard.up(key);
}

// Drive only actual keyboard input; test diagnostics are read-only observations.
async function walkTo(page: Page, target: { x: number; z: number }, radius = .5) {
  await page.getByTestId('world-canvas').click({ position: { x: 40, y: 40 } });
  const deadline = Date.now() + 18_000;
  let held = new Set<string>();
  try {
    while (Date.now() < deadline) {
      const p = await position(page);
      if (p.isDowned) throw new Error('Explorer was downed while walking.');
      const dx = target.x - p.x; const dz = target.z - p.z;
      if (Math.hypot(dx, dz) <= radius) return;
      // Inverse of the client quarter-view movement basis.
      const h = dx - dz; const v = dx + dz;
      const next = new Set<string>();
      if (Math.abs(h) > .15) next.add(h > 0 ? 'd' : 'a');
      if (Math.abs(v) > .15) next.add(v > 0 ? 's' : 'w');
      for (const key of held) if (!next.has(key)) await page.keyboard.up(key);
      for (const key of next) if (!held.has(key)) await page.keyboard.down(key);
      held = next;
      await page.waitForTimeout(90);
    }
    throw new Error(`Could not walk to (${target.x}, ${target.z}); got ${JSON.stringify(await position(page))}`);
  } finally { await release(page); }
}

async function craft(page: Page, recipeId: string, outputId: string, maxSeconds = 20) {
  const before = await inventory(page, outputId);
  await page.getByTestId(`craft-${recipeId}`).click();
  await expect.poll(() => inventory(page, outputId), { timeout: maxSeconds * 1000 }).toBeGreaterThan(before);
}

async function gatherOption(page: Page, optionId: string) {
  const previous = (await state(page)).snapshot?.gathering?.id;
  await page.getByTestId('gather-option-' + optionId).click();
  await expect.poll(async () => (await state(page)).snapshot?.gathering?.id).not.toBe(previous);
  await expect.poll(async () => (await state(page)).snapshot?.gathering?.state, { timeout: 12000 }).toBe('completed');
}

async function screenshotAndPixels(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  const canvas = page.getByTestId('world-canvas');
  const image = PNG.sync.read(await canvas.screenshot());
  const colors = new Set<number>();
  let min = 255; let max = 0;
  for (let pixel = 0; pixel < image.width * image.height; pixel += 101) {
    const i = pixel * 4;
    const r = image.data[i]; const g = image.data[i + 1]; const b = image.data[i + 2];
    colors.add((r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3));
    const light = (r + g + b) / 3; min = Math.min(min, light); max = Math.max(max, light);
  }
  expect(image.width).toBeGreaterThan(100); expect(image.height).toBeGreaterThan(100);
  expect(colors.size).toBeGreaterThan(30); expect(max - min).toBeGreaterThan(40);
  await info.attach(name, { path, contentType: 'image/png' });
  await info.attach(`${name}-metrics`, { body: JSON.stringify({ width: image.width, height: image.height, quantizedColors: colors.size, luminanceRange: max - min, diagnostics: (await state(page)).diagnostics }, null, 2), contentType: 'application/json' });
}

test('two browser identities share movement and chat without typing moving the explorer', async ({ browser }, info) => {
  // CI renders both WebGL views in software; include screenshot readback and context shutdown.
  test.setTimeout(90_000);
  const first = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const second = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const a = await first.newPage(); const b = await second.newPage();
  const errors: string[] = [];
  a.on('pageerror', e => errors.push(e.message)); b.on('pageerror', e => errors.push(e.message));
  try {
    await joined(a, '개척자 하나'); await joined(b, '개척자 둘');
    const aId = (await state(a)).snapshot!.selfPlayerId;
    const bId = (await state(b)).snapshot!.selfPlayerId;
    expect(aId).not.toBe(bId);
    await expect.poll(async () => (await state(b)).snapshot!.players.some(p => p.id === aId)).toBeTruthy();
    await walkTo(a, { x: 3.5, z: -1 });
    await expect.poll(async () => (await state(b)).snapshot!.players.find(p => p.id === aId)?.x ?? 0).toBeGreaterThan(2.5);
    const before = await position(a);
    await a.getByTestId('chat-input').fill('wasd 함께 개척해요');
    await a.getByTestId('chat-send').click();
    await expect(b.getByText('wasd 함께 개척해요')).toBeVisible();
    await a.waitForTimeout(400);
    const after = await position(a);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(.6);
    await screenshotAndPixels(a, info, 'desktop-multiplayer');
    expect(errors).toEqual([]);
  } finally { await first.close(); await second.close(); }
});

test('real UI hunt, harvest, tanning, drying and binding produces the first bag', async ({ page }, info) => {
  test.setTimeout(210_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await joined(page, '가방 만드는 개척자');
  // Take the open path around the bark tree's authoritative collision proxy.
  await walkTo(page, { x: 7.5, z: 4.5 });
  const huntDeadline = Date.now() + 30_000;
  while (Date.now() < huntDeadline) {
    const s = (await state(page)).snapshot!; const boar = s.monsters[0];
    if (boar.state === 'dead') break;
    const p = await position(page);
    if (p.isDowned) { await page.getByTestId('respawn').click(); await walkTo(page, { x: 7.5, z: 4.5 }); }
    await page.keyboard.press('Space'); await page.waitForTimeout(1250);
  }
  await expect.poll(async () => (await state(page)).snapshot!.monsters[0].state).toBe('dead');
  const corpse = (await state(page)).snapshot!.monsters[0];
  await walkTo(page, corpse, 2.1);
  await page.keyboard.press('e');
  await expect(page.getByTestId('gather-panel')).toBeVisible();
  await page.screenshot({ path: info.outputPath('gathering-material-list.png') });
  await expect(page.getByTestId('gather-option-signature')).toBeDisabled();
  await page.getByTestId('gather-option-hide').click();
  await expect(page.getByTestId('gathering-progress')).toBeVisible();
  expect(await inventory(page, 'raw_hide')).toBe(0);
  await expect.poll(() => inventory(page, 'raw_hide')).toBeGreaterThanOrEqual(3);

  // Visit each resource explicitly; an arrival tolerance must not put bark out of range.
  await walkTo(page, { x: 4.5, z: 4.5 });
  await walkTo(page, { x: 4.4, z: -2 }, .25);
  await page.keyboard.press('e');
  const fiberDeadline = Date.now() + 30_000;
  while (Date.now() < fiberDeadline && (await inventory(page, 'fiber')) < 8) {
    await gatherOption(page, 'fiber');
  }
  await walkTo(page, { x: 4.5, z: 2 }, .15);
  await page.keyboard.press('e');
  const barkDeadline = Date.now() + 22_000;
  while (Date.now() < barkDeadline && (await inventory(page, 'bark')) < 6) {
    await gatherOption(page, 'bark');
  }
  expect(await inventory(page, 'fiber')).toBeGreaterThanOrEqual(8);
  expect(await inventory(page, 'bark')).toBeGreaterThanOrEqual(6);
  await walkTo(page, { x: 0, z: 0 });
  await page.getByTestId('open-craft').click();
  for (let i = 0; i < 4; i++) await craft(page, 'cord_hand', 'cord');
  for (let i = 0; i < 3; i++) await craft(page, 'bark_powder', 'bark_powder');
  for (let i = 0; i < 3; i++) await craft(page, 'trim_hide', 'trim_hide');
  for (let i = 0; i < 3; i++) await craft(page, 'tan', 'wet_leather');
  for (let i = 0; i < 3; i++) await craft(page, 'dry_leather', 'leather');
  await craft(page, 'bag', 'small_bag');
  expect(await inventory(page, 'small_bag')).toBe(1);
  expect(await inventory(page, 'leather')).toBe(0);
  expect(await inventory(page, 'cord')).toBe(0);
  await screenshotAndPixels(page, info, 'desktop-first-bag');
  await page.reload();
  await expect.poll(async () => (await state(page))?.status, { timeout: 20_000 }).toBe('connected');
  expect(await inventory(page, 'small_bag')).toBe(1);
  expect(errors).toEqual([]);
});

test('selection waits for work and movement or cancel never grants materials', async ({ page }, info) => {
  await joined(page, '채집 확인 개척자');
  await walkTo(page, { x: 4.4, z: -2 }, .25);
  await page.keyboard.press('e');
  await expect(page.getByTestId('gather-panel')).toBeVisible();
  expect(await inventory(page, 'fiber')).toBe(0);
  await expect(page.getByTestId('gather-option-herb')).toBeDisabled();
  await page.getByTestId('gather-option-fiber').click();
  await expect(page.getByTestId('gathering-progress')).toBeVisible();
  expect(await inventory(page, 'fiber')).toBe(0);
  await page.keyboard.down('a'); await page.waitForTimeout(180); await page.keyboard.up('a');
  await expect.poll(async () => (await state(page)).snapshot?.gathering?.state).toBe('cancelled');
  expect(await inventory(page, 'fiber')).toBe(0);
  await page.getByTestId('gather-option-fiber').click();
  await page.getByTestId('cancel-gather').click();
  await expect.poll(async () => (await state(page)).snapshot?.gathering?.state).toBe('cancelled');
  expect(await inventory(page, 'fiber')).toBe(0);
  await screenshotAndPixels(page, info, 'gathering-selection');
});

test('narrow screen keeps a visible nonblank world and usable entry', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await joined(page, '작은 화면 개척자');
  const bounds = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.viewport + 1);
  await screenshotAndPixels(page, info, 'mobile-layout');
  await walkTo(page, { x: 4.4, z: -2 }, .25);
  await page.keyboard.press('e');
  await expect(page.getByTestId('gather-panel')).toBeVisible();
  await page.getByTestId('gather-option-fiber').click();
  await expect(page.getByTestId('gathering-progress')).toBeVisible();
  await screenshotAndPixels(page, info, 'mobile-gathering');
});
