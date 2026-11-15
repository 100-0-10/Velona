import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Authored, texture-free forest creature. The rendering rig does not own collision or combat.
type Section = readonly [z: number, width: number, centerY: number, height: number];
type BoarRig = { torso: THREE.Group; head: THREE.Group; legs: THREE.Group[]; ears: THREE.Group[]; tail: THREE.Group };
const fur = 0x51402f, shoulder = 0x64513b, face = 0x45372b, mane = 0x302a24;

function painted(geometry: THREE.BufferGeometry, color: number, position?: THREE.Vector3, rotation?: THREE.Euler, scale?: THREE.Vector3) {
  let result = geometry.index ? geometry.toNonIndexed() : geometry;
  if (result !== geometry) geometry.dispose();
  result.deleteAttribute('uv');
  const rgb = new THREE.Color(color), colors = new Float32Array(result.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) { colors[i] = rgb.r; colors[i + 1] = rgb.g; colors[i + 2] = rgb.b; }
  result.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const matrix = new THREE.Matrix4().compose(position ?? new THREE.Vector3(), new THREE.Quaternion().setFromEuler(rotation ?? new THREE.Euler()), scale ?? new THREE.Vector3(1, 1, 1));
  result.applyMatrix4(matrix);
  return result;
}

function skin(sections: readonly Section[], sides = 14) {
  const vertices: number[] = [], indices: number[] = [];
  for (const [z, width, centerY, height] of sections) {
    for (let i = 0; i <= sides; i++) {
      const angle = i / sides * Math.PI * 2;
      vertices.push(Math.cos(angle) * width, centerY + Math.sin(angle) * height, z);
    }
  }
  for (let row = 0; row < sections.length - 1; row++) {
    for (let side = 0; side < sides; side++) {
      const a = row * (sides + 1) + side, b = a + sides + 1;
      indices.push(a, b + 1, b, a, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setIndex(indices); geo.computeVertexNormals(); return geo;
}

function ellipsoid(parts: THREE.BufferGeometry[], color: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation = new THREE.Euler()) {
  parts.push(painted(new THREE.SphereGeometry(1, 12, 8), color, new THREE.Vector3(x, y, z), rotation, new THREE.Vector3(sx, sy, sz)));
}

function batch(parts: THREE.BufferGeometry[], name: string, roughness = .94) {
  const geometry = mergeGeometries(parts)!; for (const part of parts) part.dispose();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness }));
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}

function branch(points: THREE.Vector3[], radius: number, color: number, radial = 6) {
  return painted(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, radius, radial, false), color);
}

function earGeometry(side: number, inner = false) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.quadraticCurveTo(side * .24, .05, side * .29, .36); shape.quadraticCurveTo(side * .25, .49, side * .04, .3); shape.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: inner ? .012 : .065, bevelEnabled: !inner, bevelSize: .025, bevelThickness: .015, bevelSegments: 1, steps: 1, curveSegments: 3 });
  return painted(geo, inner ? 0xa37c67 : face, new THREE.Vector3(inner ? side * .025 : 0, inner ? .035 : 0, inner ? .076 : 0), undefined, inner ? new THREE.Vector3(.69, .7, 1) : undefined);
}

