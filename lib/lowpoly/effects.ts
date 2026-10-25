import * as THREE from "three";
import { type Rng, range } from "@/lib/lowpoly/core";

/** Per-frame state handed to every animated node. Pure function of time. */
export interface AnimState {
  time: number;
  progress: number;
  moving: boolean;
  night: boolean;
  phase: number;
}

export interface Effect {
  object: THREE.Object3D;
  update(s: AnimState): void;
  dispose(): void;
}

/** Waving cloth. Origin = top-left corner (pole attachment). */
export function makeFlag(color: THREE.ColorRepresentation, w: number, h: number): Effect {
  const geo = new THREE.PlaneGeometry(w, h, 7, 3).toNonIndexed();
  geo.translate(w / 2, -h / 2, 0);
  const base = (geo.getAttribute("position").array as Float32Array).slice();
  const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, flatShading: true, roughness: 0.95 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const amp = Math.min(0.3, w * 0.12);
  return {
    object: mesh,
    update(s) {
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = base[i],
          y = base[i + 1];
        const k = x / w;
        arr[i + 2] = Math.sin((x / w) * 6.5 - s.time * 6 + s.phase + y * 0.8) * amp * k;
        arr[i + 1] = y - k * k * h * 0.06;
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

export function makeFire(width: number, height: number, rng: Rng): Effect {
  const group = new THREE.Group();
  const mats = ["#ff5a1f", "#ff9a1f", "#ffd84a"].map(
    (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false }),
  );
  const tongues: { m: THREE.Mesh; base: number; ph: number; sp: number }[] = [];
  const n = 7;
  const geo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.14, 0),
      new THREE.Vector2(0.22, 0.18),
      new THREE.Vector2(0.13, 0.5),
      new THREE.Vector2(0.045, 0.82),
      new THREE.Vector2(0, 1),
    ],
    5,
  );
  const vertices = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < vertices.count; i++) vertices.setX(i, vertices.getX(i) + vertices.getY(i) ** 2 * 0.12);
  geo.computeVertexNormals();
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mats[i % 3]);
    const a = (i / n) * Math.PI * 2;
    const rr = i === 0 ? 0 : width * 0.24;
    m.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    tongues.push({ m, base: i === 0 ? 1.15 : range(rng, 0.55, 0.95), ph: rng() * 10, sp: range(rng, 7, 12) });
    group.add(m);
  }
  return {
    object: group,
    update(s) {
      for (const t of tongues) {
        const f = 0.75 + 0.25 * Math.sin(s.time * t.sp + t.ph) + 0.1 * Math.sin(s.time * 23 + t.ph * 2);
        t.m.scale.set(width * (0.9 + 0.1 * f), height * t.base * f, width);
        t.m.rotation.y = s.time * 1.3 + t.ph;
        t.m.rotation.z = 0.08 * Math.sin(s.time * 3 + t.ph);
      }
    },
    dispose() {
      geo.dispose();
      mats.forEach((m) => m.dispose());
    },
  };
}

/** Rising, expanding puffs — positions are a pure function of time. */
export function makeSmoke(
  rng: Rng,
  o: { size?: number; rise?: number; color?: THREE.ColorRepresentation; count?: number; life?: number } = {},
): Effect {
  const size = o.size ?? 1;
  const rise = o.rise ?? 5;
  const count = o.count ?? 9;
  const life = o.life ?? 4;
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: o.color ?? "#9a958e",
    flatShading: true,
    roughness: 1,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  const geo = new THREE.IcosahedronGeometry(0.5 * size, 1);
  const puffs = Array.from({ length: count }, (_, i) => {
    const m = new THREE.Mesh(geo, mat.clone());
    group.add(m);
    return {
      m,
      off: (i / count) * life,
      jx: range(rng, -0.5, 0.5),
      jz: range(rng, -0.5, 0.5),
      rot: rng() * 6,
      lifetime: life * range(rng, 0.85, 1.15),
      spread: range(rng, 0.75, 1.25),
    };
  });
  return {
    object: group,
    update(s) {
      for (const p of puffs) {
        const age = ((((s.time + p.off + s.phase) % p.lifetime) + p.lifetime) % p.lifetime) / p.lifetime;
        const sz = (0.3 + age * 2.4) * p.spread;
        p.m.material.opacity = 0.62 * Math.sin(Math.PI * age) ** 0.7;
        p.m.position.set(
          p.jx * size + age * size * (1.2 + p.spread) + Math.sin(age * 5 + p.rot) * age * size * 0.35,
          age * rise,
          p.jz * size + Math.cos(age * 4 + p.rot) * age * size * 0.6,
        );
        p.m.scale.setScalar(Math.max(0.001, sz));
        p.m.rotation.set(p.rot + age * 2, p.rot, 0);
      }
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      puffs.forEach((p) => p.m.material.dispose());
    },
  };
}

