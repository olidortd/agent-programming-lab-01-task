// The 3D board: beveled tiles, frame, coordinate labels, and glowing square markers.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { disposeTree } from './engine.js';

const FILES = 'abcdefgh';

export function squareToWorld(r, f, y = 0) {
  return new THREE.Vector3(f - 3.5, y, r - 3.5);
}

// ---------- Marker textures (generated once) ----------

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TEX = {};
function markerTextures() {
  if (TEX.dot) return TEX;
  TEX.dot = canvasTexture(128, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.22);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  });
  TEX.ring = canvasTexture(128, (g, s) => {
    g.strokeStyle = 'white';
    g.lineWidth = s * 0.07;
    g.shadowColor = 'white';
    g.shadowBlur = s * 0.08;
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.38, 0, Math.PI * 2);
    g.stroke();
  });
  TEX.square = canvasTexture(128, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, s * 0.15, s / 2, s / 2, s * 0.72);
    grd.addColorStop(0, 'rgba(255,255,255,0.15)');
    grd.addColorStop(1, 'rgba(255,255,255,0.85)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'white';
    g.lineWidth = s * 0.05;
    g.strokeRect(s * 0.04, s * 0.04, s * 0.92, s * 0.92);
  });
  TEX.castle = canvasTexture(128, (g, s) => {
    g.strokeStyle = 'white';
    g.lineWidth = s * 0.06;
    g.setLineDash([s * 0.09, s * 0.06]);
    g.strokeRect(s * 0.14, s * 0.14, s * 0.72, s * 0.72);
  });
  for (const t of Object.values(TEX)) t.userData.shared = true;
  return TEX;
}

