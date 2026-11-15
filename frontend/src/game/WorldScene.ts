import * as THREE from 'three';
import type { WorldSnapshot } from '../types';
import { boar, camp, explorer, label, resource, rock, tree } from './models';
import { animateBoar } from './creature';
import { updateExplorerVisual, disposeExplorerVisual } from './character';
import { createTerrain, createGroundCover, instanceScenery, random } from './environment';

export class WorldScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-16, 16, 12, -12, .1, 160);
  private observer: ResizeObserver;
  private frame = 0;
  private lastTime = performance.now();
  private elapsed = 0;
  private snapshot: WorldSnapshot | null = null;
  private players = new Map<string, THREE.Group>();
  private nodes = new Map<string, THREE.Group>();
  private monsters = new Map<string, THREE.Group>();
  private stations = new Map<string, THREE.Group>();
  private danger = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshBasicMaterial({ color: 0xc85437, transparent: true, opacity: .38, depthWrite: false }));
  private cameraTarget = new THREE.Vector3(2, 0, 2);
  private flame: THREE.Object3D | undefined;
  private attackAt = -10;
  private targetVector = new THREE.Vector3();
  private cameraOffset = new THREE.Vector3(20, 25, 20);

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.setAttribute('aria-label', '새벽 야영지 3D 게임 화면'); this.renderer.domElement.dataset.testid = 'world-canvas'; container.append(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xa7b9ab); this.scene.fog = new THREE.Fog(0xa7b9ab, 43, 78);
    this.scene.add(new THREE.HemisphereLight(0xe5eddc, 0x484733, 1.65));
    const sun = new THREE.DirectionalLight(0xffe0ae, 2.5); sun.position.set(-14, 24, 8); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -28; sun.shadow.camera.right = 28; sun.shadow.camera.top = 28; sun.shadow.camera.bottom = -28; sun.shadow.normalBias = .035; sun.shadow.bias = -.00015; this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xc8dfda, .5); rim.position.set(10, 10, -15); this.scene.add(rim);
    this.scene.add(createTerrain());
    const base = camp(); this.flame = base.getObjectByName('flame'); this.scene.add(base);
    this.addScenery();
    this.danger.rotation.x = -Math.PI / 2; this.danger.position.y = .05; this.danger.visible = false; this.scene.add(this.danger);
    const outskirts = label('동쪽 숲 · 채집과 사냥'); outskirts.position.set(13, 3.5, 4); outskirts.scale.multiplyScalar(1.1); this.scene.add(outskirts);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container); this.resize(); this.animate();
  }

  private addScenery() {
    const forest = new THREE.Group();
    // Authored silhouettes are repeated as template instances, rather than
    // multiplying draw calls for each tree's branches and foliage.
    for (let n = 0; n < 52; n++) {
      const a = n * 2.39996, foreground = Math.cos(a) + Math.sin(a) > .4;
      const radius = (foreground ? 26 : 19) + random(n + 1) * 9;
      const t = tree((foreground ? 2.8 : 3.8) + random(n + 7) * 1.8, n % 3); t.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius); t.rotation.y = a; forest.add(t);
    }
    for (let n = 0; n < 34; n++) { const r = rock(.3 + n % 4 * .2); r.position.set(Math.sin(n * 4.3) * 24, 0, Math.cos(n * 2.7) * 24); r.rotation.y = n; if (r.position.length() > 9) forest.add(r); }
    this.scene.add(instanceScenery(forest), createGroundCover());
    const border = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-24,.03,-24),new THREE.Vector3(24,.03,-24),new THREE.Vector3(24,.03,24),new THREE.Vector3(-24,.03,24)]), new THREE.LineBasicMaterial({ color: 0x667c52, transparent: true, opacity: .6 })); this.scene.add(border);
  }

  setSnapshot(snapshot: WorldSnapshot) {
    this.snapshot = snapshot;
    const activePlayers = new Set(snapshot.players.map(p => p.id));
    for (const [id, group] of this.players) if (!activePlayers.has(id)) { disposeExplorerVisual(group.getObjectByName('body') as THREE.Group); this.disposeObject(group); this.players.delete(id); }
    for (const p of snapshot.players) if (!this.players.has(p.id)) { const g = explorer(p.color, p.name, p.id === snapshot.selfPlayerId); g.position.set(p.x, 0, p.z); this.players.set(p.id, g); this.scene.add(g); }
    for (const n of snapshot.nodes) {
      if (!this.nodes.has(n.id)) {
        const g = resource(n.itemId); g.position.set(n.x, 0, n.z);
        const crown = g.getObjectByName('canopy');
        if (crown instanceof THREE.Mesh) { crown.material = (crown.material as THREE.MeshStandardMaterial).clone(); (crown.material as THREE.MeshStandardMaterial).transparent = true; }
        const tag = label(n.name); tag.name = 'nodeLabel'; tag.position.y = n.itemId === 'log' || n.itemId === 'bark' ? 4 : 1.6; g.add(tag); this.nodes.set(n.id, g); this.scene.add(g);
      }
      const group = this.nodes.get(n.id)!; group.scale.setScalar(n.available || n.itemId === 'bark' || n.itemId === 'log' ? 1 : .35);
    }
    for (const m of snapshot.monsters) if (!this.monsters.has(m.id)) { const g = boar(); g.position.set(m.x, 0, m.z); this.monsters.set(m.id, g); this.scene.add(g); }
    for (const station of snapshot.stations ?? []) if (!this.stations.has(station.id)) {
      const g = new THREE.Group(); g.position.set(station.x, 0, station.z);
      const tag = label(station.name, '#e4cfa4'); tag.name = 'stationLabel'; tag.position.y = station.kind === 'dry' ? 2.9 : 1.8; tag.scale.multiplyScalar(.83); g.add(tag);
      const ring = new THREE.Mesh(new THREE.RingGeometry(.63, .66, 32), new THREE.MeshBasicMaterial({ color: 0xe2c489, transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .03; g.add(ring);
      g.visible = false; this.stations.set(station.id, g); this.scene.add(g);
    }
  }

  playAttack() { this.attackAt = this.elapsed; }

  private resize() {
    const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight); const aspect = width / height;
    const vertical = width < 700 ? 9.5 : 10.5; this.camera.left = -vertical * aspect; this.camera.right = vertical * aspect; this.camera.top = vertical; this.camera.bottom = -vertical; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false);
  }

  private animate = () => {
    this.frame = requestAnimationFrame(this.animate); const now = performance.now(); const dt = Math.min(.1, (now - this.lastTime) / 1000); this.lastTime = now; this.elapsed += dt;
    const s = this.snapshot; const alpha = 1 - Math.exp(-dt * 14);
    if (s) {
      for (const p of s.players) {
        const g = this.players.get(p.id)!; const dx = p.x - g.position.x, dz = p.z - g.position.z; const moving = Math.hypot(dx, dz) > .02;
        g.position.x += dx * alpha; g.position.z += dz * alpha;
        const body = g.getObjectByName('body') as THREE.Group; if (moving) body.rotation.y = Math.atan2(dx, dz);
        if (p.gatheringItemId && !moving) {
          const job = p.id === s.selfPlayerId ? s.gathering : null;
          const target = job?.sourceKind === 'node' ? s.nodes.find(n => n.id === job.sourceId) : job?.sourceKind === 'corpse' ? s.monsters.find(m => m.id === job.sourceId) : undefined;
          if (target) body.rotation.y = Math.atan2(target.x - p.x, target.z - p.z);
        }
        updateExplorerVisual(body, { dt, elapsed: this.elapsed, moving, gathering: !!p.gatheringItemId, attackAge: p.id === s.selfPlayerId ? this.elapsed - this.attackAt : 10, downed: p.isDowned });
      }
      const self = s.players.find(p => p.id === s.selfPlayerId);
      for (const station of s.stations ?? []) {
        const group = this.stations.get(station.id); if (group) group.visible = !!self && Math.hypot(self.x - station.x, self.z - station.z) <= station.interactionRadius + .8;
      }
      if (self) this.cameraTarget.lerp(this.targetVector.set(self.x + 1, 0, self.z + 1), 1 - Math.exp(-dt * 3));
      for (const n of s.nodes) {
        const g = this.nodes.get(n.id)!; const distance = self ? Math.hypot(self.x - n.x, self.z - n.z) : 100;
        const tag = g.getObjectByName('nodeLabel'); if (tag) tag.visible = n.available && distance < 5;
        const crown = g.getObjectByName('canopy');
        if (crown instanceof THREE.Mesh) {
          const mat = crown.material as THREE.MeshStandardMaterial;
          const obscuresPlayer = !!self && distance < 3.2 && n.x + n.z > self.x + self.z - 1;
          mat.opacity = THREE.MathUtils.lerp(mat.opacity, obscuresPlayer ? .26 : n.available ? 1 : .5, alpha);
          mat.depthWrite = mat.opacity > .95;
        }
      }
      this.danger.visible = false;
      for (const m of s.monsters) {
        const g = this.monsters.get(m.id)!; const dx = m.x - g.position.x, dz = m.z - g.position.z; g.position.x += dx * alpha; g.position.z += dz * alpha;
        if (Math.hypot(dx, dz) > .02) g.rotation.y = Math.atan2(dx, dz); g.rotation.z = m.state === 'dead' ? Math.PI / 2 : 0; g.position.y = m.state === 'dead' ? .15 : 0;
        animateBoar(g, this.elapsed, Math.hypot(dx, dz) > .025, m.state);
        if (m.state === 'telegraph') { this.danger.visible = true; this.danger.position.set(m.telegraphX ?? m.x, .05, m.telegraphZ ?? m.z); (this.danger.material as THREE.MeshBasicMaterial).opacity = .28 + Math.sin(this.elapsed * 13) * .1; }
      }
    }
    if (this.flame) { this.flame.scale.y = 1 + Math.sin(this.elapsed * 8) * .1; this.flame.rotation.y += dt; }
    this.camera.position.copy(this.cameraTarget).add(this.cameraOffset); this.camera.lookAt(this.cameraTarget); this.renderer.render(this.scene, this.camera);
  };

  getDiagnostics() {
    let charactersReady = 0, characterErrors = 0, characterTriangles = 0; const materials = new Set<THREE.Material>();
    for (const p of this.players.values()) { const data = p.getObjectByName('body')!.userData; if (data.assetState === 'ready') charactersReady++; if (data.assetState === 'failed') characterErrors++; characterTriangles += data.assetTriangles ?? 0; }
    this.scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat); });
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, materials: materials.size, width: this.renderer.domElement.width, height: this.renderer.domElement.height, dpr: this.renderer.getPixelRatio(), players: this.players.size, charactersReady, characterErrors, characterTriangles, postPasses: 0, shadowLights: 1 };
  }

  private disposeObject(object: THREE.Object3D) {
    object.removeFromParent(); object.traverse(child => { if (child instanceof THREE.Mesh || child instanceof THREE.Sprite || child instanceof THREE.Line) { if (child instanceof THREE.Mesh || child instanceof THREE.Line) child.geometry.dispose(); for (const mat of Array.isArray(child.material) ? child.material : [child.material]) { if ('map' in mat && mat.map instanceof THREE.Texture) mat.map.dispose(); mat.dispose(); } } });
  }
  dispose() { cancelAnimationFrame(this.frame); this.observer.disconnect(); for (const p of this.players.values()) disposeExplorerVisual(p.getObjectByName('body') as THREE.Group); this.disposeObject(this.scene); this.renderer.dispose(); this.renderer.domElement.remove(); }
}
