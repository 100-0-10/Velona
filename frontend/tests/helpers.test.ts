import { describe, expect, it } from 'vitest';
import { jobProgress, movementAxes, nearbyTarget, objective } from '../src/game/helpers';
import type { WorldSnapshot } from '../src/types';

function snapshot(): WorldSnapshot {
  return { channelId: 'meadow-1', selfPlayerId: 'a', serverTimeUtc: '', capacity: 30, players: [{ id: 'a', name: 'A', x: 0, z: 0, hp: 120, maxHp: 120, stamina: 100, maxStamina: 100, isDowned: false, color: '#ffffff' }], inventory: [], jobs: [], nodes: [{ id: 'fiber', itemId: 'fiber', name: '섬유', x: 1, z: 1, available: true, respawnAtUtc: null }], monsters: [] };
}
describe('screen-relative movement intents', () => {
  it('normalizes diagonals and cancels opposing keys', () => {
    const diagonal = movementAxes(new Set(['w', 'd'])); expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1);
    expect(movementAxes(new Set(['a', 'd', 'w', 's']))).toEqual({ x: 0, z: 0 });
  });
  it('maps arrow keys identically to WASD and up toward screen top', () => {
    expect(movementAxes(new Set(['arrowup']))).toEqual(movementAxes(new Set(['w'])));
    const up = movementAxes(new Set(['w'])); expect(up.x).toBeLessThan(0); expect(up.z).toBeLessThan(0);
  });
});
describe('nearby interaction targeting', () => {
  it('keeps exhausted nodes inspectable but rejects out-of-range nodes', () => {
    const s = snapshot(); s.nodes[0].available = false; expect(nearbyTarget(s)?.kind).toBe('node');
    s.nodes[0].available = true; s.nodes[0].x = 10; expect(nearbyTarget(s)).toBeNull();
  });
  it('prioritizes a personal corpse claim and excludes other players claims', () => {
    const s = snapshot(); s.monsters.push({ id: 'boar', name: '멧수', x: 1, z: 0, hp: 0, maxHp: 100, state: 'dead', targetPlayerId: null, telegraphEndsAtUtc: null, canHarvest: true });
    expect(nearbyTarget(s)?.kind).toBe('corpse'); s.monsters[0].canHarvest = false; expect(nearbyTarget(s)?.kind).toBe('node');
  });
  it('does not offer actions to downed players', () => { const s = snapshot(); s.players[0].isDowned = true; expect(nearbyTarget(s)).toBeNull(); });
});
describe('production and objective presentation', () => {
  it('clamps production progress before and after completion', () => {
    expect(jobProgress('2026-01-01T00:00:00Z', '2026-01-01T00:00:10Z', Date.parse('2025-12-31T23:59:59Z'))).toBe(0);
    expect(jobProgress('2026-01-01T00:00:00Z', '2026-01-01T00:00:10Z', Date.parse('2026-01-01T00:00:20Z'))).toBe(1);
  });
  it('keeps bag completion visible after its ingredients are consumed', () => { expect(objective([{ itemId: 'small_bag', name: '가방', quantity: 1 }]).step).toBe(5); });
});