function labelTexture(text, color) {
  return canvasTexture(64, (g, s) => {
    g.fillStyle = color;
    g.font = `bold ${s * 0.62}px ui-monospace, Consolas, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, s / 2, s / 2 + 2);
  });
}

// ---------- Board ----------

export class Board3D {
  constructor(engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    engine.scene.add(this.group);
    this.tiles = [];
    this.labels = [];
    this.markPool = [];
    this.marks = [];
    this.pulse = [];
    this.plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.plane.userData.shared = true;
    engine.updaters.add((dt, t, raw) => this._update(raw));
  }

  build(theme) {
    this.clear();
    const w = theme.world;
    const tex = markerTextures();
    this.hl = w.hl;

    // Tiles
    const tileGeo = new RoundedBoxGeometry(0.97, 0.3, 0.97, 2, 0.035);
    const mats = {
      light: new THREE.MeshStandardMaterial({ color: w.tiles.light.color, roughness: w.tiles.light.rough, metalness: w.tiles.light.metal }),
      dark: new THREE.MeshStandardMaterial({ color: w.tiles.dark.color, roughness: w.tiles.dark.rough, metalness: w.tiles.dark.metal }),
    };
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const light = (r + f) % 2 === 0;
        const tile = new THREE.Mesh(tileGeo, light ? mats.light : mats.dark);
        tile.position.copy(squareToWorld(r, f, -0.15));
        tile.receiveShadow = true;
        tile.userData.sq = [r, f];
        this.group.add(tile);
        this.tiles.push(tile);
      }
    }

    // Glowing seams between tiles (sci-fi themes)
    if (w.tiles.edge) {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const k = i - 4;
        pts.push(-4, 0.002, k, 4, 0.002, k, k, 0.002, -4, k, 0.002, 4);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
        color: new THREE.Color(w.tiles.edge).multiplyScalar(1.6), transparent: true, opacity: 0.55, toneMapped: false,
      }));
      this.group.add(lines);
    }

    // Frame + trim
    const frameMat = new THREE.MeshStandardMaterial({ color: w.frame.color, roughness: w.frame.rough, metalness: w.frame.metal });
    const frame = new THREE.Mesh(new RoundedBoxGeometry(9.3, 0.42, 9.3, 3, 0.12), frameMat);
    frame.position.y = -0.26;
    frame.receiveShadow = true;
    frame.castShadow = true;
    this.group.add(frame);

    const trimMat = new THREE.MeshStandardMaterial({
      color: w.frame.trim, metalness: 0.9, roughness: 0.3,
      emissive: w.frame.trim, emissiveIntensity: w.frame.trimGlow,
    });
    const bar = (sx, sz, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.05, sz), trimMat);
      m.position.set(x, -0.03, z);
      this.group.add(m);
    };
    bar(8.2, 0.06, 0, 4.07); bar(8.2, 0.06, 0, -4.07);
    bar(0.06, 8.2, 4.07, 0); bar(0.06, 8.2, -4.07, 0);

    // Coordinate labels engraved on the frame
    for (let i = 0; i < 8; i++) {
      this._label(FILES[i], i - 3.5, 4.38, w.frame.trim);
      this._label(String(8 - i), -4.38, i - 3.5, w.frame.trim);
    }
    this.setOrientation(this.engine.side);

    this.hoverMark = this._mark(tex.square, w.hl.select, 0.18);
    this.hoverMark.visible = false;
  }

  _label(text, x, z, color) {
    const m = new THREE.Mesh(this.plane, new THREE.MeshBasicMaterial({
      map: labelTexture(text, color), transparent: true, depthWrite: false, opacity: 0.9,
    }));
    m.scale.setScalar(0.34);
    m.position.set(x, -0.04, z);
    this.group.add(m);
    this.labels.push(m);
  }

  setOrientation(side) {
    for (const l of this.labels) l.rotation.y = side === 'w' ? 0 : Math.PI;
  }

  // ---------- Markers ----------

  _mark(texture, color, opacity) {
    const mat = new THREE.MeshBasicMaterial({
      map: texture, color: new THREE.Color(color).multiplyScalar(1.5), transparent: true, opacity,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const m = new THREE.Mesh(this.plane, mat);
    m.renderOrder = 2;
    this.group.add(m);
    return m;
  }

  _place(m, sq, y = 0.006, scale = 1) {
    m.position.copy(squareToWorld(sq[0], sq[1], y));
    m.scale.setScalar(scale);
    m.visible = true;
  }

  // marks = { selected, targets: [{ sq, capture, castle }], last: [sq, sq], check }
  setMarks({ selected = null, targets = [], last = null, check = null } = {}) {
    for (const m of this.marks) { this.group.remove(m); m.material.dispose(); }
    this.marks = [];
    this.pulse = [];
    const tex = markerTextures();
    const add = (texture, color, opacity, sq, scale, pulse) => {
      const m = this._mark(texture, color, opacity);
      this._place(m, sq, 0.006 + this.marks.length * 0.0004, scale);
      m.userData.baseOpacity = opacity;
      this.marks.push(m);
      if (pulse) this.pulse.push(m);
    };

    if (last) for (const sq of last) add(tex.square, this.hl.last, 0.22, sq, 1);
    if (check) add(tex.square, this.hl.check, 0.85, check, 1, true);
    if (selected) add(tex.square, this.hl.select, 0.6, selected, 1, true);
    for (const t of targets) {
      if (t.castle) add(tex.castle, this.hl.select, 0.9, t.sq, 1);
      else if (t.capture) add(tex.ring, this.hl.capture, 0.95, t.sq, 1.05, true);
      else add(tex.dot, this.hl.move, 0.85, t.sq, 0.9);
    }
  }

  setHover(sq) {
    if (!this.hoverMark) return;
    if (!sq) { this.hoverMark.visible = false; return; }
    this._place(this.hoverMark, sq, 0.004);
  }

  _update(raw) {
    const t = performance.now() / 1000;
    for (const m of this.pulse) m.material.opacity = m.userData.baseOpacity * (0.65 + 0.35 * Math.sin(t * 5));
  }

  clear() {
    for (const m of this.marks) m.material.dispose();
    this.marks = [];
    this.pulse = [];
    disposeTree(this.group);
    this.group.clear();
    this.tiles = [];
    this.labels = [];
    this.hoverMark = null;
  }
}
