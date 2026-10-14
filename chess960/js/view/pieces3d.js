// Interim 3D pieces (procedural Staunton set) + move/capture choreography.
// The character models planned for later phases plug in through `createPieceObject`.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { squareToWorld } from './board3d.js';
import { ease } from './engine.js';

const V = (x, y) => new THREE.Vector2(x, y);
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 10 };

function arc(cx, cy, r, a0, a1, n = 10) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push(V(Math.max(0, cx + r * Math.cos(a)), cy + r * Math.sin(a)));
  }
  return pts;
}

const BASE = [V(0, 0), V(0.36, 0), V(0.375, 0.02), V(0.372, 0.06), V(0.345, 0.08), V(0.335, 0.11), V(0.295, 0.13), V(0.27, 0.15)];

function lathe(points) {
  return new THREE.LatheGeometry(points, 40).toNonIndexed();
}

function box(w, h, d, x, y, z, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateY(ry);
  g.translate(x, y, z);
  return g.toNonIndexed();
}

function ball(r, x, y, z) {
  const g = new THREE.SphereGeometry(r, 16, 12);
  g.translate(x, y, z);
  return g.toNonIndexed();
}

function knightHead() {
  const s = new THREE.Shape();
  const P = [
    [-0.17, 0], [0.15, 0], [0.13, 0.12], [0.07, 0.22], [0.16, 0.27], [0.25, 0.29], [0.29, 0.34],
    [0.28, 0.4], [0.2, 0.44], [0.11, 0.51], [0.05, 0.58], [0.03, 0.66], [-0.03, 0.72], [-0.07, 0.64],
    [-0.13, 0.58], [-0.2, 0.46], [-0.24, 0.3], [-0.23, 0.15], [-0.2, 0.05],
  ];
  s.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length; i++) s.lineTo(P[i][0], P[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 4, curveSegments: 6,
  });
  g.translate(0, 0, -0.08);
  g.rotateY(Math.PI / 2); // muzzle faces -z (towards rank 8 for White)
  g.translate(0, 0.2, 0.02);
  return g; // ExtrudeGeometry is already non-indexed
}

function buildGeometry(type) {
  const parts = [];
  switch (type) {
    case 'p':
      parts.push(lathe([...BASE, V(0.24, 0.17), V(0.2, 0.2), V(0.15, 0.26), V(0.12, 0.33), V(0.11, 0.38),
        V(0.18, 0.4), V(0.19, 0.42), V(0.17, 0.44), V(0.09, 0.45), ...arc(0, 0.55, 0.13, -1.2, Math.PI / 2, 12)]));
      break;
    case 'r': {
      parts.push(lathe([...BASE, V(0.25, 0.17), V(0.22, 0.2), V(0.2, 0.28), V(0.19, 0.5), V(0.21, 0.55),
        V(0.26, 0.58), V(0.27, 0.6), V(0.27, 0.68), V(0.19, 0.68), V(0.19, 0.64), V(0, 0.64)]));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        parts.push(box(0.12, 0.1, 0.08, Math.sin(a) * 0.23, 0.73, Math.cos(a) * 0.23, a));
      }
      break;
    }
    case 'n':
      parts.push(lathe([...BASE, V(0.25, 0.17), V(0.25, 0.2), V(0.27, 0.22), V(0, 0.22)]));
      parts.push(knightHead());
      break;
    case 'b':
      parts.push(lathe([...BASE, V(0.24, 0.17), V(0.19, 0.2), V(0.14, 0.28), V(0.11, 0.4), V(0.1, 0.5),
        V(0.19, 0.53), V(0.2, 0.55), V(0.18, 0.57), V(0.11, 0.58), V(0.15, 0.62), V(0.17, 0.68), V(0.165, 0.74),
        V(0.14, 0.8), V(0.1, 0.85), V(0.05, 0.88), ...arc(0, 0.925, 0.05, -1.0, Math.PI / 2, 8)]));
      break;
    case 'q': {
      parts.push(lathe([...BASE, V(0.25, 0.17), V(0.2, 0.2), V(0.15, 0.3), V(0.12, 0.45), V(0.11, 0.6),
        V(0.2, 0.63), V(0.21, 0.65), V(0.18, 0.67), V(0.12, 0.68), V(0.15, 0.74), V(0.21, 0.84), V(0.23, 0.87),
        V(0.2, 0.88), V(0.14, 0.9), V(0.09, 0.94), V(0.05, 0.96), ...arc(0, 1.0, 0.055, -1.0, Math.PI / 2, 8)]));
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        parts.push(ball(0.035, Math.sin(a) * 0.215, 0.895, Math.cos(a) * 0.215));
      }
      break;
    }
    case 'k':
      parts.push(lathe([...BASE, V(0.26, 0.17), V(0.21, 0.2), V(0.16, 0.3), V(0.13, 0.45), V(0.12, 0.64),
        V(0.21, 0.67), V(0.22, 0.69), V(0.19, 0.71), V(0.13, 0.72), V(0.15, 0.78), V(0.2, 0.88), V(0.2, 0.91),
        V(0.14, 0.93), V(0.08, 0.96), V(0.06, 0.98), V(0, 0.98)]));
      parts.push(box(0.055, 0.22, 0.055, 0, 1.08, 0));
      parts.push(box(0.17, 0.055, 0.055, 0, 1.1, 0));
      break;
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  g.scale(1.12, 1.12, 1.12);
  g.userData.shared = true;
  return g;
}

