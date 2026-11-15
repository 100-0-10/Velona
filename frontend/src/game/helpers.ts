import type { InventoryStack, MonsterState, PlayerState, ResourceNode, Workstation, WorldSnapshot } from '../types';
export function distance(a: { x: number; z: number }, b: { x: number; z: number }) { return Math.hypot(a.x - b.x, a.z - b.z); }
export function movementAxes(keys: ReadonlySet<string>): { x: number; z: number } {
  const h = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
  const v = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
  let x = (h + v) / Math.SQRT2; let z = (-h + v) / Math.SQRT2;
  const n = Math.hypot(x, z); if (n > 1) { x /= n; z /= n; } return { x, z };
}
export function isEditing(target: EventTarget | null) { return target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable); }
export type NearbyTarget = { kind: 'node'; value: ResourceNode } | { kind: 'corpse'; value: MonsterState } | { kind: 'station'; value: Workstation };
export function nearbyTarget(snapshot: WorldSnapshot | null): NearbyTarget | null {
  const self = snapshot?.players.find(p => p.id === snapshot.selfPlayerId); if (!snapshot || !self || self.isDowned) return null;
  const corpses = snapshot.monsters.filter(m => m.state === 'dead' && m.canHarvest && distance(self, m) <= 3);
  if (corpses.length) return { kind: 'corpse', value: corpses.sort((a, b) => distance(self, a) - distance(self, b))[0] };
  const nodes = snapshot.nodes.filter(n => distance(self, n) <= 2.8);
  if (nodes.length) return { kind: 'node', value: nodes.sort((a, b) => distance(self, a) - distance(self, b))[0] };
  const stations = (snapshot.stations ?? []).filter(s => distance(self, s) <= s.interactionRadius);
  return stations.length ? { kind: 'station', value: stations.sort((a, b) => distance(self, a) - distance(self, b))[0] } : null;
}
export function nearestMonster(snapshot: WorldSnapshot | null) {
  const self = snapshot?.players.find(p => p.id === snapshot.selfPlayerId); if (!snapshot || !self || self.isDowned) return null;
  return snapshot.monsters.filter(m => m.state !== 'dead').sort((a, b) => distance(self, a) - distance(self, b))[0] ?? null;
}
export function quantity(inventory: InventoryStack[], itemId: string) { return inventory.find(i => i.itemId === itemId)?.quantity ?? 0; }
export function objective(inventory: InventoryStack[]) {
  if (quantity(inventory, 'small_bag')) return { title: '첫 개척의 기록', detail: '가죽 가방 완성! 다른 개척자와 야영지를 둘러보세요.', step: 5 };
  if (quantity(inventory, 'leather')) return { title: '나만의 첫 가방', detail: '무두질 가죽 3장과 섬유끈 4개로 가방을 만드세요.', step: 4 };
  if (quantity(inventory, 'wet_leather')) return { title: '햇볕 아래에서', detail: '젖은 가죽을 건조대에서 말리세요.', step: 3 };
  if (quantity(inventory, 'trim_hide')) return { title: '가죽에 새 쓰임을', detail: '수피 분말을 준비하고 무두질을 시작하세요.', step: 2 };
  if (quantity(inventory, 'raw_hide')) return { title: '사냥에서 생활로', detail: '야영지로 돌아와 생가죽을 손질하세요.', step: 1 };
  return { title: '첫 가죽 가방 만들기', detail: '동쪽 숲에서 섬유·수피를 모으고 멧수를 사냥하세요.', step: 0 };
}
export function jobProgress(start: string, end: string, now: number) { const a = Date.parse(start); const b = Date.parse(end); return b <= a ? 1 : Math.max(0, Math.min(1, (now - a) / (b - a))); }
export function selfPlayer(snapshot: WorldSnapshot | null): PlayerState | undefined { return snapshot?.players.find(p => p.id === snapshot.selfPlayerId); }