export function makeExplosion(rng: Rng, diameter: number, period: number, offset: number): Effect {
  const scale = diameter / 2.2;
  const group = new THREE.Group();
  const coreGeo = new THREE.IcosahedronGeometry(1 * scale, 0);
  const coreMat = new THREE.MeshBasicMaterial({ color: "#ffb02e", toneMapped: false });
  const shellGeo = new THREE.IcosahedronGeometry(1.3 * scale, 0);
  const shellMat = new THREE.MeshBasicMaterial({
    color: "#ff5a1f",
    transparent: true,
    opacity: 0.7,
    toneMapped: false,
    depthWrite: false,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  const shell = new THREE.Mesh(shellGeo, shellMat);
  const smokeMat = new THREE.MeshStandardMaterial({
    color: "#5d5853",
    flatShading: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const smokeGeo = new THREE.IcosahedronGeometry(0.8 * scale, 0);
  const debrisMat = new THREE.MeshStandardMaterial({ color: "#3a3330", flatShading: true });
  const debrisGeo = new THREE.TetrahedronGeometry(0.22 * scale, 0);
  group.add(core, shell);
  const smokes = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(smokeGeo, smokeMat);
    group.add(m);
    return { m, dir: new THREE.Vector3(range(rng, -1, 1), range(rng, 0.6, 1.4), range(rng, -1, 1)).normalize() };
  });
  const debris = Array.from({ length: 10 }, () => {
    const m = new THREE.Mesh(debrisGeo, debrisMat);
    m.castShadow = true;
    group.add(m);
    return { m, v: new THREE.Vector3(range(rng, -4, 4), range(rng, 5, 9), range(rng, -4, 4)), spin: range(rng, 3, 9) };
  });
  return {
    object: group,
    update(s) {
      const age = (((s.time + offset) % period) + period) % period;
      const k = age / 1.6;
      group.visible = k < 1;
      if (k >= 1) return;
      const burst = Math.sin(Math.min(1, k * 2.2) * Math.PI);
      core.scale.setScalar(Math.max(0.001, burst * 1.1));
      shell.scale.setScalar(Math.max(0.001, 0.4 + k * 1.6));
      shellMat.opacity = 0.7 * (1 - k);
      core.position.y = shell.position.y = 0.8 * scale + k * 1.5 * scale;
      for (const sm of smokes) {
        sm.m.position
          .copy(sm.dir)
          .multiplyScalar(k * 2.6 * scale)
          .setY(0.8 * scale + sm.dir.y * k * 3.5 * scale);
        sm.m.scale.setScalar(Math.max(0.001, 0.4 + k * 1.4) * (k > 0.8 ? (1 - k) * 5 : 1));
      }
      for (const d of debris) {
        d.m.position.set(
          d.v.x * age * 0.6 * scale,
          Math.max(0, d.v.y * age * scale - 8.8 * age * age * scale),
          d.v.z * age * 0.6 * scale,
        );
        d.m.rotation.set(age * d.spin, age * d.spin * 0.7, 0);
      }
    },
    dispose() {
      coreGeo.dispose();
      coreMat.dispose();
      shellGeo.dispose();
      shellMat.dispose();
      smokeGeo.dispose();
      smokeMat.dispose();
      debrisGeo.dispose();
      debrisMat.dispose();
    },
  };
}
