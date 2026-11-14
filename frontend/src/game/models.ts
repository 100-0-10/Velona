import * as THREE from 'three';

export const palette = { grass: 0x819b62, earth: 0xb6a67a, bark: 0x6b5038, leaf: 0x3c6849, rock: 0x8d9690, leather: 0x9f6c46 };
export const material = (color: THREE.ColorRepresentation, roughness = .88) => new THREE.MeshStandardMaterial({ color, roughness });
export function mesh(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material(color)); object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true; return object;
}
export function box(w: number, h: number, d: number, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0) { return mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z); }
export function cylinder(r1: number, r2: number, h: number, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0) { return mesh(new THREE.CylinderGeometry(r1, r2, h, 7), color, x, y, z); }
export function label(text: string, color = '#f7f3e2') {
  const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 80;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#233a32dd'; ctx.beginPath(); ctx.roundRect(8, 8, 368, 62, 18); ctx.fill();
  ctx.font = '500 28px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(text, 192, 41, 348);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false })); sprite.scale.set(3.4, .7, 1); sprite.position.y = 2.6; return sprite;
}
export function tree(height = 4) {
  const g = new THREE.Group(); g.add(cylinder(.2, .38, height * .65, palette.bark, 0, height * .3));
  const crown = mesh(new THREE.IcosahedronGeometry(height * .35, 1), palette.leaf, 0, height * .8); crown.scale.set(1.05, 1.2, .85); g.add(crown);
  g.add(mesh(new THREE.IcosahedronGeometry(height * .26, 0), 0x567d50, -.5, height * 1.05, -.15)); return g;
}
export function rock(size = 1) { const r = mesh(new THREE.DodecahedronGeometry(size, 0), palette.rock); r.scale.set(1.1, .65, .85); r.position.y = size * .3; r.rotation.set(.2, .4, .1); return r; }
export function explorer(color: string, name: string, self: boolean) {
  const g = new THREE.Group(); const body = new THREE.Group(); body.name = 'body'; g.add(body);
  body.add(mesh(new THREE.CapsuleGeometry(.24, .4, 3, 7), color, 0, 1.05));
  body.add(box(.52, .18, .38, 0x4b3b2e, 0, .79));
  body.add(mesh(new THREE.SphereGeometry(.24, 8, 6), 0xd8ad86, 0, 1.65));
  body.add(cylinder(.3, .32, .12, 0x6b543c, 0, 1.86));
  body.add(mesh(new THREE.SphereGeometry(.26, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0x6b543c, 0, 1.88));
  for (const side of [-1, 1]) {
    const leg = box(.16, .52, .18, 0x4e5140, side * .16, .45); leg.name = side === 1 ? 'rightLeg' : 'leftLeg'; body.add(leg);
    body.add(box(.19, .16, .29, 0x493c31, side * .16, .14, .045));
    const arm = cylinder(.095, .11, .5, color, side * .34, 1.05); arm.rotation.z = side * .15; body.add(arm);
  }
  body.add(box(.38, .45, .23, palette.leather, 0, 1.12, -.27));
  const weapon = new THREE.Group(); weapon.name = 'weapon'; body.add(weapon);
  const spear = cylinder(.026, .026, 2, 0x6d5036, -.5, 1.1, .05); spear.rotation.z = -.16; weapon.add(spear);
  const point = mesh(new THREE.ConeGeometry(.08, .28, 4), 0xc0c5b7, -.65, 2.17, .05); point.rotation.z = -.16; weapon.add(point);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.46, .52, 32), new THREE.MeshBasicMaterial({ color: self ? 0xf1d295 : 0xafd0b5, side: THREE.DoubleSide, transparent: true, opacity: .85 })); ring.rotation.x = -Math.PI / 2; ring.position.y = .035; g.add(ring);
  const nameTag = label(self ? name + ' · 나' : name); nameTag.position.y = 2.6; g.add(nameTag);
  return g;
}
export function boar() {
  const g = new THREE.Group(); const body = mesh(new THREE.SphereGeometry(.75, 10, 7), 0x725441, 0, .85); body.scale.set(.8, .8, 1.35); g.add(body);
  const head = mesh(new THREE.SphereGeometry(.45, 8, 6), 0x624432, 0, .85, .83); head.scale.set(.9, 1, 1.1); g.add(head);
  g.add(box(.5, .25, .34, 0x9b7760, 0, .7, 1.18));
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(.17, .4, 3), 0x513f30, side * .3, 1.35, .75); ear.rotation.z = side * -.4; g.add(ear);
    const tusk = mesh(new THREE.ConeGeometry(.08, .35, 5), 0xe5dec1, side * .28, .85, 1.2); tusk.rotation.x = .6; g.add(tusk);
    for (const z of [-.55, .5]) g.add(box(.2, .5, .22, 0x443c31, side * .4, .3, z));
  }
  for (let n = 0; n < 5; n++) g.add(mesh(new THREE.ConeGeometry(.14, .3, 3), 0x493c30, 0, 1.5, -.65 + n * .27));
  return g;
}
export function resource(itemId: string) {
  const g = new THREE.Group();
  if (itemId === 'bark' || itemId === 'log') g.add(tree(3.2));
  else if (itemId === 'stone') g.add(rock(.85));
  else {
    for (let n = 0; n < 5; n++) { const blade = mesh(new THREE.ConeGeometry(.22, 1.1 + (n % 2) * .25, 3), n % 2 ? 0xb9bc6b : 0x799153, (n % 3 - 1) * .25, .6, (Math.floor(n / 3) - .5) * .3); blade.rotation.z = (n - 2) * .13; g.add(blade); }
  }
  return g;
}
export function camp() {
  const g = new THREE.Group();
  // Shared camp landmarks: workbench, tanning vat, hide frame, shelter and fire.
  const bench = new THREE.Group(); bench.add(box(2, .2, 1, 0x9a7650, 0, 1.02));
  for (const x of [-.7, .7]) for (const z of [-.3, .3]) bench.add(box(.15, 1, .15, palette.bark, x, .5, z));
  bench.add(box(.35, .1, .25, 0xaab0a4, .2, 1.2)); bench.position.set(-2.8, 0, -2); g.add(bench);
  const vat = new THREE.Group(); vat.add(cylinder(.68, .6, .8, 0x805c3e, 0, .4)); vat.add(cylinder(.59, .59, .03, 0x565d3d, 0, .83)); vat.position.set(2.4, 0, -2); g.add(vat);
  const frame = new THREE.Group(); for (const x of [-.9, .9]) frame.add(cylinder(.07, .09, 2.4, palette.bark, x, 1.2)); frame.add(box(2, .12, .1, palette.bark, 0, 2.3)); frame.add(box(1.1, 1.4, .06, 0xa77b50, 0, 1.35)); frame.position.set(3.6, 0, 1.8); g.add(frame);
  const tent = new THREE.Group(); const shape = new THREE.Shape(); shape.moveTo(-1.5, 0); shape.lineTo(0, 2); shape.lineTo(1.5, 0); shape.closePath();
  const roof = mesh(new THREE.ExtrudeGeometry(shape, { depth: 2.7, bevelEnabled: false }), 0xc6b17b, 0, 0, -1.35); tent.add(roof); tent.add(mesh(new THREE.ShapeGeometry(shape), 0x514a36, 0, .02, 1.37)); tent.scale.set(.95, .95, .95); tent.position.set(-3.8, 0, 2.4); g.add(tent);
  for (let n = 0; n < 9; n++) { const angle = n / 9 * Math.PI * 2; const s = rock(.22); s.position.set(Math.cos(angle) * .65, .12, Math.sin(angle) * .65); g.add(s); }
  for (const a of [.7, -.7]) { const l = cylinder(.12, .12, 1.15, 0x4b3d2a, 0, .18); l.rotation.z = Math.PI / 2; l.rotation.y = a; g.add(l); }
  const flame = mesh(new THREE.ConeGeometry(.32, .9, 5), 0xf1ad57, 0, .65); flame.name = 'flame'; (flame.material as THREE.MeshStandardMaterial).emissive.set(0xb55e22); g.add(flame);
  const sign = label('야영지 · 제작과 휴식'); sign.position.set(0, 3.6, -3.5); sign.scale.multiplyScalar(1.2); g.add(sign);
  return g;
}