export function createBoar(): THREE.Group {
  const root = new THREE.Group(); root.name = 'stonejawBoar';
  const torso = new THREE.Group(); torso.name = 'boarTorso'; root.add(torso);
  const trunk: THREE.BufferGeometry[] = [];
  // Narrow hindquarters rise into heavy shoulders. The underside stays above the legs.
  trunk.push(painted(skin([
    [-1.05, .015, .9, .015], [-.94, .26, .94, .33], [-.68, .44, 1.03, .48],
    [-.25, .49, 1.04, .54], [.2, .57, 1.12, .61], [.52, .51, 1.12, .59],
    [.71, .3, 1.08, .4], [.78, .025, 1.05, .04],
  ]), fur));
  ellipsoid(trunk, shoulder, 0, 1.23, .25, .49, .46, .57);
  // Layered bristle ribbons follow the spine instead of forming cartoon cone spikes.
  for (let row = 0; row < 3; row++) {
    const x = (row - 1) * .09;
    for (let i = 0; i < 10; i++) {
      const z = -.78 + i * .135, y = [1.4, 1.49, 1.515, 1.54, 1.565, 1.615, 1.67, 1.705, 1.702, 1.698][i];
      const shape = new THREE.Shape(); shape.moveTo(-.055, 0); shape.lineTo(.025, .16 + i % 3 * .025); shape.lineTo(.075, -.035); shape.closePath();
      const tuft = new THREE.ExtrudeGeometry(shape, { depth: .045, bevelEnabled: false });
      trunk.push(painted(tuft, i % 3 === 0 ? 0x705d43 : mane, new THREE.Vector3(x, y, z), new THREE.Euler(.4, Math.PI / 2, -.1)));
    }
  }
  // Natural stone scutes give this creature its stonejaw identity without covering its anatomy.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      trunk.push(painted(new THREE.DodecahedronGeometry(1, 0), i % 2 ? 0x817a62 : 0x716d59, new THREE.Vector3(side * (.46 + i % 2 * .04), 1.24 + i * .09, .27 - i * .15), new THREE.Euler(.2 * i, .3, side * .3), new THREE.Vector3(.1, .17, .22)));
    }
    // Short cheek/shoulder hair creases read at the three-quarter gameplay angle.
    for (let i = 0; i < 4; i++) ellipsoid(trunk, i % 2 ? 0x70573c : 0x3d3329, side * .52, 1.05 + i * .065, .31 - i * .09, .018, .05, .12, new THREE.Euler(.2, 0, side * -.3));
  }
  torso.add(batch(trunk, 'boarHideAndMane'));

  const head = new THREE.Group(); head.name = 'boarHead'; head.position.set(0, 1.08, .64); torso.add(head);
  const skull: THREE.BufferGeometry[] = [];
  skull.push(painted(skin([
    [-.22, .02, .02, .02], [-.12, .32, .02, .36], [.11, .36, -.015, .34],
    [.34, .3, -.13, .26], [.61, .23, -.22, .18], [.75, .2, -.24, .15], [.78, .02, -.24, .02],
  ], 12), face));
  ellipsoid(skull, 0x725440, 0, -.22, .71, .245, .17, .09);
  // Distinct broad muzzle, paired dark nostrils and a jawline.
  for (const side of [-1, 1]) {
    ellipsoid(skull, 0x261f1c, side * .108, -.20, .784, .049, .036, .012, new THREE.Euler(0, side * .14, 0));
    ellipsoid(skull, 0x38312b, side * .235, -.3, .35, .12, .095, .34);
    ellipsoid(skull, 0x3a3027, side * .29, .16, .16, .105, .045, .13, new THREE.Euler(.12, side * .2, side * -.25));
    skull.push(painted(new THREE.DodecahedronGeometry(1, 0), 0x8b8067, new THREE.Vector3(side * .277, -.2, .41), new THREE.Euler(.25, side * .25, .15), new THREE.Vector3(.09, .12, .21)));
  }
  head.add(batch(skull, 'boarSkullMuzzle'));
  const eyes: THREE.BufferGeometry[] = [], tusks: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    ellipsoid(eyes, 0xc7ad76, side * .324, .075, .24, .043, .04, .067);
    ellipsoid(eyes, 0x171a16, side * .353, .079, .263, .025, .028, .042);
    ellipsoid(eyes, 0xffe7be, side * .367, .09, .275, .007, .009, .012);
    // Tapered tusks bend out, forward and up from the lower jaw.
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * .24, -.28, .55), new THREE.Vector3(side * .36, -.22, .64),
      new THREE.Vector3(side * .41, -.075, .66), new THREE.Vector3(side * .39, .075, .63),
    ]);
    const tube = new THREE.TubeGeometry(curve, 12, .065, 7, false);
    const position = tube.getAttribute('position');
    // Tube rows are sampled along the curve; shrink towards the free tip.
    for (let row = 0; row <= 12; row++) {
      const center = curve.getPointAt(row / 12), taper = 1 - Math.pow(row / 12, 1.6) * .97;
      for (let column = 0; column <= 7; column++) {
        const index = row * 8 + column;
        position.setXYZ(index, center.x + (position.getX(index) - center.x) * taper, center.y + (position.getY(index) - center.y) * taper, center.z + (position.getZ(index) - center.z) * taper);
      }
    }
    tube.computeVertexNormals(); tusks.push(painted(tube, 0xe6d7b3));
  }
  head.add(batch(eyes, 'boarEyes', .28), batch(tusks, 'boarTusks', .48));

  const ears: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(side * .21, .23, -.02); ear.rotation.set(-.17, side * -.25, side * -.1); ear.name = side < 0 ? 'boarLeftEar' : 'boarRightEar';
    ear.add(batch([earGeometry(side), earGeometry(side, true)], 'boarEar')); head.add(ear); ears.push(ear);
  }

  const legs: THREE.Group[] = [];
  for (let pair = 0; pair < 2; pair++) for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.name = `boarLeg${pair}${side}`; leg.position.set(side * (pair === 0 ? .36 : .39), .73, pair === 0 ? -.66 : .44);
    const parts: THREE.BufferGeometry[] = [];
    ellipsoid(parts, shoulder, 0, -.03, 0, .17, .29, .18, new THREE.Euler(pair === 0 ? -.22 : .09, 0, 0));
    ellipsoid(parts, fur, 0, -.37, pair === 0 ? -.035 : .025, .105, .25, .105, new THREE.Euler(pair === 0 ? .18 : -.08, 0, 0));
    for (const toe of [-1, 1]) {
      const hoof = new THREE.BoxGeometry(.083, .13, .22); hoof.translate(toe * .048, -.65, .042);
      parts.push(painted(hoof, 0x292a25));
    }
    leg.add(batch(parts, 'boarLegHideAndHooves')); torso.add(leg); legs.push(leg);
  }
  const tail = new THREE.Group(); tail.name = 'boarTail'; tail.position.set(0, 1, -.96);
  const tailParts = [branch([new THREE.Vector3(0, 0, 0), new THREE.Vector3(.04, -.06, -.14), new THREE.Vector3(.055, -.25, -.24), new THREE.Vector3(.015, -.36, -.2)], .03, fur)];
  ellipsoid(tailParts, mane, .015, -.34, -.2, .052, .09, .05); tail.add(batch(tailParts, 'boarTailTuft')); torso.add(tail);
  root.userData.boarRig = { torso, head, legs, ears, tail } satisfies BoarRig;
  root.userData.visualSource = 'Velona authored geometry; no external model';
  return root;
}

