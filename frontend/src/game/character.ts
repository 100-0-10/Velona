import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Pose = 'idle' | 'walk' | 'gather' | 'attack' | 'downed';
type ExplorerAnimation = {
  disposed: boolean;
  visual?: THREE.Group;
  mixer?: THREE.AnimationMixer;
  actions?: Record<Pose, THREE.AnimationAction>;
  active?: Pose;
  attackAge: number;
  accentMaterial?: THREE.MeshStandardMaterial;
};
export type ExplorerVisualState = { dt: number; elapsed: number; moving: boolean; gathering: boolean; attackAge: number; downed: boolean };
const characters = new WeakMap<THREE.Group, ExplorerAnimation>();
let templatePromise: Promise<GLTF> | undefined;

// Six body submeshes use one atlas and one skeleton. Merge them once before cloning,
// so a visible player needs one skinned-body draw instead of six.
function mergeBody(scene: THREE.Group) {
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse(object => { if (object instanceof THREE.SkinnedMesh) meshes.push(object); });
  const first = meshes[0];
  if (!first || meshes.some(m => m.parent !== first.parent || m.material !== first.material)) return;
  const geometry = mergeGeometries(meshes.map(m => m.geometry), false);
  if (!geometry) return;
  const body = new THREE.SkinnedMesh(geometry, first.material);
  body.name = 'ExplorerSkin'; body.bind(first.skeleton, first.bindMatrix);
  first.parent!.add(body);
  for (const mesh of meshes) mesh.removeFromParent();
}

type Part = { geometry: THREE.BufferGeometry; color: number; position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] };
function authoredMesh(parts: Part[], name: string) {
  const transform = new THREE.Object3D();
  const geometries = parts.map(part => {
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    if (geometry !== part.geometry) part.geometry.dispose();
    transform.position.set(...(part.position ?? [0, 0, 0]));
    transform.rotation.set(...(part.rotation ?? [0, 0, 0]));
    transform.scale.set(...(part.scale ?? [1, 1, 1])); transform.updateMatrix(); geometry.applyMatrix4(transform.matrix);
    const color = new THREE.Color(part.color); const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.deleteAttribute('uv'); return geometry;
  });
  const geometry = mergeGeometries(geometries, false)!;
  for (const source of geometries) source.dispose();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92 }));
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}

function addSurvivalKit(scene: THREE.Group) {
  const chest = scene.getObjectByName('chest');
  // GLTFLoader removes periods from names to keep animation binding paths valid.
  const hand = scene.getObjectByName('handslotr') ?? scene.getObjectByName('handslot.r');
  if (chest) {
    chest.add(authoredMesh([
      { geometry: new THREE.BoxGeometry(.49, .54, .24), color: 0x795638, position: [0, -.09, -.26] },
      { geometry: new THREE.SphereGeometry(.25, 8, 5), color: 0x946d47, position: [0, .16, -.27], scale: [1.08, .45, .58] },
      { geometry: new THREE.BoxGeometry(.2, .18, .06), color: 0x65462e, position: [0, -.2, -.4] },
      { geometry: new THREE.BoxGeometry(.055, .5, .03), color: 0xb8a777, position: [-.16, -.075, -.395] },
      { geometry: new THREE.BoxGeometry(.055, .5, .03), color: 0xb8a777, position: [.16, -.075, -.395] },
      { geometry: new THREE.CylinderGeometry(.115, .115, .62, 8), color: 0xaab28c, position: [0, .31, -.27], rotation: [0, 0, Math.PI / 2] },
      { geometry: new THREE.CylinderGeometry(.12, .12, .035, 8), color: 0x514c36, position: [-.19, .31, -.27], rotation: [0, 0, Math.PI / 2] },
      { geometry: new THREE.CylinderGeometry(.12, .12, .035, 8), color: 0x514c36, position: [.19, .31, -.27], rotation: [0, 0, Math.PI / 2] },
    ], 'TrailBackpack'));
    chest.add(authoredMesh([
      { geometry: new THREE.TorusGeometry(.155, .055, 4, 10), color: 0xffffff, position: [0, .22, 0], rotation: [Math.PI / 2, 0, 0], scale: [1.15, 1, 1] },
      { geometry: new THREE.BoxGeometry(.12, .24, .045), color: 0xc4d0bb, position: [-.095, .09, .14], rotation: [0, 0, -.18] },
    ], 'ScarfAccent'));
  }
  if (hand) {
    // Hand-slot local Y is the grip axis of the supplied rig's two-handed stab.
    const spear = authoredMesh([
      { geometry: new THREE.CylinderGeometry(.022, .03, 1.95, 7), color: 0x725039, position: [0, .3, 0] },
      { geometry: new THREE.ConeGeometry(.105, .32, 4), color: 0xc2c3b3, position: [0, 1.41, 0], scale: [.75, 1, .55] },
      { geometry: new THREE.CylinderGeometry(.04, .04, .17, 7), color: 0xb6a078, position: [0, 1.19, 0] },
      { geometry: new THREE.CylinderGeometry(.035, .035, .14, 7), color: 0x493b2b, position: [0, -.52, 0] },
    ], 'StoneSpear');
    hand.add(spear);
  }
}

