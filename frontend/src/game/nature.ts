import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// These authored silhouettes are visual only; the server keeps its simple collision proxies.
const colors = {
  bark: new THREE.Color('#695342'), barkLight: new THREE.Color('#82694c'),
  fissure: new THREE.Color('#493d32'), moss: new THREE.Color('#687a43'),
  leaf: new THREE.Color('#466b43'), leafLight: new THREE.Color('#738b4c'),
  leafDark: new THREE.Color('#324e3c'), rock: new THREE.Color('#83887d'),
};
const woodMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, flatShading: true });
const foliageMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, flatShading: true, side: THREE.DoubleSide });
const stoneMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .98, flatShading: true });
const templates = new Map<number, THREE.Group>();

function seeded(n: number) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

function tinted(geometry: THREE.BufferGeometry, color: THREE.Color, variation = .1, seed = 0) {
  const result = geometry.index ? geometry.toNonIndexed() : geometry;
  result.deleteAttribute('uv');
  const count = result.getAttribute('position').count;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 3) {
    const amount = 1 + (seeded(i + seed) - .5) * variation;
    for (let v = i; v < Math.min(count, i + 3); v++) {
      data[v * 3] = color.r * amount; data[v * 3 + 1] = color.g * amount; data[v * 3 + 2] = color.b * amount;
    }
  }
  result.setAttribute('color', new THREE.BufferAttribute(data, 3));
  result.computeVertexNormals();
  if (result !== geometry) geometry.dispose();
  return result;
}

function batch(parts: THREE.BufferGeometry[], material: THREE.Material, name: string, castShadow = true) {
  const geometry = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name; mesh.castShadow = castShadow; mesh.receiveShadow = true;
  return mesh;
}

function branch(points: THREE.Vector3[], startRadius: number, endRadius: number, color: THREE.Color, seed: number, rings = 6) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, rings, 1, 7, false);
  const pos = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  for (let ring = 0; ring <= rings; ring++) {
    const center = curve.getPointAt(ring / rings);
    const radius = THREE.MathUtils.lerp(startRadius, endRadius, ring / rings);
    for (let side = 0; side < 8; side++) {
      const index = ring * 8 + side;
      const ripple = 1 + Math.sin(side * 3.1 + ring * .8 + seed) * .08;
      pos.setXYZ(index, center.x + normal.getX(index) * radius * ripple, center.y + normal.getY(index) * radius * ripple, center.z + normal.getZ(index) * radius * ripple);
    }
  }
  return tinted(geometry, color, .22, seed);
}

function leaf(position: THREE.Vector3, length: number, width: number, angle: number, pitch: number, color: THREE.Color, seed: number) {
  // Raised midrib and tapered serrated silhouette remain readable without alpha textures.
  const vertices = [0, 0, 0, -width * .42, .012, length * .3, -width * .5, 0, length * .58, 0, .065, length * .42, width * .5, 0, length * .58, width * .42, .012, length * .3, 0, .02, length];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex([0, 1, 3, 1, 2, 3, 2, 6, 3, 6, 4, 3, 4, 5, 3, 5, 0, 3]);
  geometry.rotateX(pitch); geometry.rotateY(angle); geometry.translate(position.x, position.y, position.z);
  return tinted(geometry, color, .16, seed);
}

