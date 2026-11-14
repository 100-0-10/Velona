import { expect, test } from '@playwright/test';
import { HubConnectionBuilder, LogLevel, type HubConnection } from '@microsoft/signalr';
import type { ActionResult, GuestSession, WorldSnapshot } from '../src/types';

const backend = process.env.VELONA_BACKEND_URL ?? 'http://127.0.0.1:5080';
type Peer = { connection: HubConnection; latest: WorldSnapshot; sequence: number };

async function peer(name: string): Promise<Peer> {
  const response = await fetch(`${backend}/api/guest`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  expect(response.ok).toBeTruthy();
  const session = await response.json() as GuestSession;
  const connection = new HubConnectionBuilder()
    .withUrl(`${backend}/hubs/world`, { accessTokenFactory: () => session.sessionToken })
    .configureLogging(LogLevel.Error).build();
  const result: Peer = { connection, latest: undefined as unknown as WorldSnapshot, sequence: 0 };
  connection.on('WorldSnapshot', snapshot => { result.latest = snapshot; });
  await connection.start();
  result.latest = await connection.invoke<WorldSnapshot>('JoinChannel', 'meadow-1');
  return result;
}

function self(peer: Peer) {
  const player = peer.latest.players.find(p => p.id === peer.latest.selfPlayerId);
  if (!player) throw new Error('The server omitted the connected player.');
  return player;
}

async function moveFor(peer: Peer, x: number, z: number, milliseconds: number) {
  const end = Date.now() + milliseconds;
  while (Date.now() < end) {
    await peer.connection.invoke('Move', { x, z, sequence: ++peer.sequence });
    await new Promise(resolve => setTimeout(resolve, 90));
  }
  await peer.connection.invoke('Move', { x: 0, z: 0, sequence: ++peer.sequence });
}

async function approach(peer: Peer, target: { x: number; z: number }, radius = 1.8) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const p = self(peer);
    const dx = target.x - p.x; const dz = target.z - p.z;
    const length = Math.hypot(dx, dz);
    if (length <= radius) break;
    await peer.connection.invoke('Move', { x: dx / length, z: dz / length, sequence: ++peer.sequence });
    await new Promise(resolve => setTimeout(resolve, 90));
  }
  await peer.connection.invoke('Move', { x: 0, z: 0, sequence: ++peer.sequence });
  expect(Math.hypot(self(peer).x - target.x, self(peer).z - target.z)).toBeLessThanOrEqual(radius + .5);
}

test('server owns identity, clamps movement, enforces range and prevents duplicate gathering', async ({ request }) => {
  test.setTimeout(45_000);
  const denied = await request.post(`${backend}/hubs/world/negotiate?negotiateVersion=1`);
  expect(denied.status()).toBe(401);
  const a = await peer(`QA-A-${Date.now().toString(36)}`);
  const b = await peer(`QA-B-${Date.now().toString(36)}`);
  try {
    expect(a.latest.selfPlayerId).not.toBe(b.latest.selfPlayerId);
    await expect.poll(() => b.latest.players.some(p => p.id === a.latest.selfPlayerId)).toBeTruthy();
    const deniedGather = await a.connection.invoke<ActionResult>('Interact', 'fiber-1', crypto.randomUUID());
    expect(deniedGather.success).toBe(false);
    const start = { x: self(a).x, z: self(a).z };
    await moveFor(a, 100_000, 0, 700);
    await expect.poll(() => self(a).x).toBeGreaterThan(start.x + 1);
    expect(Math.hypot(self(a).x - start.x, self(a).z - start.z)).toBeLessThan(4.2);
    await expect.poll(() => b.latest.players.find(p => p.id === a.latest.selfPlayerId)?.x ?? 0).toBeGreaterThan(start.x + 1);

    const node = a.latest.nodes.find(n => n.id === 'fiber-1')!;
    await approach(a, node);
    await expect.poll(() => a.latest.nodes.find(n => n.id === node.id)?.available, { timeout: 12_000 }).toBeTruthy();
    const requestId = crypto.randomUUID();
    const before = a.latest.inventory.find(i => i.itemId === 'fiber')?.quantity ?? 0;
    const gathered = await a.connection.invoke<ActionResult>('Interact', node.id, requestId);
    expect(gathered.success).toBe(true);
    await expect.poll(() => a.latest.inventory.find(i => i.itemId === 'fiber')?.quantity ?? 0).toBe(before + 3);
    const repeated = await a.connection.invoke<ActionResult>('Interact', node.id, requestId);
    expect(repeated).toEqual(gathered);
    expect(a.latest.inventory.find(i => i.itemId === 'fiber')?.quantity).toBe(before + 3);
    const badReuse = await a.connection.invoke<ActionResult>('Interact', 'bark-1', requestId);
    expect(badReuse.success).toBe(false);

    // A single movement intent expires automatically without client keep-alive input.
    await approach(a, { x: 0, z: 0 });
    await a.connection.invoke('Move', { x: -1, z: 0, sequence: ++a.sequence });
    await new Promise(resolve => setTimeout(resolve, 700));
    const afterExpiry = { x: self(a).x, z: self(a).z };
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(Math.hypot(self(a).x - afterExpiry.x, self(a).z - afterExpiry.z)).toBeLessThan(.3);
  } finally {
    await a.connection.stop(); await b.connection.stop();
  }
});