function loadTemplate() {
  templatePromise ??= new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'assets/characters/explorer.glb').then(gltf => {
    mergeBody(gltf.scene); addSurvivalKit(gltf.scene);
    gltf.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true; object.receiveShadow = true;
        if (object instanceof THREE.SkinnedMesh) object.frustumCulled = false;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof THREE.MeshStandardMaterial) { material.roughness = .9; material.metalness = 0; }
        }
      }
    });
    return gltf;
  });
  return templatePromise;
}

function loadingSilhouette() {
  const fallback = new THREE.Group(); fallback.name = 'ExplorerLoading';
  const material = new THREE.MeshStandardMaterial({ color: 0x8b7957, roughness: 1 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.27, .72, 3, 7), material); body.position.y = .9; fallback.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(.23, 1), material); head.position.y = 1.65; fallback.add(head);
  return fallback;
}
function disposeFallback(fallback: THREE.Object3D) {
  fallback.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose(); } });
  fallback.removeFromParent();
}

/** The returned body group owns animation only; its parent controls world translation and heading. */
export function createExplorerVisual(color: string) {
  const root = new THREE.Group(); root.name = 'body'; root.userData.assetState = 'loading';
  const state: ExplorerAnimation = { disposed: false, attackAge: Infinity }; characters.set(root, state);
  const fallback = loadingSilhouette(); root.add(fallback);
  void loadTemplate().then(gltf => {
    if (state.disposed) return;
    disposeFallback(fallback);
    const visual = clone(gltf.scene) as THREE.Group; visual.name = 'ExplorerVisual';
    // KayKit's authored proportions are in metres; keep body at the existing two-metre game scale.
    visual.scale.setScalar(1.08); root.add(visual); state.visual = visual;
    const accent = visual.getObjectByName('ScarfAccent');
    if (accent instanceof THREE.Mesh && accent.material instanceof THREE.MeshStandardMaterial) {
      state.accentMaterial = accent.material.clone(); state.accentMaterial.color.set(color).lerp(new THREE.Color(0xb6ac84), .3); accent.material = state.accentMaterial;
    }
    const mixer = new THREE.AnimationMixer(visual); state.mixer = mixer;
    const action = (name: string) => mixer.clipAction(gltf.animations.find(clip => clip.name === name)!);
    state.actions = { idle: action('Idle'), walk: action('Running_A'), gather: action('Interact'), attack: action('2H_Melee_Attack_Stab'), downed: action('Death_A') };
    state.actions.attack.setLoop(THREE.LoopOnce, 1); state.actions.attack.clampWhenFinished = true;
    state.actions.downed.setLoop(THREE.LoopOnce, 1); state.actions.downed.clampWhenFinished = true;
    state.actions.idle.play(); state.active = 'idle'; mixer.update(0);
    root.userData.assetState = 'ready'; root.userData.assetClips = gltf.animations.length;
    root.userData.assetTriangles = 4655; root.userData.assetBytes = 556944;
  }).catch(error => {
    if (state.disposed) return;
    root.userData.assetState = 'failed'; root.userData.assetError = error instanceof Error ? error.message : String(error);
  });
  return root;
}

export function updateExplorerVisual(root: THREE.Group, input: ExplorerVisualState) {
  const state = characters.get(root); if (!state || state.disposed) return;
  const { dt, moving, gathering, attackAge, downed } = input;
  const pose: Pose = downed ? 'downed' : attackAge < .35 ? 'attack' : moving ? 'walk' : gathering ? 'gather' : 'idle';
  if (!state.mixer || !state.actions) { root.rotation.x = gathering ? .12 + Math.sin(input.elapsed * 6) * .04 : 0; return; }
  root.rotation.x = 0; root.rotation.z = 0;
  const spear = state.visual?.getObjectByName('StoneSpear'); if (spear) spear.visible = pose !== 'gather';
  const next = state.actions[pose];
  const newAttack = pose === 'attack' && attackAge < state.attackAge;
  if (state.active !== pose || newAttack) {
    const previous = state.active ? state.actions[state.active] : undefined;
    next.reset().setEffectiveTimeScale(pose === 'attack' ? next.getClip().duration / .35 : pose === 'walk' ? .9 : pose === 'gather' ? .8 : 1).setEffectiveWeight(1).play();
    if (previous && previous !== next) previous.fadeOut(.1);
    next.fadeIn(.1); state.active = pose;
  }
  state.attackAge = attackAge; state.mixer.update(dt);
}

/** Detach shared model geometry/maps before the scene's generic per-object disposer runs. */
export function disposeExplorerVisual(root: THREE.Group) {
  const state = characters.get(root); if (!state || state.disposed) return;
  state.disposed = true;
  if (state.mixer && state.visual) { state.mixer.stopAllAction(); state.mixer.uncacheRoot(state.visual); }
  const skeletons = new Set<THREE.Skeleton>();
  state.visual?.traverse(object => { if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton); });
  for (const skeleton of skeletons) skeleton.dispose();
  state.accentMaterial?.dispose(); state.visual?.removeFromParent();
  const fallback = root.getObjectByName('ExplorerLoading'); if (fallback) disposeFallback(fallback);
  characters.delete(root);
}