const GEO = {};
function geometry(type) {
  return GEO[type] || (GEO[type] = buildGeometry(type));
}
let ringGeo = null;

// ---------- Piece manager ----------

export class Pieces3D {
  constructor(engine, fx) {
    this.engine = engine;
    this.fx = fx;
    this.group = new THREE.Group();
    engine.scene.add(this.group);
    this.bySq = new Map();
    this.selected = null;
    this.mats = null;
    engine.updaters.add((dt, t) => this._update(dt, t));
  }

  setTheme(theme) {
    this.theme = theme;
    const w = theme.world;
    const old = this.mats;
    this.mats = {};
    for (const c of ['w', 'b']) {
      const p = w.pieces[c];
      const body = new THREE.MeshPhysicalMaterial({
        color: p.color, roughness: p.rough, metalness: p.metal,
        clearcoat: 0.6, clearcoatRoughness: 0.25,
      });
      const accent = new THREE.MeshStandardMaterial({
        color: p.accent, emissive: p.accent, emissiveIntensity: 2.6, roughness: 0.3, metalness: 0.2,
      });
      body.userData.shared = accent.userData.shared = true;
      this.mats[c] = { body, accent };
    }
    for (const obj of this.bySq.values()) this._applyMaterials(obj);
    if (old) for (const c of ['w', 'b']) { old[c].body.dispose(); old[c].accent.dispose(); }
  }

  createPieceObject(piece) {
    const obj = new THREE.Group();
    const body = new THREE.Mesh(geometry(piece.type), this.mats[piece.color].body);
    body.castShadow = true;
    body.receiveShadow = true;
    obj.add(body);

    if (!ringGeo) {
      ringGeo = new THREE.TorusGeometry(0.39, 0.016, 8, 48).rotateX(Math.PI / 2);
      ringGeo.userData.shared = true;
    }
    const ring = new THREE.Mesh(ringGeo, this.mats[piece.color].accent);
    ring.position.y = 0.11;
    obj.add(ring);

    if (piece.color === 'b') obj.rotation.y = Math.PI;
    obj.userData = { piece, body, ring, phase: Math.random() * Math.PI * 2, lift: 0, baseY: 0, spin: 0 };
    return obj;
  }

  _applyMaterials(obj) {
    const { piece, body, ring } = obj.userData;
    if (body.userData.ownMaterial) return;
    body.material = this.mats[piece.color].body;
    ring.material = this.mats[piece.color].accent;
  }

  pickables() {
    return [...this.bySq.values()].map((o) => o.userData.body);
  }

  squareOf(obj) {
    for (const [k, o] of this.bySq) if (o === obj) return k.split(',').map(Number);
    return null;
  }

  at(sq) { return this.bySq.get(sq[0] + ',' + sq[1]); }

  _put(obj, sq) {
    obj.position.copy(squareToWorld(sq[0], sq[1]));
    this.bySq.set(sq[0] + ',' + sq[1], obj);
  }

  // Re-key moved pieces in one step (handles king/rook swapping squares when castling).
  _rekey(pairs) {
    for (const [obj] of pairs) for (const [k, o] of this.bySq) if (o === obj) this.bySq.delete(k);
    for (const [obj, sq] of pairs) this.bySq.set(sq[0] + ',' + sq[1], obj);
  }

