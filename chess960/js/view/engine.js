// Render core: renderer, camera rig, post-processing, tween timeline, shake, adaptive quality.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const QUALITY_LEVELS = ['low', 'medium', 'high'];
export const QUALITY = {
  low:    { dpr: 1,   shadows: false, shadowSize: 512,  bloom: false, particles: 0.35 },
  medium: { dpr: 1.5, shadows: true,  shadowSize: 1024, bloom: true,  particles: 0.7 },
  high:   { dpr: 2,   shadows: true,  shadowSize: 2048, bloom: true,  particles: 1 },
};

export const ease = {
  linear: (t) => t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  outBack: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  outQuad: (t) => 1 - (1 - t) * (1 - t),
};

const TACTICAL = { phi: 0.9, baseRadius: 17 };

export class Engine {
  constructor(container) {
    this.container = container;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500);

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envMap;

    const controls = new OrbitControls(this.camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.8;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = 1.22;
    this.controls = controls;

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.5, 0.75);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.clock = new THREE.Clock();
    this.time = 0;
    this.timeScale = 1;
    this.tweens = [];
    this.updaters = new Set();
    this.shakeAmount = 0;
    this.shakeOffset = new THREE.Vector3();
    this.side = 'w';
    this.cameraBusy = 0;

    this.qualityMode = 'auto';
    this.quality = 'high';
    this.fps = { frames: 0, time: 0, settle: 2 };

