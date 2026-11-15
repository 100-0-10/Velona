import * as THREE from 'three';
import { createBoar } from './creature';
import { createCamp } from './camp';
import { createExplorerVisual } from './character';
import { createTree, createRock, createPlant } from './nature';

export function label(text: string, color = '#f7f3e2') {
  const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1d3029c9'; ctx.beginPath(); ctx.roundRect(8, 12, 368, 54, 12); ctx.fill();
  ctx.strokeStyle = '#d7c79545'; ctx.lineWidth = 1; ctx.stroke();
  ctx.font = '500 25px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(text, 192, 40, 348);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false })); sprite.scale.set(3, .62, 1); sprite.position.y = 2.6; return sprite;
}
export const tree = createTree;
export const rock = createRock;
export const boar = createBoar;
export function explorer(color: string, name: string, self: boolean) {
  const g = new THREE.Group(); g.add(createExplorerVisual(color));
  const ring = new THREE.Mesh(new THREE.RingGeometry(.43, .47, 40), new THREE.MeshBasicMaterial({ color: self ? 0xe6c583 : 0xafd0b5, side: THREE.DoubleSide, transparent: true, opacity: .7, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = .025; g.add(ring);
  const tag = label(self ? name + ' · 나' : name); tag.name = 'playerLabel'; tag.position.y = 2.65; g.add(tag);
  return g;
}
export function resource(itemId: string) {
  const g = new THREE.Group();
  if (itemId === 'bark' || itemId === 'log') g.add(tree(3.2, itemId === 'log' ? 1 : 0));
  else if (itemId === 'stone') g.add(rock(.85));
  else g.add(createPlant());
  return g;
}
export function camp() {
  const g = createCamp(); const sign = label('야영지 · 제작과 휴식'); sign.position.set(0, 2.5, -3.5); g.add(sign); return g;
}