/** Pure cosmetic animation. The caller owns root position, heading and corpse rotation. */
export function animateBoar(group: THREE.Group, elapsed: number, moving: boolean, state: string) {
  const rig = group.userData.boarRig as BoarRig | undefined; if (!rig) return;
  const alive = state !== 'dead', charging = state === 'chasing', warning = state === 'telegraph';
  const gait = elapsed * (charging ? 12 : 7), amplitude = alive && moving ? (charging ? .62 : .36) : 0;
  rig.torso.position.y = alive ? (moving ? Math.abs(Math.sin(gait)) * .035 : Math.sin(elapsed * 2.1) * .012) : 0;
  rig.torso.rotation.z = alive && moving ? Math.sin(gait) * .025 : 0;
  rig.torso.scale.y = alive && !moving ? 1 + Math.sin(elapsed * 2.1) * .008 : 1;
  for (let i = 0; i < 4; i++) rig.legs[i].rotation.x = Math.sin(gait + (i === 0 || i === 3 ? 0 : Math.PI)) * amplitude;
  rig.head.rotation.x = warning ? .22 + Math.sin(elapsed * 17) * .035 : charging ? .12 : alive ? Math.sin(elapsed * 1.6) * .035 : .1;
  rig.head.rotation.y = alive && !moving && !warning ? Math.sin(elapsed * .8) * .045 : 0;
  rig.tail.rotation.z = alive ? Math.sin(elapsed * 3) * .16 : 0;
  rig.ears[0].rotation.x = -.17 + (alive ? Math.sin(elapsed * 2.8) * .04 : 0);
  rig.ears[1].rotation.x = -.17 + (alive ? Math.sin(elapsed * 2.8 + .8) * .04 : 0);
}
