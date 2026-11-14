import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(root, 'frontend/package.json'));
const { HubConnectionBuilder, LogLevel } = require('@microsoft/signalr');
const url = 'http://127.0.0.1:5151';
const worldKey = `proof-${Date.now()}`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let server;
let output = '';
let built = false;

async function until(read, predicate, description, timeout = 25_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const value = await read(); if (predicate(value)) return value; } catch { /* startup or reconnect */ }
    await delay(100);
  }
  throw new Error(`Timed out: ${description}. Server log: ${output.slice(-2500)}`);
}
async function start() {
  server = spawn('dotnet', ['run', '--project', 'backend/Velona.Server', built ? '--no-build' : '--no-restore', '--no-launch-profile', '--urls', url], {
    cwd: root, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development', DOTNET_ENVIRONMENT: 'Development', Persistence__Enabled: 'true', Persistence__WorldKey: worldKey, Game__ProductionTimeScale: '5' },
    windowsHide: true,
  });
  server.stdout.on('data', d => { output = (output + d).slice(-8000); });
  server.stderr.on('data', d => { output = (output + d).slice(-8000); });
  await until(async () => (await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) })).json(), h => h.persistence === 'postgresql' && h.status === 'ok', 'PostgreSQL server ready');
  built = true;
}
async function crash() {
  if (!server || server.exitCode !== null) return;
  const child = server;
  const exit = new Promise(resolve => child.once('exit', resolve));
  if (process.platform === 'win32') execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else process.kill(-child.pid, 'SIGKILL');
  await Promise.race([exit, delay(5000)]);
  server = undefined;
  await delay(300);
}
async function connect(session) {
  let snapshot;
  const connection = new HubConnectionBuilder().withUrl(`${url}/hubs/world`, { accessTokenFactory: () => session.sessionToken }).configureLogging(LogLevel.Error).build();
  connection.on('WorldSnapshot', value => { snapshot = value; });
  await connection.start();
  snapshot = await connection.invoke('JoinChannel', 'meadow-1');
  return { connection, read: () => snapshot };
}
let peer;
try {
  await start();
  const response = await fetch(`${url}/api/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '저장 복구 검사' }) });
  assert.equal(response.status, 200);
  const session = await response.json();
  peer = await connect(session);
  let sequence = 0;
  await until(async () => {
    const p = peer.read().players.find(p => p.id === session.playerId);
    const dx = 4 - p.x, dz = -2 - p.z, length = Math.hypot(dx, dz);
    await peer.connection.invoke('Move', { x: length > .2 ? dx / length : 0, z: length > .2 ? dz / length : 0, sequence: ++sequence });
    return length;
  }, n => n < .4, 'walk to fiber');
  await peer.connection.invoke('Move', { x: 0, z: 0, sequence: ++sequence });
  assert.equal((await peer.connection.invoke('Interact', 'fiber-1', 'proof-gather')).success, true);
  const crafted = await peer.connection.invoke('Craft', 'cord_hand', 'proof-craft');
  assert.equal(crafted.success, true);
  const job = await until(() => peer.read().jobs[0], j => j?.state === 'running', 'running job');
  await until(async () => (await fetch(`${url}/health`)).json(), h => Date.parse(h.lastSavedAtUtc) >= Date.parse(job.startedAtUtc), 'checkpoint after material consumption');
  await peer.connection.stop(); peer = undefined;
  await crash();
  await delay(Math.max(0, Date.parse(job.completesAtUtc) - Date.now()) + 300);
  await start();
  peer = await connect(session);
  await until(() => peer.read().inventory.find(i => i.itemId === 'cord')?.quantity, n => n === 1, 'offline job restored once');
  assert.equal(peer.read().inventory.find(i => i.itemId === 'fiber')?.quantity, 1);
  assert.equal((await peer.connection.invoke('Craft', 'cord_hand', 'proof-craft')).success, true);
  const restoredAt = Date.now();
  await until(async () => (await fetch(`${url}/health`)).json(), h => Date.parse(h.lastSavedAtUtc) >= restoredAt, 'completed delivery persisted');
  await peer.connection.stop(); peer = undefined;
  await crash();
  await start();
  peer = await connect(session);
  await delay(300);
  assert.equal(peer.read().inventory.find(i => i.itemId === 'cord')?.quantity, 1);
  assert.equal(peer.read().inventory.find(i => i.itemId === 'fiber')?.quantity, 1);
  assert.equal(peer.read().players.length, 1);
  console.log('PostgreSQL proof passed: guest restored, inventory retained, pending offline job delivered once, replay protected, second restart did not duplicate output.');
} finally {
  if (peer) await Promise.race([peer.connection.stop(), delay(3000)]);
  await crash();
}
