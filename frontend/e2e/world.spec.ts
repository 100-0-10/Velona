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
  await expect.poll(async () => (await state(page)).diagnostics?.charactersReady ?? 0, { timeout: 20_000 }).toBeGreaterThan(0);
  expect((await state(page)).diagnostics?.characterErrors).toBe(0);
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

async function settledGatheringPanel(page: Page) {
  const panel = page.getByTestId('gather-panel');
  await expect(panel).toBeVisible();
  await expect.poll(() => panel.evaluate(element => element.getAnimations().some(animation => animation.playState === 'running'))).toBe(false);
  return panel;
}

// Drive only actual keyboard input; test diagnostics are read-only observations.
async function walkTo(page: Page, target: { x: number; z: number }, radius = .5) {
  await page.getByTestId('world-canvas').click({ position: { x: 40, y: 40 } });
  const deadline = Date.now() + 35_000;
  try {
    while (Date.now() < deadline) {
      const p = await position(page);
      if (p.isDowned) throw new Error('Explorer was downed while walking.');
      const dx = target.x - p.x; const dz = target.z - p.z;
      if (Math.hypot(dx, dz) <= radius) {
        // Release actual keys and let the final input/snapshot roundtrip settle
        // before interacting. Software-rendered frames can delay key handling.
        await release(page); await page.waitForTimeout(180);
        const settled = await position(page);
        if (Math.hypot(target.x - settled.x, target.z - settled.z) <= radius + .18) return;
        continue;
      }
      // Inverse of the client quarter-view movement basis.
      const h = dx - dz; const v = dx + dz;
      const next = new Set<string>();
      if (Math.abs(h) > .15) next.add(h > 0 ? 'd' : 'a');
      if (Math.abs(v) > .15) next.add(v > 0 ? 's' : 'w');
      // Bounded real key pulses let the zero-input/snapshot roundtrip finish
      // even when a software-rendered frame delays browser event processing.
      for (const key of next) await page.keyboard.down(key);
      await page.waitForTimeout(90);
      await release(page);
      await page.waitForTimeout(180);
    }
    throw new Error(`Could not walk to (${target.x}, ${target.z}); got ${JSON.stringify(await position(page))}`);
  } finally { await release(page); }
}

async function craft(page: Page, recipeId: string, outputId: string, maxSeconds = 20) {
  const before = await inventory(page, outputId);
  await page.getByTestId(`craft-${recipeId}`).click();
  await expect.poll(() => inventory(page, outputId), { timeout: maxSeconds * 1000 }).toBeGreaterThan(before);
}

async function clickCard(page: Page, optionId: string, count = 1) {
  const card = page.getByTestId('gather-option-' + optionId);
  await expect(card).toBeEnabled();
  const bounds = await card.boundingBox();
  expect(bounds).not.toBeNull();
  for (let i = 0; i < count; i++) await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
}

async function gatherUnits(page: Page, optionId: string, itemId: string, targetQuantity: number) {
  const deadline = Date.now() + 90_000;
  while ((await inventory(page, itemId)) < targetQuantity && Date.now() < deadline) {
    const button = page.getByTestId('gather-option-' + optionId);
    await expect(button).toBeEnabled({ timeout: 15_000 });
    const before = await inventory(page, itemId);
    const snapshot = (await state(page)).snapshot!;
    const self = snapshot.players.find(p => p.id === snapshot.selfPlayerId)!;
    const inspectedOptions = snapshot.nodes.filter(n => n.options?.some(o => o.id === optionId))
      .sort((a, b) => Math.hypot(a.x - self.x, a.z - self.z) - Math.hypot(b.x - self.x, b.z - self.z))[0]?.options;
    // Cards reserve one unit each. Queue only a currently available batch;
    // depletion/refill is a server rule, not a test-only resource grant.
    const available = inspectedOptions?.find(o => o.id === optionId)?.remainingQuantity ?? 1;
    const batch = Math.max(1, Math.min(targetQuantity - before, available));
    for (let i = 0; i < batch; i++) await button.click();
    await expect.poll(() => inventory(page, itemId), { timeout: 30_000 }).toBe(before + batch);
    await expect.poll(async () => (await state(page)).snapshot?.gatheringQueue?.length ?? 0).toBe(0);
  }
  expect(await inventory(page, itemId)).toBe(targetQuantity);
}

async function selectStation(page: Page, stationId: string) {
  await page.keyboard.press('Escape');
  await page.getByTestId('open-craft').click();
  await page.getByTestId('station-open-' + stationId).click();
}