function buildTree(variant: number) {
  const root = new THREE.Group(); root.name = 'branchingOak';
  const bark: THREE.BufferGeometry[] = [], cracks: THREE.BufferGeometry[] = [], foliage: THREE.BufferGeometry[] = [], moss: THREE.BufferGeometry[] = [];
  const lean = variant === 1 ? -.26 : .2;
  bark.push(branch([new THREE.Vector3(), new THREE.Vector3(.05, .8, .05), new THREE.Vector3(lean, 1.8, 0), new THREE.Vector3(.14, 2.9, -.08)], .25, .09, colors.bark, variant, 9));
  for (let n = 0; n < 6; n++) {
    const angle = n / 6 * Math.PI * 2 + variant * .8;
    bark.push(branch([new THREE.Vector3(Math.cos(angle) * .75, .035, Math.sin(angle) * .75), new THREE.Vector3(Math.cos(angle) * .36, .14, Math.sin(angle) * .36), new THREE.Vector3(.03, .55, 0)], .035, .15, colors.barkLight, n, 3));
  }
  // Actual branch forks are visible beneath the crown, instead of a pole with a sphere.
  for (let n = 0; n < 8; n++) {
    const angle = n * 2.39996 + variant * .7;
    const y = 1.35 + n % 3 * .38;
    const reach = .85 + seeded(n + variant * 20) * .45;
    const tip = new THREE.Vector3(Math.cos(angle) * reach, 2.65 + n % 3 * .3, Math.sin(angle) * reach);
    bark.push(branch([new THREE.Vector3(lean * .5, y, 0), new THREE.Vector3(Math.cos(angle) * reach * .5, y + .5, Math.sin(angle) * reach * .5), tip], .105 - n % 2 * .02, .026, colors.barkLight, n + 40, 4));
    const twigTip = tip.clone().add(new THREE.Vector3(Math.cos(angle + .9) * .45, .35, Math.sin(angle + .9) * .45));
    bark.push(branch([tip.clone().multiplyScalar(.85), tip, twigTip], .038, .012, colors.bark, n, 3));
  }
  for (let n = 0; n < 11; n++) {
    const a = n * 2.39996;
    const r = .235 + Math.sin(a) * .008;
    cracks.push(branch([new THREE.Vector3(Math.cos(a) * r, .1, Math.sin(a) * r), new THREE.Vector3(Math.cos(a) * r + .03, .6, Math.sin(a) * r), new THREE.Vector3(Math.cos(a) * .17 + lean * .4, 1.3, Math.sin(a) * .17)], .008, .004, colors.fissure, n, 3));
  }
  for (let n = 0; n < 6; n++) {
    const a = n * 1.9; const r = .29;
    const patch = new THREE.IcosahedronGeometry(.16, 0);
    patch.scale(.9, .25, 1.4); patch.rotateY(a); patch.translate(Math.cos(a) * r, .12, Math.sin(a) * r);
    moss.push(tinted(patch, colors.moss, .15, n));
  }
  const crownScale = variant === 2 ? .83 : 1;
  for (let n = 0; n < 17; n++) {
    const a = n * 2.39996 + variant;
    const r = n < 12 ? .82 + seeded(n + 19) * .6 : .3;
    const y = n < 12 ? 2.7 + seeded(n + 7) * .65 : 3.45 + seeded(n + 9) * .25;
    const center = new THREE.Vector3(Math.cos(a) * r * crownScale, y, Math.sin(a) * r * crownScale);
    const size = .57 + seeded(n + variant * 22) * .28;
    const cluster = new THREE.IcosahedronGeometry(size, 1);
    const points = cluster.getAttribute('position');
    for (let v = 0; v < points.count; v++) {
      const x = points.getX(v), cy = points.getY(v), z = points.getZ(v);
      const ripple = 1 + Math.sin(x * 18 + z * 11 + n) * .075;
      points.setXYZ(v, x * ripple * 1.18, cy * .67, z * ripple);
    }
    cluster.rotateY(a); cluster.translate(center.x, center.y, center.z);
    foliage.push(tinted(cluster, n % 3 === 0 ? colors.leafLight : n % 3 === 1 ? colors.leaf : colors.leafDark, .32, n));
    for (let f = 0; f < 4; f++) {
      const direction = a + f * Math.PI * .5;
      const edge = center.clone().add(new THREE.Vector3(Math.cos(direction) * size * .82, .03, Math.sin(direction) * size * .82));
      foliage.push(leaf(edge, .35, .2, -direction + Math.PI * .5, -.25 + seeded(f + n) * .5, n % 2 ? colors.leaf : colors.leafLight, n + f));
    }
  }
  root.add(batch(bark, woodMaterial, 'forkedTrunk'), batch(cracks, woodMaterial, 'barkFissures'), batch(moss, woodMaterial, 'rootMoss', false), batch(foliage, foliageMaterial, 'canopy'));
  return root;
}

/** Shared per-variant geometry; 4 merged draws and about 4k triangles per oak. */
export function createTree(height = 4, variant = 0): THREE.Group {
  const key = Math.abs(Math.floor(variant)) % 3;
  let template = templates.get(key);
  if (!template) { template = buildTree(key); templates.set(key, template); }
  const tree = template.clone(); tree.scale.setScalar(height / 3.6);
  tree.rotation.y = variant * 1.37;
  return tree;
}

