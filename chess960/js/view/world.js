// Neon arena environment: lighting rig, reflective floor, grid, skyline, holograms, ambient motes.
import * as THREE from 'three';
import { disposeTree, softDotTexture } from './engine.js';

const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

function additive(color, opacity = 1, extra = {}) {
  return new THREE.MeshBasicMaterial(Object.assign({
    color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }, extra));
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildWorld(engine, theme) {
  const w = theme.world;
  const scene = engine.scene;
  const root = new THREE.Group();
  const tick = [];

  scene.background = new THREE.Color(w.bg);
  scene.fog = new THREE.Fog(w.fog.color, w.fog.near, w.fog.far);
  engine.renderer.toneMappingExposure = w.exposure;
  scene.environmentIntensity = w.envIntensity;
  engine.bloom.strength = w.bloom.strength;
  engine.bloom.radius = w.bloom.radius;
  engine.bloom.threshold = w.bloom.threshold;

  // ---------- Lights ----------
  root.add(new THREE.HemisphereLight(w.hemi.sky, w.hemi.ground, w.hemi.intensity));

  const key = new THREE.DirectionalLight(w.key.color, w.key.intensity);
  key.position.set(...w.key.pos);
  key.castShadow = true;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
  root.add(key, key.target);

  for (const rim of w.rims) {
    const l = new THREE.PointLight(rim.color, rim.intensity, 0, 2);
    l.position.set(...rim.pos);
    root.add(l);
  }

  const ambient = buildAmbient(w.particles, engine.q.particles);
  root.add(ambient.obj);
  tick.push(ambient.update);

  buildArena(root, tick);
  scene.add(root);

  const update = (dt, t) => { for (const fn of tick) fn(dt, t); };
  engine.updaters.add(update);

  const world = {
    key,
    applyQuality(q) {
      key.castShadow = q.shadows;
      key.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    },
    dispose() {
      engine.updaters.delete(update);
      scene.remove(root);
      disposeTree(root);
    },
  };
  world.applyQuality(engine.q);
  return world;
}

// Slowly rising glowing motes.
function buildAmbient(p, density) {
  const count = Math.round(p.count * density);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c1 = new THREE.Color(p.color), c2 = new THREE.Color(p.color2), c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    pos.set([rand(-22, 22), rand(-1, 12), rand(-22, 22)], i * 3);
    c.copy(c1).lerp(c2, Math.random()).multiplyScalar(rand(0.8, 1.6));
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const obj = new THREE.Points(geo, new THREE.PointsMaterial({
    size: p.size, map: softDotTexture(), vertexColors: true, transparent: true, opacity: 0.85,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  obj.frustumCulled = false;

  return {
    obj,
    update(dt, t) {
      for (let i = 0; i < count; i++) {
        const j = i * 3;
        pos[j + 1] += p.rise * dt;
        pos[j] += Math.sin(t * 0.5 + i) * 0.003;
        if (pos[j + 1] > 12) pos[j + 1] = -1;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

function buildArena(root, tick) {
  const floorY = -0.95;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#07060d', metalness: 0.9, roughness: 0.28 }));
  floor.position.y = floorY;
  floor.receiveShadow = true;
  root.add(floor);

  const grid = new THREE.GridHelper(140, 70, '#ff2bd6', '#ff2bd6');
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  grid.material.toneMapped = false;
  grid.position.y = floorY + 0.01;
  root.add(grid);

  // Pedestal with glowing edges
  const ped = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.5, 10.4), new THREE.MeshStandardMaterial({ color: '#0b0a14', metalness: 0.9, roughness: 0.25 }));
  ped.position.y = floorY + 0.25;
  ped.receiveShadow = true;
  ped.add(new THREE.LineSegments(new THREE.EdgesGeometry(ped.geometry),
    new THREE.LineBasicMaterial({ color: new THREE.Color('#00f0ff').multiplyScalar(2.5), toneMapped: false })));
  root.add(ped);

  // Skyline: dark towers with neon roof caps and corner strips
  const rng = mulberry(42);
  const N = 170;
  const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ color: '#0c0b18', metalness: 0.6, roughness: 0.5 }), N);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.04, 0.12, 1.04), new THREE.MeshBasicMaterial({ toneMapped: false }), N);
  const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1, 0.08).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  const palette = ['#00f0ff', '#ff2bd6', '#7a5cff', '#f9f871'];
  for (let i = 0; i < N; i++) {
    const a = rng() * TAU, r = 30 + rng() * 45;
    const wd = 2 + rng() * 4, d = 2 + rng() * 4, h = 5 + Math.pow(rng(), 1.6) * 38;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * TAU);
    m.compose(new THREE.Vector3(x, floorY, z), q, new THREE.Vector3(wd, h, d));
    buildings.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, floorY + h, z), q, new THREE.Vector3(wd, 1, d));
    caps.setMatrixAt(i, m);
    col.set(palette[i % palette.length]).multiplyScalar(2.2);
    caps.setColorAt(i, col);
    m.compose(new THREE.Vector3(x + wd / 2, floorY, z + d / 2), q, new THREE.Vector3(1, rng() > 0.45 ? h : 0.001, 1));
    strips.setMatrixAt(i, m);
    strips.setColorAt(i, col);
  }
  root.add(buildings, caps, strips);

  // Floating holographic structures
  const holos = [
    [new THREE.IcosahedronGeometry(1.4, 1), '#00f0ff', [-8.5, 4, -9]],
    [new THREE.TorusKnotGeometry(1, 0.3, 96, 8), '#ff2bd6', [9, 5, -8]],
    [new THREE.OctahedronGeometry(1.6, 0), '#7a5cff', [0, 8, -15]],
  ].map(([g, c, p]) => {
    const mesh = new THREE.Mesh(g, additive(c, 0.75, { wireframe: true }));
    mesh.position.set(...p);
    root.add(mesh);
    return { mesh, y: p[1] };
  });

  tick.push((dt, t) => {
    holos.forEach((h, i) => {
      h.mesh.rotation.x += dt * 0.3;
      h.mesh.rotation.y += dt * (0.4 + i * 0.1);
      h.mesh.position.y = h.y + Math.sin(t * 0.8 + i * 2) * 0.4;
      h.mesh.material.opacity = Math.random() > 0.03 ? 0.75 : 0.2; // glitch flicker
    });
    grid.position.z = (t * 1.2) % 2;
  });
}