async function screenshotAndPixels(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  const canvas = await page.getByTestId('world-canvas').boundingBox();
  expect(canvas!.width).toBeGreaterThan(100); expect(canvas!.height).toBeGreaterThan(100);
  // The game canvas fills the page. Reuse one real page capture instead of
  // requesting a second identical GPU readback for the pixel checks.
  const image = PNG.sync.read(await page.screenshot({ path, fullPage: true }));
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
  test.setTimeout(120_000);
  const first = await browser.newContext({ viewport: { width: 960, height: 640 } });
  const second = await browser.newContext({ viewport: { width: 800, height: 600 } });
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
  test.setTimeout(330_000);
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
  await settledGatheringPanel(page);
  await expect(page.getByTestId('gather-option-signature')).toBeDisabled();
  expect(await inventory(page, 'raw_hide')).toBe(0);
  await clickCard(page, 'hide', 3);
  await expect(page.getByTestId('gathering-progress')).toBeVisible();
  await expect.poll(() => inventory(page, 'raw_hide'), { timeout: 15_000 }).toBe(3);
  // A software GPU can spend seconds reading pixels; secure the time-limited
  // corpse reward before collecting the UI evidence.
  await page.screenshot({ path: info.outputPath('gathering-material-list.png') });

  // Visit each resource explicitly; an arrival tolerance must not put bark out of range.
  await walkTo(page, { x: 4.5, z: 4.5 });
  await walkTo(page, { x: 4.4, z: -2 }, .25);
  await page.keyboard.press('e');
  await gatherUnits(page, 'fiber', 'fiber', 8);
  await walkTo(page, { x: 4.6, z: 2 }, .16);
  await page.keyboard.press('e');
  await gatherUnits(page, 'bark', 'bark', 6);
  expect(await inventory(page, 'fiber')).toBeGreaterThanOrEqual(8);
  expect(await inventory(page, 'bark')).toBeGreaterThanOrEqual(6);
  await walkTo(page, { x: 0, z: 0 });
  await selectStation(page, 'hand');
  for (let i = 0; i < 4; i++) await craft(page, 'cord_hand', 'cord');
  await walkTo(page, { x: -2.8, z: -2 });
  await selectStation(page, 'bench-1');
  for (let i = 0; i < 3; i++) await craft(page, 'bark_powder', 'bark_powder');
  await walkTo(page, { x: -2.8, z: 0 });
  await selectStation(page, 'prep-1');
  for (let i = 0; i < 3; i++) await craft(page, 'trim_hide', 'trim_hide');
  await walkTo(page, { x: 2.4, z: -2 });
  await selectStation(page, 'tan-1');
  for (let i = 0; i < 3; i++) await craft(page, 'tan', 'wet_leather');
  await walkTo(page, { x: 3.6, z: 1.8 });
  await selectStation(page, 'dry-1');
  for (let i = 0; i < 3; i++) await craft(page, 'dry_leather', 'leather');
  await walkTo(page, { x: .3, z: -3.8 });
  await selectStation(page, 'leatherwork-1');
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
  test.setTimeout(65_000);
  await joined(page, '채집 확인 개척자');
  await walkTo(page, { x: 4.6, z: 2 }, .16);
  await page.keyboard.press('e');
  await settledGatheringPanel(page);
  expect(await inventory(page, 'log')).toBe(0);
  await expect(page.getByTestId('gather-option-resin')).toBeDisabled();
  await clickCard(page, 'log', 2);
  await expect(page.getByTestId('gathering-progress')).toBeVisible();
  await expect.poll(async () => (await state(page)).snapshot?.gatheringQueue?.length ?? 0).toBe(1);
  await page.keyboard.down('a'); await page.waitForTimeout(180); await page.keyboard.up('a');
  await expect.poll(async () => (await state(page)).snapshot?.gathering?.state).toBe('cancelled');
  expect((await state(page)).snapshot?.gatheringQueue ?? []).toEqual([]);
  expect(await inventory(page, 'log')).toBe(0);
  await walkTo(page, { x: 4.6, z: 2 }, .16);
  await clickCard(page, 'log');
  await page.getByTestId('cancel-gather').click();
  await expect.poll(async () => (await state(page)).snapshot?.gathering?.state).toBe('cancelled');
  expect(await inventory(page, 'log')).toBe(0);
  await screenshotAndPixels(page, info, 'gathering-selection');
});

