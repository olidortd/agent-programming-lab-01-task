// GPU particle bursts, shockwaves, electric arcs and impact light.
import * as THREE from 'three';
import { softDotTexture } from './engine.js';

const rand = (a, b) => a + Math.random() * (b - a);

export class FX3D {
  constructor(engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    engine.scene.add(this.group);
    this.live = [];
    // One reusable light: adding/removing lights at runtime forces shader recompiles.
    this.flash = new THREE.PointLight('#ffffff', 0, 9, 2);
    this.flash.position.set(0, 1, 0);
    engine.scene.add(this.flash);
    this.flashLevel = 0;
    this.ringGeo = new THREE.RingGeometry(0.8, 1, 64).rotateX(-Math.PI / 2);
    engine.updaters.add((dt) => this._update(dt));
  }

  _flash(point, color, intensity) {
    this.flash.position.copy(point).setY(1.2);
    this.flash.color.set(color);
    this.flashLevel = Math.max(this.flashLevel, intensity);
  }

  // Generic particle burst.
  spawn({ origin, count, colors, speed = [2, 6], up = 0.5, gravity = -6, drag = 2, size = 0.12, life = 1, spread = 0.1 }) {
    count = Math.max(4, Math.round(count * this.engine.q.particles));
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(rand(-1, 1), rand(0, 1) * up + rand(-0.15, 0.3), rand(-1, 1)).normalize();
      const s = rand(speed[0], speed[1]);
      pos.set([origin.x + rand(-spread, spread), origin.y + rand(0, spread), origin.z + rand(-spread, spread)], i * 3);
      vel.set([dir.x * s, dir.y * s, dir.z * s], i * 3);
      c.set(colors[i % colors.length]).multiplyScalar(rand(1.2, 2.4));
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size, map: softDotTexture(), vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.group.add(pts);
    this.live.push({
      obj: pts, age: 0, life,
      update: (dt, k) => {
        const damp = Math.exp(-drag * dt);
        for (let i = 0; i < count; i++) {
          const j = i * 3;
          vel[j] *= damp; vel[j + 1] = vel[j + 1] * damp + gravity * dt; vel[j + 2] *= damp;
          pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
          if (pos[j + 1] < 0.02 && gravity < 0) { pos[j + 1] = 0.02; vel[j + 1] *= -0.3; }
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 1 - k * k;
      },
    });
  }

  shockwave(origin, color, { scale = 3, life = 0.6, y = 0.03, rise = 0 } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(this.ringGeo, mat);
    ring.position.copy(origin).setY(y);
    this.group.add(ring);
    this.live.push({
      obj: ring, age: 0, life, keepGeo: true,
      update: (dt, k) => {
        ring.scale.setScalar(0.1 + scale * (1 - Math.pow(1 - k, 3)));
        ring.position.y = y + rise * k;
        mat.opacity = 1 - k;
      },
    });
  }

  arcs(origin, color, { count = 5, reach = 1.4, life = 0.4 } = {}) {
    const segs = 7;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * segs * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true, toneMapped: false, blending: THREE.AdditiveBlending });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    this.group.add(lines);
    let t = 1;
    const regen = () => {
      let w = 0;
      for (let a = 0; a < count; a++) {
        const ang = rand(0, Math.PI * 2);
        const end = new THREE.Vector3(Math.cos(ang) * reach, rand(0.1, 1.2), Math.sin(ang) * reach);
        let prev = origin.clone().setY(0.5);
        for (let s = 1; s <= segs; s++) {
          const p = origin.clone().setY(0.5).lerp(origin.clone().add(end), s / segs)
            .add(new THREE.Vector3(rand(-0.15, 0.15), rand(-0.15, 0.15), rand(-0.15, 0.15)));
          pos.set([prev.x, prev.y, prev.z, p.x, p.y, p.z], w); w += 6;
          prev = p;
        }
      }
      geo.attributes.position.needsUpdate = true;
    };
    this.live.push({
      obj: lines, age: 0, life,
      update: (dt, k) => {
        t += dt;
        if (t > 0.05) { regen(); t = 0; }
        mat.opacity = Math.random() > 0.2 ? 1 - k : 0.1;
      },
    });
  }

  // ---------- Themed composites ----------

  capture(point, theme, attackerColor, victimColor, power = 1) {
    const o = point.clone().setY(0.45);
    this._flash(o, theme.world.pieces[attackerColor].accent, 30 * power);
    this.spawn({ origin: o, count: 170 * power, colors: ['#00f0ff', '#ff2bd6', '#f9f871'], speed: [3, 9], up: 0.5, gravity: -4, drag: 2, size: 0.09, life: 0.9 });
    this.shockwave(point, '#ff2bd6', { scale: 3.4 * power, life: 0.5 });
    this.shockwave(point, '#00f0ff', { scale: 2.2 * power, life: 0.7 });
    this.arcs(point, '#00f0ff', { count: 4, reach: 1.2 * power, life: 0.3 });
  }

  dust(point, theme, power = 1) {
    const colors = ['#00f0ff', '#7a5cff'];
    this.spawn({ origin: point.clone().setY(0.05), count: 26 * power, colors, speed: [0.8, 2], up: 0.2, gravity: 0.2, drag: 3, size: 0.12, life: 0.8, spread: 0.25 });
    this.shockwave(point, colors[0], { scale: 0.9 * power, life: 0.4, y: 0.02 });
  }

  promote(point, theme, color) {
    const accent = theme.world.pieces[color].accent;
    this._flash(point.clone().setY(1), accent, 40);
    this.spawn({ origin: point.clone().setY(0.2), count: 120, colors: [accent, '#ffffff'], speed: [1, 3], up: 3, gravity: 1, drag: 1.5, size: 0.1, life: 1.4, spread: 0.25 });
    this.shockwave(point, accent, { scale: 1.6, life: 0.9, rise: 1.4 });
  }

  _update(dt) {
    this.flashLevel *= Math.exp(-dt * 7);
    this.flash.intensity = this.flashLevel < 0.05 ? 0 : this.flashLevel;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      e.age += dt;
      const k = Math.min(1, e.age / e.life);
      e.update(dt, k);
      if (k >= 1) {
        this.group.remove(e.obj);
        if (!e.keepGeo) e.obj.geometry.dispose();
        e.obj.material.dispose();
        this.live.splice(i, 1);
      }
    }
  }

  clear() {
    for (const e of this.live) {
      this.group.remove(e.obj);
      if (!e.keepGeo) e.obj.geometry.dispose();
      e.obj.material.dispose();
    }
    this.live = [];
  }
}
