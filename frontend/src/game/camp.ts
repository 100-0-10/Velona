import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** An authored small camp, baked by material so stitches/planks cost no extra draws. */
export function createCamp() {
  const root = new THREE.Group(), staticParts = new THREE.Group();
  const mats = {
    wood: new THREE.MeshStandardMaterial({ color: 0x77533a, roughness: .95 }),
    cut: new THREE.MeshStandardMaterial({ color: 0xb39160, roughness: .94 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3d3329, roughness: .92 }),
    rope: new THREE.MeshStandardMaterial({ color: 0xc3ad7e, roughness: 1 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x9b906d, roughness: 1, side: THREE.DoubleSide }),
    hide: new THREE.MeshStandardMaterial({ color: 0xb18a5f, roughness: .9, side: THREE.DoubleSide }),
    stone: new THREE.MeshStandardMaterial({ color: 0x777c72, roughness: 1 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x6b7774, roughness: .65, metalness: .2 }),
    water: new THREE.MeshStandardMaterial({ color: 0x555b3f, roughness: .38 }),
  };
  function part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent = staticParts) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  function plank(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) { return part(new THREE.BoxGeometry(w, h, d), mat, x, y, z); }
  function beam(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat = mats.wood) {
    const delta = b.clone().sub(a), m = part(new THREE.CylinderGeometry(radius * .88, radius, delta.length(), 7), mat, 0, 0, 0);
    m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return m;
  }
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // Individual worn planks, lower rail, apron, stone axe and twine spool.
  for (let i = 0; i < 5; i++) plank(2, .13, .185, i % 2 ? mats.cut : mats.wood, -2.8, 1.03 + (i % 2) * .009, -2.4 + i * .2);
  for (const x of [-3.55, -2.05]) for (const z of [-2.34, -1.66]) {
    beam(v(x, .02, z), v(x + .04, 1.02, z), .075); plank(.045, .018, .045, mats.iron, x, 1.106, z);
  }
  for (const z of [-2.3, -1.7]) { plank(1.65, .16, .07, mats.wood, -2.8, .86, z); plank(1.65, .07, .07, mats.dark, -2.8, .25, z); }
  beam(v(-3.2, 1.15, -1.83), v(-2.68, 1.15, -2.1), .027, mats.cut);
  const axe = part(new THREE.DodecahedronGeometry(.16, 0), mats.iron, -3.18, 1.18, -1.86); axe.scale.set(.55, .5, 1.3);
  part(new THREE.CylinderGeometry(.11, .11, .16, 10), mats.rope, -2.24, 1.18, -2.16);
  for (let i = 0; i < 5; i++) beam(v(-3.57 + i * .33, 1.105, -2.38), v(-3.42 + i * .33, 1.105, -1.63), .004, mats.dark);
  // Open stave-built tanning vat with hoops and liquid well below the lip.
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    const stave = plank(.255, .83, .065, i % 3 ? mats.wood : mats.cut, 2.4 + Math.sin(a) * .62, .43, -2 + Math.cos(a) * .62); stave.rotation.y = a;
  }
  for (const y of [.16, .66]) { const hoop = part(new THREE.TorusGeometry(.65, .025, 5, 28), mats.dark, 2.4, y, -2); hoop.rotation.x = Math.PI / 2; }
  part(new THREE.CylinderGeometry(.59, .59, .025, 24), mats.water, 2.4, .57, -2);
  beam(v(2.05, .75, -2.5), v(2.85, 1.05, -1.55), .035, mats.cut);
  // Tied hide has an organic cut outline, stitches, and lashings around poles.
  for (const x of [2.7, 4.5]) beam(v(x, 0, 1.8), v(x + .03, 2.45, 1.8), .065);
  beam(v(2.55, 2.32, 1.8), v(4.67, 2.32, 1.8), .07);
  beam(v(2.7, .35, 1.8), v(4.5, .35, 1.8), .045);
  const hide = new THREE.Shape(); hide.moveTo(-.31, .78); hide.lineTo(.28, .8); hide.lineTo(.52, .6); hide.lineTo(.67, .38); hide.lineTo(.47, .14); hide.lineTo(.45, -.46); hide.lineTo(.58, -.72); hide.lineTo(.24, -.67); hide.lineTo(0, -.55); hide.lineTo(-.25, -.72); hide.lineTo(-.57, -.67); hide.lineTo(-.43, -.4); hide.lineTo(-.48, .1); hide.lineTo(-.65, .36); hide.lineTo(-.48, .6); hide.closePath();
  part(new THREE.ShapeGeometry(hide), mats.hide, 3.6, 1.35, 1.82);
  for (let i = 0; i < 5; i++) for (const side of [-1, 1]) {
    const y = .78 + i * .28, x = 3.6 + side * .47;
    beam(v(x, y, 1.84), v(3.6 + side * .9, y + .1, 1.8), .009, mats.rope);
    beam(v(3.6 + side * .88, y + .07, 1.75), v(3.6 + side * .93, y + .14, 1.86), .015, mats.rope);
  }
  // Fabric A-frame shelter. The entrance is open, with a dark bedroll inside.
  const tentX = -3.8, tentZ = 2.5;
  for (const side of [-1, 1]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 2, -1.5, side * 1.55, .06, -1.5, side * 1.65, .04, 1.5, 0, 2, -1.5, side * 1.65, .04, 1.5, 0, 2.03, 1.5], 3)); geo.computeVertexNormals();
    part(geo, mats.cloth, tentX, 0, tentZ);
    for (let i = 0; i < 4; i++) beam(v(tentX + side * .05, 2.01, tentZ - 1.4 + i * .95), v(tentX + side * 1.57, .09, tentZ - 1.4 + i * .95), .009, mats.rope);
    for (const z of [-1.5, 1.5]) {
      beam(v(tentX, 1.97, tentZ + z), v(tentX + side * 1.57, .04, tentZ + z), .045);
      beam(v(tentX + side * 1.45, .25, tentZ + z), v(tentX + side * 2.05, .02, tentZ + z + .3), .012, mats.rope);
      beam(v(tentX + side * 2.05, 0, tentZ + z + .3), v(tentX + side * 2.05, .24, tentZ + z + .3), .035, mats.cut);
    }
  }
  beam(v(tentX, 2.04, tentZ - 1.7), v(tentX, 2.04, tentZ + 1.7), .04, mats.cut);
  const back = new THREE.Shape(); back.moveTo(-1.55, 0); back.lineTo(0, 2); back.lineTo(1.55, 0); back.closePath(); part(new THREE.ShapeGeometry(back), mats.cloth, tentX, .015, tentZ - 1.5);
  plank(1.2, .05, 2.4, mats.dark, tentX, .045, tentZ); plank(.62, .07, 1.55, mats.hide, tentX, .1, tentZ);
  const roll = part(new THREE.CylinderGeometry(.17, .17, .72, 10), mats.hide, tentX, .19, tentZ - .62); roll.rotation.z = Math.PI / 2;
  // Fire ring, charcoal bed, split logs. Flame remains separate and animated.
  const fireX = -.8, fireZ = .8;
  part(new THREE.CylinderGeometry(.58, .64, .025, 20), mats.dark, fireX, .02, fireZ);
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * Math.PI * 2;
    const stone = part(new THREE.DodecahedronGeometry(.22, 0), mats.stone, fireX + Math.cos(a) * .65, .13, fireZ + Math.sin(a) * .65); stone.scale.set(1.2, .7, 1); stone.rotation.set(i, i * .7, 0);
  }
  for (const angle of [.5, 1.6, 2.7]) beam(v(fireX + Math.sin(angle) * -.52, .16, fireZ + Math.cos(angle) * -.52), v(fireX + Math.sin(angle) * .52, .16, fireZ + Math.cos(angle) * .52), .11, mats.dark);
  const flame = new THREE.Group(); flame.name = 'flame'; flame.position.set(fireX, 0, fireZ);
  for (let i = 0; i < 3; i++) {
    const fireMat = new THREE.MeshBasicMaterial({ color: i ? 0xffd080 : 0xde783b, transparent: true, opacity: .85, depthWrite: false });
    const f = new THREE.Mesh(new THREE.SphereGeometry(.2, 6, 5), fireMat); f.scale.set(1 - i * .2, 2.2 - i * .35, .8); f.position.set(Math.sin(i * 3) * .1, .53 + i * .1, Math.cos(i * 3) * .07); flame.add(f);
  }
  // Bake static parts by material, preserving cast/receive shadows.
  staticParts.updateMatrixWorld(true);
  for (const mat of Object.values(mats)) {
    const geos: THREE.BufferGeometry[] = [];
    staticParts.traverse(object => {
      if (object instanceof THREE.Mesh && object.material === mat) {
        const geo = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
        // ShapeGeometry and boxes use different auxiliary attributes; the
        // baked surfaces require only positions/normals (no texture UVs).
        for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
        geo.applyMatrix4(object.matrixWorld); geos.push(geo); object.geometry.dispose();
      }
    });
    if (!geos.length) { mat.dispose(); continue; }
    const geometry = mergeGeometries(geos)!; geos.forEach(g => g.dispose());
    const m = new THREE.Mesh(geometry, mat); m.castShadow = m.receiveShadow = true; root.add(m);
  }
  root.add(flame); return root;
}
