import * as THREE from 'three';

// Texture coordinates and prop scatter share a seed on every client. None of
// these visual details changes the server's flat collision surface.
export function random(seed: number) { const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }
const smooth = (a: number, b: number, x: number) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(0, 1, x - ix), fy = smooth(0, 1, y - iy);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(random(ix + iy * 71), random(ix + 1 + iy * 71), fx), THREE.MathUtils.lerp(random(ix + (iy + 1) * 71), random(ix + 1 + (iy + 1) * 71), fx), fy);
}

export function createTerrain() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d')!; const image = ctx.createImageData(1024, 1024);
  for (let py = 0; py < 1024; py++) for (let px = 0; px < 1024; px++) {
    const x = (px / 1024 - .5) * 64, z = (py / 1024 - .5) * 64;
    const coarse = noise(x * .32 + 30, z * .32 + 30), fine = noise(x * 3 + 120, z * 3 + 120);
    const radius = Math.hypot(x, z);
    const clearing = 1 - smooth(5.3, 7.1, radius + (coarse - .5) * 2.6);
    const road = (1 - smooth(.65, 1.7, Math.abs(z - x * .48) + (coarse - .5) * .9)) * smooth(3, 6, x) * (1 - smooth(22, 27, x));
    const dirt = Math.max(clearing, road * .96, smooth(.77, .96, coarse) * .35);
    const grain = (random(px + py * 1024) - .5) * 10 + (fine - .5) * 13;
    const grass = [81 + coarse * 24, 101 + coarse * 23, 66 + coarse * 17];
    const soil = [151 + fine * 18, 129 + fine * 16, 93 + fine * 14];
    const i = (py * 1024 + px) * 4;
    for (let c = 0; c < 3; c++) image.data[i + c] = grass[c] * (1 - dirt) + soil[c] * dirt + grain;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  // Fine stones, fallen leaves and worn footpaths are painted into one map.
  for (let i = 0; i < 13500; i++) {
    const x = random(i * 3 + 10) * 1024, y = random(i * 3 + 11) * 1024;
    ctx.fillStyle = i % 4 === 0 ? '#ad98683d' : i % 3 === 0 ? '#2d3d2425' : '#cfbf8d20';
    ctx.beginPath(); ctx.ellipse(x, y, .4 + random(i) * 1.5, .3 + random(i + 2) * .8, i, 0, Math.PI * 2); ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, color: 0xffffff });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), mat); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.name = 'painted-forest-floor';
  return ground;
}

// Repeated template meshes retain their own shared geometry/material; transform
// them into instances instead of drawing each leaf/trunk in every tree.
export function instanceScenery(source: THREE.Group) {
  source.updateMatrixWorld(true);
  const batches = new Map<string, { mesh: THREE.Mesh; transforms: THREE.Matrix4[] }>();
  source.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const key = object.geometry.uuid + object.material.uuid;
    if (!batches.has(key)) batches.set(key, { mesh: object, transforms: [] });
    batches.get(key)!.transforms.push(object.matrixWorld.clone());
  });
  const result = new THREE.Group(); result.name = 'instanced-forest';
  for (const { mesh, transforms } of batches.values()) {
    const batch = new THREE.InstancedMesh(mesh.geometry, mesh.material, transforms.length);
    transforms.forEach((matrix, index) => batch.setMatrixAt(index, matrix));
    batch.castShadow = mesh.castShadow; batch.receiveShadow = mesh.receiveShadow;
    batch.computeBoundingSphere(); result.add(batch);
  }
  return result;
}

export function createGroundCover() {
  const group = new THREE.Group();
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-.06, 0, 0, .06, 0, 0, .035, .3, .04, .06, 0, 0, .13, .34, .07, .035, .3, .04, -.04, 0, -.06, .04, 0, .06, -.1, .24, .13], 3));
  blade.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide });
  const count = 1100, grass = new THREE.InstancedMesh(blade, mat, count), dummy = new THREE.Object3D(), tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const angle = random(i * 5) * Math.PI * 2, radius = 7.1 + random(i * 5 + 1) * 23;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    const onRoad = x > 3 && Math.abs(z - x * .48) < 1.7;
    dummy.position.set(x, onRoad ? -.6 : .015, z); dummy.rotation.set(0, random(i + 600) * Math.PI * 2, 0); dummy.scale.setScalar(.45 + random(i * 5 + 2) * .8); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
    tint.setHSL(.20 + random(i + 900) * .045, .25, .36 + random(i + 200) * .16); grass.setColorAt(i, tint);
  }
  grass.receiveShadow = true; grass.computeBoundingSphere(); group.add(grass);
  return group;
}