let rockTemplate: THREE.Group | undefined;
export function createRock(size = 1): THREE.Group {
  if (!rockTemplate) {
    const group = new THREE.Group(); group.name = 'fracturedFieldstone';
    const points: number[] = [], indices: number[] = [];
    const sides = 7;
    for (let ring = 0; ring < 3; ring++) for (let n = 0; n < sides; n++) {
      const a = n / sides * Math.PI * 2;
      const radius = ring === 0 ? .82 : ring === 1 ? 1 : .61;
      const variation = 1 + (seeded(n * 3 + ring) - .5) * .22;
      points.push(Math.cos(a) * radius * variation, ring === 0 ? .02 : ring === 1 ? .27 + seeded(n + 10) * .12 : .66 + seeded(n + 20) * .22, Math.sin(a) * radius * variation * .77);
    }
    points.push(-.12, .89, .04);
    for (let ring = 0; ring < 2; ring++) for (let n = 0; n < sides; n++) {
      const a = ring * sides + n, b = ring * sides + (n + 1) % sides, c = a + sides, d = b + sides;
      indices.push(a, c, b, b, c, d);
    }
    for (let n = 0; n < sides; n++) indices.push(14 + n, 21, 14 + (n + 1) % sides);
    const stone = new THREE.BufferGeometry(); stone.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); stone.setIndex(indices);
    const rock = new THREE.Mesh(tinted(stone, colors.rock, .4, 22), stoneMaterial); rock.castShadow = true; rock.receiveShadow = true; group.add(rock);
    const seams: THREE.BufferGeometry[] = [];
    const moss: THREE.BufferGeometry[] = [];
    for (let n = 0; n < 4; n++) {
      const a = n * 2.4;
      const patch = new THREE.IcosahedronGeometry(.24, 0); patch.scale(1.3, .09, .85); patch.rotateY(a); patch.translate(Math.cos(a) * .46, .1, Math.sin(a) * .38);
      moss.push(tinted(patch, colors.moss, .22, n));
    }
    seams.push(branch([new THREE.Vector3(-.65, .51, .22), new THREE.Vector3(-.37, .7, .26), new THREE.Vector3(-.1, .885, .05)], .013, .008, new THREE.Color('#c5c3aa'), 3, 3));
    seams.push(branch([new THREE.Vector3(-.65, .51, .22), new THREE.Vector3(-.64, .32, .39), new THREE.Vector3(-.63, .08, .4)], .012, .005, colors.fissure, 7, 3));
    group.add(batch(moss, stoneMaterial, 'lichen', false), batch(seams, stoneMaterial, 'mineralSeams', false));
    rockTemplate = group;
  }
  const rock = rockTemplate.clone(); rock.scale.setScalar(size); return rock;
}

let plantTemplate: THREE.Group | undefined;
export function createPlant(): THREE.Group {
  if (!plantTemplate) {
    const group = new THREE.Group(); group.name = 'wildFlaxAndFern';
    const leaves: THREE.BufferGeometry[] = [], stalks: THREE.BufferGeometry[] = [], flowers: THREE.BufferGeometry[] = [];
    const stemColor = new THREE.Color('#6c7c43'), leafColor = new THREE.Color('#6d8b4b');
    for (let n = 0; n < 7; n++) {
      const a = n * 2.39996, radius = .14 + seeded(n) * .18;
      const x = Math.cos(a) * radius, z = Math.sin(a) * radius, height = .65 + seeded(n + 5) * .45;
      const tip = new THREE.Vector3(x * 1.6, height, z * 1.6);
      stalks.push(branch([new THREE.Vector3(x, 0, z), new THREE.Vector3(x * 1.2, height * .55, z * 1.2), tip], .015, .006, stemColor, n, 3));
      for (let l = 0; l < 3; l++) {
        const stem = new THREE.Vector3(x * 1.2, .15 + l * .19, z * 1.2);
        leaves.push(leaf(stem, .27, .075, a + l * 2.4, -.45 - l * .08, leafColor, n + l));
      }
      const center = new THREE.IcosahedronGeometry(.033, 0); center.translate(tip.x, tip.y + .025, tip.z); flowers.push(tinted(center, new THREE.Color('#cfb45f'), .08, n));
      for (let p = 0; p < 5; p++) {
        const petal = new THREE.SphereGeometry(.052, 4, 2); petal.scale(.6, .2, 1); petal.rotateY(p / 5 * Math.PI * 2);
        petal.translate(tip.x + Math.cos(p / 5 * Math.PI * 2) * .052, tip.y + .02, tip.z + Math.sin(p / 5 * Math.PI * 2) * .052);
        flowers.push(tinted(petal, new THREE.Color('#b1b6c1'), .1, p));
      }
    }
    // Low arching fern fronds add a second recognizable silhouette around fibrous stalks.
    for (let n = 0; n < 6; n++) {
      const a = n * Math.PI / 3 + .3;
      for (let l = 0; l < 5; l++) {
        const distance = .08 + l * .09;
        const position = new THREE.Vector3(Math.cos(a) * distance, .12 + Math.sin(l / 5 * Math.PI) * .25, Math.sin(a) * distance);
        const width = .14 * (1 - l / 7);
        for (const side of [-1, 1]) leaves.push(leaf(position, .2 * (1 - l / 7), width, -a + Math.PI * .5 + side * .9, .1, l % 2 ? leafColor : colors.leafLight, n + l));
      }
    }
    group.add(batch(stalks, woodMaterial, 'flaxStems', false), batch(leaves, foliageMaterial, 'fernFronds', false), batch(flowers, foliageMaterial, 'flaxFlowers', false));
    plantTemplate = group;
  }
  return plantTemplate.clone();
}