  _remove(obj) {
    this.group.remove(obj);
    for (const [k, o] of this.bySq) if (o === obj) this.bySq.delete(k);
  }

  // Make the 3D pieces match `board` exactly. `intro` drops them in with a stagger.
  sync(board, { intro = false } = {}) {
    const next = new Map();
    const drops = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        const key = r + ',' + f;
        let obj = this.bySq.get(key);
        if (obj && (!p || obj.userData.piece.type !== p.type || obj.userData.piece.color !== p.color)) {
          this.group.remove(obj);
          obj = null;
        }
        if (p && !obj) {
          obj = this.createPieceObject(p);
          this.group.add(obj);
          if (intro) drops.push(obj);
        }
        if (obj) {
          obj.position.copy(squareToWorld(r, f));
          obj.userData.lift = 0;
          obj.userData.spin = 0;
          obj.scale.setScalar(1);
          next.set(key, obj);
        }
        this.bySq.delete(key);
      }
    }
    for (const leftover of this.bySq.values()) this.group.remove(leftover);
    this.bySq = next;
    this.selected = null;

    if (intro) {
      drops.forEach((obj, i) => {
        const r = Math.round(obj.position.z + 3.5);
        obj.userData.drop = 6;
        this.engine.wait(0.02 * i + (r < 4 ? 0.15 : 0)).then(() =>
          this.engine.tween(0.55, (e) => { obj.userData.drop = 6 * (1 - e); }, { easing: ease.outBack })
        );
      });
    }
  }

  select(sq) {
    if (this.selected) this.selected.userData.target = 0;
    this.selected = sq ? this.at(sq) : null;
    if (this.selected) this.selected.userData.target = 0.28;
  }

  _update(dt, t) {
    const hover = this.theme?.world.hover;
    for (const obj of this.group.children) {
      const u = obj.userData;
      if (!u.piece) continue;
      const target = u.target || 0;
      u.lift += (target - u.lift) * Math.min(1, dt * 10);
      const idle = hover ? 0.08 + Math.sin(t * 1.7 + u.phase) * 0.035 : 0;
      if (!u.animating) obj.position.y = u.baseY + u.lift + idle + (u.drop || 0);
      u.body.scale.y = 1 + Math.sin(t * 2.2 + u.phase) * 0.008;
      if (u === this.selected?.userData) u.spin += dt * 1.2;
      else u.spin *= Math.max(0, 1 - dt * 6);
      u.body.rotation.y = u.spin;
    }
    if (this.mats) {
      const pulse = 2.2 + Math.sin(t * 2.4) * 0.6;
      this.mats.w.accent.emissiveIntensity = pulse;
      this.mats.b.accent.emissiveIntensity = pulse;
    }
  }

  // ---------- Choreography ----------

  // Travel along a straight line with a lift curve; knights arc high.
  _travel(obj, fromSq, toSq, { duration, height, stopAt = 1, startAt = 0 }) {
    const a = squareToWorld(fromSq[0], fromSq[1]);
    const b = squareToWorld(toSq[0], toSq[1]);
    obj.userData.animating = true;
    return this.engine.tween(duration, (e) => {
      const k = startAt + (stopAt - startAt) * e;
      obj.position.lerpVectors(a, b, k);
      obj.position.y = Math.sin(Math.PI * k) * height + obj.userData.lift * (1 - k);
    }, { easing: ease.inOutCubic });
  }

  async animateMove(m, ctx) {
    const { cinematic, slowmo } = ctx;
    const engine = this.engine;
    const mover = this.at(m.from);
    if (!mover) return;
    mover.userData.target = 0;

    if (m.castle) {
      const rook = this.at(m.rookFrom);
      await Promise.all([
        this._travel(mover, m.from, m.kingTo, { duration: 0.7, height: 0.9 }),
        rook && rook !== mover ? this._travel(rook, m.rookFrom, m.rookTo, { duration: 0.7, height: 0.25 }) : null,
      ]);
      this._settle(mover);
      if (rook) this._settle(rook);
      this._rekey(rook && rook !== mover ? [[mover, m.kingTo], [rook, m.rookTo]] : [[mover, m.kingTo]]);
      this.fx.dust(squareToWorld(m.kingTo[0], m.kingTo[1]), this.theme, 0.6);
      return;
    }

    const type = mover.userData.piece.type;
    const dist = Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1]);
    const duration = type === 'n' ? 0.62 : 0.32 + dist * 0.07;
    const height = type === 'n' ? 1.3 : type === 'r' ? 0.05 : type === 'p' ? 0.12 : 0.22;
    const capSq = m.ep ? m.capSq : m.captured ? m.to : null;
    const victim = capSq ? this.at(capSq) : null;

    if (!victim) {
      await this._travel(mover, m.from, m.to, { duration, height });
      this._settle(mover);
      this._rekey([[mover, m.to]]);
      this._landingImpact(type, m.to);
    } else {
      const point = squareToWorld(capSq[0], capSq[1]);
      const big = VALUE[m.captured.type] >= 5;
      const focus = cinematic ? engine.focusOn(point.clone().setY(0.3), 0.6) : null;

      // Approach to striking distance, wind up, then lunge through the target.
      const stop = Math.max(0, 1 - 0.55 / Math.max(dist, 0.55));
      await this._travel(mover, m.from, m.to, { duration: duration * 0.85, height, stopAt: stop });
      if (focus) await focus;

      const windUp = mover.position.clone();
      await engine.tween(0.16, (e) => {
        mover.position.y = windUp.y + e * 0.25;
        mover.rotation.x = (mover.userData.piece.color === 'w' ? -1 : 1) * e * 0.35;
      }, { easing: ease.outQuad });

      if (slowmo && (big || cinematic)) engine.slowMotion(big ? 0.22 : 0.4, big ? 0.5 : 0.25);

      await this._travel(mover, m.from, m.to, { duration: 0.14, height: 0, startAt: stop });
      mover.rotation.x = 0;

      // Impact
      const power = 0.6 + VALUE[m.captured.type] / 9;
      this.fx.capture(point, this.theme, mover.userData.piece.color, m.captured.color, power);
      engine.shake(0.12 + power * 0.18);
      this._knockOut(victim, mover, capSq);
      this._settle(mover);
      this._rekey([[mover, m.to]]);

      if (cinematic) await engine.wait(0.45);
    }

    if (m.promo) await this._promote(mover, m.to, m.promo);
  }

  _settle(obj) {
    obj.userData.animating = false;
    obj.userData.lift = 0;
  }

  _landingImpact(type, sq) {
    if (type === 'r' || type === 'k' || type === 'q') {
      this.engine.shake(type === 'r' ? 0.1 : 0.05);
      this.fx.dust(squareToWorld(sq[0], sq[1]), this.theme, type === 'r' ? 1 : 0.6);
    } else if (type === 'n') {
      this.fx.dust(squareToWorld(sq[0], sq[1]), this.theme, 0.7);
    }
  }

  // Defeated piece is flung away, spins, and dissolves.
  _knockOut(victim, attacker, sq) {
    this.bySq.delete(sq[0] + ',' + sq[1]);
    const u = victim.userData;
    u.animating = true;
    u.target = 0;
    const mat = u.body.material.clone();
    mat.transparent = true;
    u.body.material = mat;
    u.body.userData.ownMaterial = true;
    u.ring.visible = false;

    const dir = victim.position.clone().sub(attacker.position).setY(0);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, attacker.userData.piece.color === 'w' ? -1 : 1);
    dir.normalize();
    const start = victim.position.clone();
    const spinAxis = new THREE.Vector3(dir.z, 0, -dir.x);

    this.engine.tween(1.1, (e, p) => {
      victim.position.copy(start).addScaledVector(dir, p * 2.2);
      victim.position.y = start.y + Math.sin(Math.min(p * 1.6, 1) * Math.PI * 0.5) * 1.6 - p * p * 0.8;
      victim.setRotationFromAxisAngle(spinAxis, p * 4);
      mat.opacity = 1 - ease.inCubic(p);
      victim.scale.setScalar(1 - p * 0.5);
    }, { easing: ease.linear }).then(() => {
      this.group.remove(victim);
      mat.dispose();
    });
  }

  async _promote(obj, sq, type) {
    const color = obj.userData.piece.color;
    const point = squareToWorld(sq[0], sq[1]);
    this.fx.promote(point, this.theme, color);
    await this.engine.tween(0.2, (e) => obj.scale.setScalar(1 - e * 0.9));
    this._remove(obj);
    const fresh = this.createPieceObject({ type, color });
    fresh.scale.setScalar(0.1);
    this.group.add(fresh);
    this._put(fresh, sq);
    await this.engine.tween(0.45, (e) => fresh.scale.setScalar(0.1 + 0.9 * e), { easing: ease.outBack });
  }
}
