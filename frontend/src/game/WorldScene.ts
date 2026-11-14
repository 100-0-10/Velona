import * as THREE from 'three';
import type { WorldSnapshot } from '../types';
import { boar, camp, explorer, label, material, palette, resource, rock, tree } from './models';

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
  private danger = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshBasicMaterial({ color: 0xc85437, transparent: true, opacity: .38, depthWrite: false }));
  private cameraTarget = new THREE.Vector3(2, 0, 2);
  private flame: THREE.Object3D | undefined;
  private attackAt = -10;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label', '새벽 야영지 3D 게임 화면'); this.renderer.domElement.dataset.testid = 'world-canvas'; container.append(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xb9cbb0); this.scene.fog = new THREE.Fog(0xb9cbb0, 38, 75);
    this.scene.add(new THREE.HemisphereLight(0xfff2d5, 0x516348, 2.3));
    const sun = new THREE.DirectionalLight(0xffe1b0, 3); sun.position.set(-12, 25, 10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -28; sun.shadow.camera.right = 28; sun.shadow.camera.top = 28; sun.shadow.camera.bottom = -28; sun.shadow.bias = -.0008; this.scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(58, 58), material(palette.grass)); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);
    const clearing = new THREE.Mesh(new THREE.CircleGeometry(6.8, 64), material(palette.earth)); clearing.rotation.x = -Math.PI / 2; clearing.position.y = .015; clearing.receiveShadow = true; this.scene.add(clearing);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(3, 24), material(0xb0a67d)); path.rotation.x = -Math.PI / 2; path.rotation.z = -.7; path.position.set(7, .012, 5); path.receiveShadow = true; this.scene.add(path);
    const base = camp(); this.flame = base.getObjectByName('flame'); this.scene.add(base);
    this.addScenery();
    this.danger.rotation.x = -Math.PI / 2; this.danger.position.y = .05; this.danger.visible = false; this.scene.add(this.danger);
    const outskirts = label('동쪽 숲 · 채집과 사냥'); outskirts.position.set(13, 3.5, 4); outskirts.scale.multiplyScalar(1.1); this.scene.add(outskirts);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container); this.resize(); this.animate();
  }

  private addScenery() {
    // Fixed seed-like arithmetic keeps scenery identical across clients.
    for (let n = 0; n < 28; n++) {
      const a = n * 2.39996; const radius = 19 + n % 4 * 2.7;
      const t = tree(3.4 + n % 4 * .5); t.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius); t.rotation.y = a; this.scene.add(t);
    }
    for (let n = 0; n < 15; n++) { const r = rock(.35 + n % 3 * .18); r.position.set(Math.sin(n * 4.3) * 22, .15, Math.cos(n * 2.7) * 22); if (r.position.length() > 8) this.scene.add(r); }
    const grassGeometry = new THREE.ConeGeometry(.08, .35, 3); const grass = new THREE.InstancedMesh(grassGeometry, material(0x99ac6d), 380); const dummy = new THREE.Object3D();
    for (let n = 0; n < 380; n++) { const x = Math.sin(n * 2.39) * (8 + n % 19); const z = Math.cos(n * 3.71) * (8 + n % 17); dummy.position.set(x, Math.hypot(x, z) < 7 ? -.6 : .15, z); dummy.rotation.y = n; dummy.updateMatrix(); grass.setMatrixAt(n, dummy.matrix); } this.scene.add(grass);
    const border = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-24,.03,-24),new THREE.Vector3(24,.03,-24),new THREE.Vector3(24,.03,24),new THREE.Vector3(-24,.03,24)]), new THREE.LineBasicMaterial({ color: 0x667c52, transparent: true, opacity: .6 })); this.scene.add(border);
  }

  setSnapshot(snapshot: WorldSnapshot) {
    this.snapshot = snapshot;
    const activePlayers = new Set(snapshot.players.map(p => p.id));
    for (const [id, group] of this.players) if (!activePlayers.has(id)) { this.disposeObject(group); this.players.delete(id); }
    for (const p of snapshot.players) if (!this.players.has(p.id)) { const g = explorer(p.color, p.name, p.id === snapshot.selfPlayerId); g.position.set(p.x, 0, p.z); this.players.set(p.id, g); this.scene.add(g); }
    for (const n of snapshot.nodes) {
      if (!this.nodes.has(n.id)) { const g = resource(n.itemId); g.position.set(n.x, 0, n.z); const tag = label(n.name); tag.name = 'nodeLabel'; tag.position.y = n.itemId === 'log' || n.itemId === 'bark' ? 4.3 : 1.8; g.add(tag); this.nodes.set(n.id, g); this.scene.add(g); }
      const group = this.nodes.get(n.id)!; group.scale.setScalar(n.available ? 1 : .2);
    }
    for (const m of snapshot.monsters) if (!this.monsters.has(m.id)) { const g = boar(); g.position.set(m.x, 0, m.z); this.monsters.set(m.id, g); this.scene.add(g); }
  }

  playAttack() { this.attackAt = this.elapsed; }

  private resize() {
    const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight); const aspect = width / height;
    const vertical = width < 700 ? 11 : 13; this.camera.left = -vertical * aspect; this.camera.right = vertical * aspect; this.camera.top = vertical; this.camera.bottom = -vertical; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false);
  }

  private animate = () => {
    this.frame = requestAnimationFrame(this.animate); const now = performance.now(); const dt = Math.min(.1, (now - this.lastTime) / 1000); this.lastTime = now; this.elapsed += dt;
    const s = this.snapshot; const alpha = 1 - Math.exp(-dt * 14);
    if (s) {
      for (const p of s.players) {
        const g = this.players.get(p.id)!; const dx = p.x - g.position.x, dz = p.z - g.position.z; const moving = Math.hypot(dx, dz) > .02;
        g.position.x += dx * alpha; g.position.z += dz * alpha;
        const body = g.getObjectByName('body')!; if (moving) body.rotation.y = Math.atan2(dx, dz); body.rotation.z = p.isDowned ? Math.PI / 2 : 0; body.rotation.x = p.gatheringItemId && !moving ? .12 + Math.sin(this.elapsed * 7) * .06 : 0;
        const left = g.getObjectByName('leftLeg')!, right = g.getObjectByName('rightLeg')!; left.rotation.x = moving ? Math.sin(this.elapsed * 12) * .45 : 0; right.rotation.x = -left.rotation.x;
        if (p.id === s.selfPlayerId) { const weapon = g.getObjectByName('weapon')!; const age = this.elapsed - this.attackAt; weapon.rotation.x = age < .35 ? -Math.sin(age / .35 * Math.PI) * 1.1 : 0; }
      }
      const self = s.players.find(p => p.id === s.selfPlayerId);
      if (self) this.cameraTarget.lerp(new THREE.Vector3(self.x + 1, 0, self.z + 1), 1 - Math.exp(-dt * 3));
      for (const n of s.nodes) { const g = this.nodes.get(n.id)!; const tag = g.getObjectByName('nodeLabel'); if (tag) tag.visible = n.available && !!self && Math.hypot(self.x - n.x, self.z - n.z) < 6; }
      this.danger.visible = false;
      for (const m of s.monsters) {
        const g = this.monsters.get(m.id)!; const dx = m.x - g.position.x, dz = m.z - g.position.z; g.position.x += dx * alpha; g.position.z += dz * alpha;
        if (Math.hypot(dx, dz) > .02) g.rotation.y = Math.atan2(dx, dz); g.rotation.z = m.state === 'dead' ? Math.PI / 2 : 0; g.position.y = m.state === 'dead' ? .15 : 0;
        if (m.state === 'telegraph') { this.danger.visible = true; this.danger.position.set(m.telegraphX ?? m.x, .05, m.telegraphZ ?? m.z); (this.danger.material as THREE.MeshBasicMaterial).opacity = .28 + Math.sin(this.elapsed * 13) * .1; }
      }
    }
    if (this.flame) { this.flame.scale.y = 1 + Math.sin(this.elapsed * 8) * .1; this.flame.rotation.y += dt; }
    this.camera.position.copy(this.cameraTarget).add(new THREE.Vector3(20, 25, 20)); this.camera.lookAt(this.cameraTarget); this.renderer.render(this.scene, this.camera);
  };

  getDiagnostics() { return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, width: this.renderer.domElement.width, height: this.renderer.domElement.height, dpr: this.renderer.getPixelRatio(), players: this.players.size }; }

  private disposeObject(object: THREE.Object3D) {
    object.removeFromParent(); object.traverse(child => { if (child instanceof THREE.Mesh || child instanceof THREE.Sprite || child instanceof THREE.Line) { if (child instanceof THREE.Mesh || child instanceof THREE.Line) child.geometry.dispose(); for (const mat of Array.isArray(child.material) ? child.material : [child.material]) { if ('map' in mat && mat.map instanceof THREE.Texture) mat.map.dispose(); mat.dispose(); } } });
  }
  dispose() { cancelAnimationFrame(this.frame); this.observer.disconnect(); this.disposeObject(this.scene); this.renderer.dispose(); this.renderer.domElement.remove(); }
}