test('centered cards reserve individual units and the mixed FIFO survives closing its tray', async ({ page }, info) => {
  test.setTimeout(65_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await joined(page, '예약 채집 개척자');
  await walkTo(page, { x: -4.3, z: 1 }, .2);
  await page.keyboard.press('e');
  const panel = await settledGatheringPanel(page);
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(Math.abs(bounds!.x + bounds!.width / 2 - page.viewportSize()!.width / 2)).toBeLessThan(3);
  const option = async (id: string) => (await state(page)).snapshot?.nodes.find(n => n.id === 'log-1')?.options?.find(o => o.id === id);
  const logCard = page.getByTestId('gather-option-log');
  await expect(logCard).toBeEnabled({ timeout: 15_000 });
  const beforeWork = await logCard.boundingBox();
  expect(beforeWork).not.toBeNull();
  const barkCard = await page.getByTestId('gather-option-bark').boundingBox();
  // Real rapid mouse clicks at the stable card locations; Locator.click's
  // per-action animation frames can themselves outlast a short gather timer.
  await page.mouse.click(beforeWork!.x + beforeWork!.width / 2, beforeWork!.y + beforeWork!.height / 2);
  for (let i = 0; i < 3; i++) await page.mouse.click(barkCard!.x + barkCard!.width / 2, barkCard!.y + barkCard!.height / 2);
  await expect(page.getByTestId('gathering-progress')).toBeVisible();
  // Repeated clicks must hit a stable card. Reserve the work/queue rows before
  // they are populated instead of recentering the tray on every accepted click.
  await expect.poll(async () => Math.abs((await logCard.boundingBox())!.y - beforeWork!.y)).toBeLessThanOrEqual(3);
  await expect.poll(async () => (await state(page)).snapshot?.gatheringQueue?.length).toBe(3);
  expect(await inventory(page, 'log')).toBe(0); expect(await inventory(page, 'bark')).toBe(0);
  const reserved = (await state(page)).snapshot!.gatheringQueue!;
  expect(reserved.map(j => j.itemId)).toEqual(['bark', 'bark', 'bark']);
  expect(new Set(reserved.map(j => j.id)).size).toBe(3);
  expect((await option('bark'))?.remainingQuantity).toBe(0);
  await expect.poll(async () => Math.abs((await logCard.boundingBox())!.y - beforeWork!.y)).toBeLessThanOrEqual(3);
  const remove = await page.getByTestId('remove-gather-' + reserved[1].id).boundingBox();
  await page.mouse.click(remove!.x + remove!.width / 2, remove!.y + remove!.height / 2);
  await expect.poll(async () => (await option('bark'))?.remainingQuantity).toBe(1);
  await page.mouse.click(beforeWork!.x + beforeWork!.width / 2, beforeWork!.y + beforeWork!.height / 2);
  await expect.poll(async () => (await state(page)).snapshot?.gatheringQueue?.map(j => j.itemId)).toEqual(['bark', 'bark', 'log']);
  await page.getByRole('button', { name: '채집 목록 닫기' }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByTestId('gathering-progress')).toBeVisible();
  await expect.poll(() => inventory(page, 'log'), { timeout: 9_000 }).toBe(1);
  expect(await inventory(page, 'bark')).toBe(0);
  await expect.poll(() => inventory(page, 'bark'), { timeout: 10_000 }).toBe(2);
  expect(await inventory(page, 'log')).toBe(1);
  await expect.poll(() => inventory(page, 'log'), { timeout: 9_000 }).toBe(2);
  expect((await state(page)).snapshot?.gatheringQueue ?? []).toEqual([]);
  await page.keyboard.press('e');
  await settledGatheringPanel(page);
  await screenshotAndPixels(page, info, 'centered-gather-cards');
});

test('narrow screen keeps a visible nonblank world and usable entry', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await joined(page, '작은 화면 개척자');
  const bounds = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.viewport + 1);
  await screenshotAndPixels(page, info, 'mobile-layout');
  await walkTo(page, { x: 4.4, z: -2 }, .25);
  await page.keyboard.press('e');
  await settledGatheringPanel(page);
  const tray = await page.getByTestId('gather-panel').boundingBox();
  expect(tray!.x).toBeGreaterThanOrEqual(0);
  expect(tray!.x + tray!.width).toBeLessThanOrEqual(391);
  expect(Math.abs(tray!.x + tray!.width / 2 - 195)).toBeLessThan(3);
  await expect(page.getByTestId('gather-option-fiber')).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId('gather-option-fiber').click();
  await expect(page.getByTestId('gathering-progress')).toBeVisible();
  await screenshotAndPixels(page, info, 'mobile-gathering');
});