    this._setupPointer();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.applyQuality();
    this.setCameraPose(this.tacticalPose(), 0);
    renderer.setAnimationLoop(() => this._frame());
  }

  // ---------- Quality ----------

  setQualityMode(mode) {
    this.qualityMode = mode;
    this.quality = mode === 'auto' ? 'high' : mode;
    this.fps = { frames: 0, time: 0, settle: 2 };
    this.applyQuality();
  }

  applyQuality() {
    const q = QUALITY[this.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    if (this.renderer.shadowMap.enabled !== q.shadows) {
      this.renderer.shadowMap.enabled = q.shadows;
      this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    }
    this.bloom.enabled = q.bloom;
    this.resize();
    this.onQualityChange?.(this.quality, q);
  }

  get q() { return QUALITY[this.quality]; }

  _monitorFps(dt) {
    if (this.qualityMode !== 'auto' || document.hidden) return;
    const f = this.fps;
    if (f.settle > 0) { f.settle -= dt; return; }
    f.frames++; f.time += dt;
    if (f.time < 3) return;
    const fps = f.frames / f.time;
    f.frames = 0; f.time = 0;
    const i = QUALITY_LEVELS.indexOf(this.quality);
    if (fps < 42 && i > 0) {
      this.quality = QUALITY_LEVELS[i - 1];
      f.settle = 2;
      this.applyQuality();
    }
  }

  // ---------- Layout ----------

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    const r = this.fitRadius();
    this.controls.minDistance = r * 0.55;
    this.controls.maxDistance = r * 1.6;
  }

  fitRadius() {
    return TACTICAL.baseRadius * Math.max(1, 1.3 / this.camera.aspect);
  }

  // ---------- Camera ----------

  tacticalPose(side = this.side) {
    // Aim slightly toward the near edge so the HUD's player panels don't cover the first rank.
    return {
      target: new THREE.Vector3(0, 0, side === 'w' ? 0.9 : -0.9),
      radius: this.fitRadius(),
      phi: TACTICAL.phi,
      theta: side === 'w' ? 0 : Math.PI,
    };
  }

  currentPose() {
    const off = this.camera.position.clone().sub(this.controls.target);
    const s = new THREE.Spherical().setFromVector3(off);
    return { target: this.controls.target.clone(), radius: s.radius, phi: s.phi, theta: s.theta };
  }

  setCameraPose(p) {
    this.controls.target.copy(p.target);
    const off = new THREE.Vector3().setFromSpherical(new THREE.Spherical(p.radius, p.phi, p.theta));
    this.camera.position.copy(p.target).add(off);
    this.camera.lookAt(p.target);
  }

  // Interpolates in spherical space so the camera orbits rather than cutting through the board.
  async moveCamera(to, duration = 1.2, easing = ease.inOutCubic) {
    const from = this.currentPose();
    let dTheta = to.theta - from.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    this.cameraBusy++;
    this.controls.enabled = false;
    try {
      await this.tween(duration, (e) => {
        this.setCameraPose({
          target: from.target.clone().lerp(to.target, e),
          radius: from.radius + (to.radius - from.radius) * e,
          phi: from.phi + (to.phi - from.phi) * e,
          theta: from.theta + dTheta * e,
        });
      }, { easing, scaled: false });
    } finally {
      this.cameraBusy--;
      if (!this.cameraBusy) this.controls.enabled = true;
    }
  }

  resetCamera(duration = 1.0) {
    return this.moveCamera(this.tacticalPose(), duration);
  }

  focusOn(point, duration = 0.7) {
    const cur = this.currentPose();
    return this.moveCamera({
      target: point.clone(),
      radius: this.fitRadius() * 0.62,
      phi: Math.min(cur.phi, 0.95),
      theta: cur.theta,
    }, duration, ease.outCubic);
  }

  shake(amount) {
    if (this.reducedMotion) return;
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  // ---------- Timeline ----------

  tween(duration, onUpdate, { easing = ease.inOutCubic, scaled = true } = {}) {
    return new Promise((resolve) => {
      if (duration <= 0) { onUpdate(1, 1); resolve(); return; }
      this.tweens.push({ duration, onUpdate, easing, scaled, elapsed: 0, resolve });
    });
  }

  wait(seconds, scaled = true) {
    return this.tween(seconds, () => {}, { scaled });
  }

  async slowMotion(scale = 0.25, hold = 0.45) {
    if (this.reducedMotion) return;
    await this.tween(0.12, (e) => { this.timeScale = 1 + (scale - 1) * e; }, { scaled: false });
    await this.wait(hold, false);
    await this.tween(0.35, (e) => { this.timeScale = scale + (1 - scale) * e; }, { scaled: false });
    this.timeScale = 1;
  }

  _frame() {
    const rawDt = Math.min(this.clock.getDelta(), 0.1);
    const dt = rawDt * this.timeScale;
    this.time += dt;
    this._monitorFps(rawDt);

    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const t = this.tweens[i];
      t.elapsed += t.scaled ? dt : rawDt;
      const p = Math.min(1, t.elapsed / t.duration);
      t.onUpdate(t.easing(p), p);
      if (p >= 1) { this.tweens.splice(i, 1); t.resolve(); }
    }
    for (const u of this.updaters) u(dt, this.time, rawDt);

    if (!this.cameraBusy) this.controls.update();

    this.shakeOffset.set(0, 0, 0);
    if (this.shakeAmount > 0.001) {
      const a = this.shakeAmount;
      this.shakeOffset.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      this.shakeAmount *= Math.exp(-rawDt * 7);
    }
    this.camera.position.add(this.shakeOffset);
    this.composer.render(rawDt);
    this.camera.position.sub(this.shakeOffset);
  }

  // ---------- Pointer ----------

  _setupPointer() {
    const el = this.renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down = null;

    this.raycast = (e, objects) => {
      const rect = el.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, this.camera);
      return raycaster.intersectObjects(objects, true);
    };

    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 600;
      down = null;
      if (moved < 7 && quick) this.onTap?.(e);
    });
    el.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && !down) this.onHover?.(e); });
  }
}

// Frees GPU resources for an object tree, skipping anything flagged as shared.
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (o.material) {
      for (const m of [].concat(o.material)) {
        if (m.userData.shared) continue;
        for (const k of ['map', 'alphaMap', 'emissiveMap']) if (m[k] && !m[k].userData?.shared) m[k].dispose();
        m.dispose();
      }
    }
  });
}

// Soft round sprite used by all particle systems.
let softDot = null;
export function softDotTexture() {
  if (softDot) return softDot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  softDot = new THREE.CanvasTexture(c);
  softDot.colorSpace = THREE.SRGBColorSpace;
  softDot.userData.shared = true;
  return softDot;
}
