"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { makeRng } from "@/lib/lowpoly/core";
import { buildGlobe } from "@/lib/lowpoly/globe";
import {
  CRATERS,
  FLAG_POLE,
  LANDER,
  MOON_RADIUS,
  ROCKS,
  START,
  createMoonWalker,
  groundHeight,
  type MoonWalker,
  type WalkPose,
} from "@/components/three/moonWalk";
import { useInView } from "@/components/three/useInView";

/** Radians per second: one full turn every 50 seconds. */
const SPIN = (Math.PI * 2) / 50;
/** Looks down at about 45° so the landing reads from above and the Moon's limb stays round. */
const HOME = new THREE.Vector3(6, 0.8, 8);
const TARGET = new THREE.Vector3(0, -9.2, 0);
/** Ortho frame in world units: the whole sphere, the lander, and room for the caption. */
const FRAME_W = 26.7;
const FRAME_H = 22;
const HOME_TILT = new THREE.Spherical().setFromVector3(HOME.clone().sub(TARGET)).phi;
const offset = new THREE.Vector3();
const view = new THREE.Spherical();
const surfUp = new THREE.Vector3();
const surfForward = new THREE.Vector3();
const surfRight = new THREE.Vector3();
const surfBasis = new THREE.Matrix4();
const surfPos = new THREE.Vector3();
const surfQuat = new THREE.Quaternion();
const axisX = new THREE.Vector3(1, 0, 0);
const axisY = new THREE.Vector3(0, 1, 0);
/** CircleGeometry faces +Z; this turns that normal up to local +Y so a planted print lies on the ground. */
const circleTilt = new THREE.Quaternion().setFromAxisAngle(axisX, -Math.PI / 2);

/** Point on the upper cap, with local +Y along the surface normal and local +Z along `heading`. */
function frameAt(x: number, z: number, heading: number, lift: number) {
  let px = x,
    pz = z;
  const reach = Math.hypot(x, z);
  if (reach > MOON_RADIUS * 0.98) {
    const s = (MOON_RADIUS * 0.98) / reach;
    px *= s;
    pz *= s;
  }
  const ny = groundHeight(px, pz) + MOON_RADIUS;
  surfUp.set(px / MOON_RADIUS, ny / MOON_RADIUS, pz / MOON_RADIUS);
  surfForward.set(Math.sin(heading), 0, Math.cos(heading));
  surfForward.addScaledVector(surfUp, -surfForward.dot(surfUp));
  if (surfForward.lengthSq() < 1e-6) surfForward.set(1, 0, 0).addScaledVector(surfUp, -surfUp.x);
  surfForward.normalize();
  surfRight.crossVectors(surfUp, surfForward).normalize();
  surfBasis.makeBasis(surfRight, surfUp, surfForward);
  surfQuat.setFromRotationMatrix(surfBasis);
  surfPos.copy(surfUp).multiplyScalar(MOON_RADIUS + lift);
  surfPos.y -= MOON_RADIUS;
}

function plant(obj: THREE.Object3D, x: number, z: number, heading = 0, lift = 0) {
  frameAt(x, z, heading, lift);
  obj.quaternion.copy(surfQuat);
  obj.position.copy(surfPos);
}

/** `dir` points from the Moon's centre. +Y is the landing site's apex. */
function plantDir(obj: THREE.Object3D, dir: THREE.Vector3, lift = 0) {
  surfUp.copy(dir).normalize();
  surfForward.crossVectors(Math.abs(surfUp.y) > 0.85 ? axisX : axisY, surfUp).normalize();
  surfRight.crossVectors(surfUp, surfForward).normalize();
  surfBasis.makeBasis(surfRight, surfUp, surfForward);
  obj.quaternion.setFromRotationMatrix(surfBasis);
  obj.position.copy(surfUp).multiplyScalar(MOON_RADIUS + lift);
  obj.position.y -= MOON_RADIUS;
}
/** Lunar surface gravity in m/s² (a world unit is about a metre), so kicked-up dust arcs like the real thing. */
const MOON_G = 1.62;
/** Height of the astronaut rig that rests his boots on the surface. */
const BOOT_BASE = 0.035;
const PRINTS = 64;
const DUST = 64;
const dummy = new THREE.Object3D();
const foot = new THREE.Vector3();

/** A deliberately composed Apollo 11 illustration, separate from generated film assets. */
function MoonLanding({ animate }: { animate: boolean }) {
  const scene = useMemo(() => {
    const root = new THREE.Group();
    const resources: { dispose(): void }[] = [];
    const material = (color: string, metalness = 0, roughness = 0.8) => {
      const m = new THREE.MeshStandardMaterial({ color, metalness, roughness, flatShading: true });
      resources.push(m);
      return m;
    };
    const moon = material("#9b9ea5", 0, 0.94);
    const mare = material("#7a7f89");
    const edge = material("#555c68");
    const rim = material("#b6b7bb");
    const dark = material("#252e3e");
    const gold = material("#d6a545", 0.5, 0.4);
    const goldDark = material("#966426", 0.3);
    const white = material("#eeece3");
    const silver = material("#aab5c0", 0.6, 0.4);
    const visor = material("#b77b25", 0.75, 0.2);
    const red = material("#bd443c");
    const blue = material("#334e82");
    const mesh = (
      geometry: THREE.BufferGeometry,
      mat: THREE.Material,
      pos: [number, number, number],
      parent: THREE.Object3D = root,
    ) => {
      resources.push(geometry);
      const obj = new THREE.Mesh(geometry, mat);
      obj.position.set(...pos);
      obj.castShadow = true;
      obj.receiveShadow = true;
      parent.add(obj);
      return obj;
    };
    const box = (size: [number, number, number], mat: THREE.Material, pos: [number, number, number], parent = root) =>
      mesh(new THREE.BoxGeometry(...size), mat, pos, parent);
    const beam = (
      a: [number, number, number],
      b: [number, number, number],
      radius: number,
      mat: THREE.Material,
      parent = root,
    ) => {
      const start = new THREE.Vector3(...a),
        end = new THREE.Vector3(...b);
      const delta = end.clone().sub(start);
      const obj = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 6), mat, [0, 0, 0], parent);
      obj.position.copy(start.add(end).multiplyScalar(0.5));
      obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    };
    // A sphere, not a disc: the landing site is the upper cap, and the limb stays round from every angle.
    const body = mesh(new THREE.SphereGeometry(MOON_RADIUS, 64, 48), moon, [0, -MOON_RADIUS, 0]);
    body.castShadow = false;
    const addCrater = (parent: THREE.Object3D, radius: number) => {
      const ring = mesh(new THREE.TorusGeometry(radius, radius * 0.13, 5, 24), rim, [0, 0.03, 0], parent);
      ring.rotation.x = Math.PI / 2;
      ring.scale.z = 0.35;
      const hollow = mesh(new THREE.CircleGeometry(radius * 0.85, 24), edge, [0, 0.02, 0], parent);
      hollow.rotation.x = -Math.PI / 2;
    };
    for (const k of ROCKS) {
      const holder = new THREE.Group();
      plant(holder, k.x, k.z);
      root.add(holder);
      const rock = mesh(new THREE.IcosahedronGeometry(k.size, 0), k.light ? rim : edge, [0, k.size * 0.4, 0], holder);
      rock.scale.set(1.3, 0.65, 1);
      rock.rotation.set(...k.spin);
    }
    for (const [x, z, r] of CRATERS) {
      const holder = new THREE.Group();
      plant(holder, x, z);
      root.add(holder);
      addCrater(holder, r);
    }
    // More craters and maria on the rest of the sphere, clear of the landing site.
    const scatter = makeRng(201);
    const dir = new THREE.Vector3();
    for (let i = 0; i < 26; i++) {
      const theta = scatter() * Math.PI * 2;
      const y = scatter() * 1.7 - 0.9;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      dir.set(Math.cos(theta) * ring, y, Math.sin(theta) * ring);
      if (y > 0 && Math.hypot(dir.x, dir.z) * MOON_RADIUS < 5.7) continue;
      const holder = new THREE.Group();
      plantDir(holder, dir, 0.01);
      root.add(holder);
      addCrater(holder, 0.22 + scatter() * 0.55);
    }
    const seas = makeRng(7);
    for (let i = 0; i < 8; i++) {
      const theta = seas() * Math.PI * 2;
      const y = seas() * 1.5 - 0.85;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      dir.set(Math.cos(theta) * ring, y, Math.sin(theta) * ring);
      if (y > 0.45) continue;
      const holder = new THREE.Group();
      plantDir(holder, dir, 0.015);
      root.add(holder);
      const patch = mesh(new THREE.CircleGeometry(0.65 + seas() * 1.05, 22), mare, [0, 0, 0], holder);
      patch.rotation.x = -Math.PI / 2;
    }
    const lander = new THREE.Group();
    plant(lander, LANDER.x, LANDER.z);
    root.add(lander);
    // Pads reach the sphere where it falls away from the tangent under the foot circle.
    const footDrop = (2 * 2) / (2 * MOON_RADIUS);
    const padY = 0.05 - footDrop;
    mesh(new THREE.CylinderGeometry(1.15, 1.25, 1.02, 8), gold, [0, 1.42, 0], lander).rotation.y = Math.PI / 8;
    // Contrasting foil panels around the octagonal descent stage.
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const panel = box(
        [0.66, 0.73, 0.035],
        i % 2 ? goldDark : gold,
        [Math.sin(a) * 1.15, 1.43, Math.cos(a) * 1.15],
        lander,
      );
      panel.rotation.y = a;
    }
    mesh(new THREE.CylinderGeometry(0.23, 0.45, 0.5, 12), dark, [0, 0.7, 0], lander);
    const cabin = mesh(new THREE.CylinderGeometry(0.86, 1.05, 1.4, 8), silver, [0, 2.63, 0], lander);
    cabin.rotation.y = Math.PI / 8;
    box([1.3, 0.72, 0.6], white, [0, 2.68, 0.7], lander);
    for (const x of [-0.37, 0.37]) {
      const window = mesh(new THREE.CircleGeometry(0.3, 3), dark, [x, 2.85, 1.01], lander);
      window.rotation.z = Math.PI / 2;
    }
    box([0.5, 0.55, 0.06], dark, [0, 2.2, 1.04], lander);
    box([0.38, 0.43, 0.08], white, [0, 2.2, 1.08], lander);
    box([0.65, 0.65, 0.9], dark, [-1, 2.5, -0.15], lander);
    mesh(new THREE.SphereGeometry(0.4, 8, 6), silver, [1.0, 2.45, 0.1], lander);
    beam([0.2, 3.25, -0.25], [0.2, 4.1, -0.25], 0.025, silver, lander);
    const dish = mesh(
      new THREE.SphereGeometry(0.28, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      white,
      [0.2, 4.02, -0.25],
      lander,
    );
    dish.rotation.x = 0.8;
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const x = Math.sin(a),
        z = Math.cos(a);
      beam([x * 0.9, 1.7, z * 0.9], [x * 2.0, padY + 0.06, z * 2.0], 0.065, gold, lander);
      beam([x * 0.6, 1, z * 0.6], [x * 1.8, 0.2, z * 1.8], 0.04, silver, lander);
      mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.1, 12), gold, [x * 2, padY, z * 2], lander);
    }
    // Front ladder and individually visible rungs. The rails end on the front footpad.
    const railTopY = 2,
      railBotY = padY + 0.08,
      railTopZ = 1.16,
      railBotZ = 2;
    for (const x of [-0.23, 0.23]) beam([x, railTopY, railTopZ], [x, railBotY, railBotZ], 0.027, silver, lander);
    for (let i = 0; i < 8; i++) {
      const p = 0.12 + (i / 7) * 0.7;
      const y = railTopY + (railBotY - railTopY) * p;
      const z = railTopZ + (railBotZ - railTopZ) * p;
      beam([-0.23, y, z], [0.23, y, z], 0.025, silver, lander);
    }
    // Astronaut with pressure suit, life-support backpack and reflective visor, jointed at the
    // hips, shoulders and helmet so he can lope around the surface.
    const joint = (parent: THREE.Group, x: number, y: number) => {
      const group = new THREE.Group();
      group.position.set(x, y, 0);
      parent.add(group);
      return group;
    };
    const astronaut = new THREE.Group();
    plant(astronaut, START.x, START.z, START.heading, BOOT_BASE);
    root.add(astronaut);
    const legs = [-0.15, 0.15].map((x) => {
      const hip = joint(astronaut, x, 0.65);
      beam([0, 0, 0], [x * 0.15, -0.43, 0.04], 0.11, white, hip);
      return { hip, boot: box([0.23, 0.14, 0.35], white, [x * 0.15, -0.55, 0.12], hip) };
    });
    // The upper body pivots at the hips, so leaning into a stride never pushes a boot into the ground.
    const upper = joint(astronaut, 0, 0.65);
    const torso = joint(upper, 0, -0.65);
    box([0.48, 0.62, 0.3], white, [0, 0.9, 0], torso);
    box([0.4, 0.55, 0.25], silver, [0, 0.93, -0.23], torso);
    box([0.22, 0.2, 0.04], silver, [0, 1.0, 0.17], torso);
    const helmet = joint(torso, 0, 1.43);
    mesh(new THREE.SphereGeometry(0.29, 12, 8), white, [0, 0, 0], helmet);
    const face = mesh(new THREE.SphereGeometry(0.235, 12, 8), visor, [0, 0.02, 0.14], helmet);
    face.scale.set(1, 0.83, 0.6);
    const arms = [-0.15, 0.15].map((x) => {
      const shoulder = joint(torso, x * 1.9, 1.1);
      beam([0, 0, 0], [x * 0.5, -0.4, 0.12], 0.09, white, shoulder);
      mesh(new THREE.SphereGeometry(0.1, 6, 4), silver, [x * 0.5, -0.42, 0.12], shoulder);
      return shoulder;
    });
    const pose = (p: WalkPose) => {
      const swing = Math.cos(p.phase * Math.PI * 2);
      const s = (p.phase * 2) % 1;
      // Every step (or two-footed hop) is a ballistic arc that lands at s = 0.
      const arc = 4 * s * (1 - s);
      const stride = 0.45 * p.gait * (1 - p.bound) * swing;
      const tuck = 0.4 * p.gait * p.bound * arc;
      // Spread legs lift the boots, so drop the hips until both touch down.
      const dip = 0.55 * (1 - Math.cos(stride));
      const lift = BOOT_BASE + (0.12 + 0.2 * p.bound) * p.gait * arc - dip;
      plant(astronaut, p.x, p.z, p.heading, lift);
      legs[0].hip.rotation.set(-stride - tuck, 0, 0);
      legs[1].hip.rotation.set(stride - tuck, 0, 0);
      upper.rotation.set(
        (0.1 + 0.08 * p.bound) * p.gait,
        0,
        0.05 * p.gait * (1 - p.bound) * Math.sin(p.phase * Math.PI * 2),
      );
      helmet.rotation.set(-p.lookUp, p.look, 0);
      const free = Math.max(0, 1 - p.salute - p.wave);
      arms[0].rotation.set(
        (0.6 * stride - 0.5 * tuck) * free - 2.4 * p.salute + 0.25 * p.wave,
        0,
        0.4 * p.salute + (-2.5 + 0.35 * Math.sin(p.time * 9)) * p.wave,
      );
      arms[1].rotation.set(-0.6 * stride - 0.5 * tuck, 0, 0);
    };
    // A rigid support bar: flags on the Moon do not flutter in wind.
    // Local axes: +Y out of the ground, +X outward from the landing site.
    const flag = new THREE.Group();
    plant(flag, FLAG_POLE.x, FLAG_POLE.z);
    root.add(flag);
    beam([0, 0.1, 0], [0, 2.75, 0], 0.025, silver, flag);
    box([1.1, 0.025, 0.025], silver, [0.55, 2.75, 0], flag);
    box([1.1, 0.65, 0.025], white, [0.55, 2.4, 0], flag);
    // Printed on both faces so the flag reads correctly as the scene turns.
    for (const side of [1, -1]) {
      for (let i = 0; i < 7; i++) box([1.1, 0.05, 0.03], red, [0.55, 2.7 - i * 0.1, side * 0.02], flag);
      box([0.48, 0.35, 0.04], blue, [0.24, 2.55, side * 0.04], flag);
      for (let i = 0; i < 9; i++)
        box([0.035, 0.035, 0.012], white, [0.09 + (i % 3) * 0.14, 2.65 - Math.floor(i / 3) * 0.1, side * 0.068], flag);
    }
    for (let i = 0; i < 14; i++) {
      const holder = new THREE.Group();
      plant(holder, 0.1 + i * 0.14, 1.9 + Math.sin(i * 0.45) * 0.16 + (i % 2) * 0.15, Math.PI / 2);
      root.add(holder);
      const footprint = mesh(new THREE.CircleGeometry(0.065, 8), edge, [0, 0.02, 0], holder);
      footprint.rotation.x = -Math.PI / 2;
      footprint.scale.y = 1.6;
    }

    // State of the running animation. The walker starts on the first animated frame.
    const live = { walker: null as MoonWalker | null, rand: Math.random, printHead: 0, grainHead: 0 };

    // Fresh bootprints, fading back into the regolith as newer ones are pressed.
    const prints = new THREE.InstancedMesh(new THREE.CircleGeometry(0.08, 8), material("#ffffff"), PRINTS);
    resources.push(prints.geometry, prints);
    prints.receiveShadow = true;
    prints.frustumCulled = false;
    prints.count = 0;
    root.add(prints);
    const fresh = new THREE.Color("#686e79");
    const worn = new THREE.Color("#9b9ea5");
    const tint = new THREE.Color();
    for (let i = 0; i < PRINTS; i++) prints.setColorAt(i, worn);
    const stamp = (boot: THREE.Object3D, heading: number) => {
      boot.getWorldPosition(foot);
      // Stagger heights slightly so crossing trails never z-fight.
      frameAt(foot.x, foot.z, heading, 0.03 + (live.printHead % 12) * 0.0004);
      dummy.position.copy(surfPos);
      dummy.quaternion.copy(surfQuat).multiply(circleTilt);
      dummy.scale.set(1, 1.7, 1);
      dummy.updateMatrix();
      prints.setMatrixAt(live.printHead, dummy.matrix);
      live.printHead = (live.printHead + 1) % PRINTS;
      prints.count = Math.min(PRINTS, prints.count + 1);
      for (let i = 0; i < prints.count; i++) {
        const age = (live.printHead - 1 - i + PRINTS) % PRINTS;
        prints.setColorAt(i, tint.copy(fresh).lerp(worn, THREE.MathUtils.smoothstep(age, PRINTS * 0.25, PRINTS - 1)));
      }
      prints.instanceMatrix.needsUpdate = true;
      if (prints.instanceColor) prints.instanceColor.needsUpdate = true;
    };

    // Dust kicked up by each landing. With no air on the Moon it flies in clean arcs and drops straight back.
    const dust = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), rim, DUST);
    resources.push(dust.geometry, dust);
    dust.frustumCulled = false;
    root.add(dust);
    const grains = Array.from({ length: DUST }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, rest: 0 }));
    const kick = (boot: THREE.Object3D, heading: number, count: number) => {
      const { rand } = live;
      boot.getWorldPosition(foot);
      for (let n = 0; n < count; n++) {
        const g = grains[live.grainHead];
        live.grainHead = (live.grainHead + 1) % DUST;
        const a = heading + Math.PI + (rand() - 0.5) * 2.4;
        const v = 0.2 + rand() * 0.45;
        const upV = 0.35 + rand() * 0.6;
        const ny = groundHeight(foot.x, foot.z) + MOON_RADIUS;
        const nx = foot.x / MOON_RADIUS,
          nny = ny / MOON_RADIUS,
          nz = foot.z / MOON_RADIUS;
        // Kick along the ground, then loft it along the surface normal so it leaves a slope cleanly.
        let vx = Math.sin(a) * v,
          vy = 0,
          vz = Math.cos(a) * v;
        const into = vx * nx + vy * nny + vz * nz;
        vx += nx * (upV - into);
        vy += nny * (upV - into);
        vz += nz * (upV - into);
        Object.assign(g, {
          x: foot.x,
          y: groundHeight(foot.x, foot.z) + 0.06,
          z: foot.z,
          vx,
          vy,
          vz,
          size: 0.018 + rand() * 0.028,
          rest: 0,
        });
      }
    };
    const settle = (dt: number) => {
      for (let i = 0; i < DUST; i++) {
        const g = grains[i];
        if (g.size && !g.rest) {
          // Fall toward the Moon's centre, so dust returns to the surface on a slope.
          const cx = g.x,
            cy = g.y + MOON_RADIUS,
            cz = g.z;
          const dist = Math.hypot(cx, cy, cz) || 1;
          const nx = cx / dist,
            ny = cy / dist,
            nz = cz / dist;
          g.vx -= nx * MOON_G * dt;
          g.vy -= ny * MOON_G * dt;
          g.vz -= nz * MOON_G * dt;
          g.x += g.vx * dt;
          g.y += g.vy * dt;
          g.z += g.vz * dt;
          const px = g.x,
            py = g.y + MOON_RADIUS,
            pz = g.z;
          const next = Math.hypot(px, py, pz) || 1;
          const radial = g.vx * nx + g.vy * ny + g.vz * nz;
          if (radial < 0 && next <= MOON_RADIUS + 0.04) {
            const restR = MOON_RADIUS + 0.03;
            g.x = (px / next) * restR;
            g.y = (py / next) * restR - MOON_RADIUS;
            g.z = (pz / next) * restR;
            g.rest = dt;
          } else if (next > MOON_RADIUS + 6) g.size = 0;
        } else if (g.rest && (g.rest += dt) > 0.5) g.size = 0;
        dummy.position.set(g.x, g.y, g.z);
        dummy.rotation.set(g.vx * 9, g.vz * 9, 0);
        dummy.scale.setScalar(g.size * Math.min(1, 1.25 - g.rest * 2.5));
        dummy.updateMatrix();
        dust.setMatrixAt(i, dummy.matrix);
      }
      dust.instanceMatrix.needsUpdate = true;
    };
    settle(0);

    const tick = (dt: number, viewer: THREE.Vector3) => {
      if (!live.walker) {
        // A fresh stroll on every visit.
        const seed = (Math.random() * 2 ** 32) >>> 0;
        live.walker = createMoonWalker(seed);
        live.rand = makeRng(seed + 1);
      }
      let landed = -1;
      live.walker.update(dt, viewer, (side) => (landed = side));
      const p = live.walker.pose;
      pose(p);
      if (landed >= 0) {
        astronaut.updateMatrixWorld(true);
        const hop = p.bound > 0.5;
        for (const leg of hop ? legs : [legs[landed]]) {
          stamp(leg.boot, p.heading);
          kick(leg.boot, p.heading, hop ? 6 : 4);
        }
      }
      settle(dt);
    };
    return { root, resources, tick };
  }, []);
  useEffect(() => () => scene.resources.forEach((r) => r.dispose()), [scene]);
  useFrame(({ camera }, delta) => {
    if (animate) scene.tick(Math.min(delta, 0.1), camera.position);
  });
  return <primitive object={scene.root} />;
}

/** Twinkling stars and a turning Earth, fixed to the camera so they hang behind the Moon from every angle. */
function Sky({ animate }: { animate: boolean }) {
  const { camera, scene } = useThree();
  const sky = useMemo(() => {
    const group = new THREE.Group();
    const resources: { dispose(): void }[] = [];
    const rng = makeRng(7);
    // Stars live in a unit square stretched to the view each frame, so they fill any aspect ratio.
    const stars = new THREE.Group();
    stars.position.z = -70;
    group.add(stars);
    const layers = (
      [
        [120, 1.5],
        [28, 2.5],
      ] as const
    ).map(([count, size]) => {
      const position = new Float32Array(count * 3);
      const color = new Float32Array(count * 4);
      const glow = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        position.set([rng() * 2 - 1, rng() * 2 - 1, 0], i * 3);
        const hue = rng();
        color.set(hue < 0.15 ? [1, 0.86, 0.7, 0] : hue < 0.3 ? [0.75, 0.86, 1, 0] : [1, 1, 1, 0], i * 4);
        glow.set([0.3 + rng() * 0.7, 0.8 + rng() * 2.4, rng() * Math.PI * 2], i * 3);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(color, 4));
      const points = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          size,
          sizeAttenuation: false,
          vertexColors: true,
          transparent: true,
          depthWrite: false,
        }),
      );
      points.frustumCulled = false;
      stars.add(points);
      resources.push(geometry, points.material);
      return { color, glow, attribute: geometry.getAttribute("color") };
    });
    const globe = buildGlobe(0.5, 3, 4);
    resources.push(globe);
    const earth = new THREE.Group();
    earth.rotation.z = 0.41;
    earth.add(globe.group);
    group.add(earth);
    const clock = { time: 0 };
    const shine = () => {
      const { time } = clock;
      globe.group.rotation.y = time * 0.15;
      for (const { color, glow, attribute } of layers) {
        for (let i = 0; i < glow.length / 3; i++)
          color[i * 4 + 3] = glow[i * 3] * (0.6 + 0.4 * Math.sin(time * glow[i * 3 + 1] + glow[i * 3 + 2]));
        attribute.needsUpdate = true;
      }
    };
    shine();
    const frame = (dt: number, cam: THREE.OrthographicCamera) => {
      const halfW = (cam.right - cam.left) / (2 * cam.zoom),
        halfH = (cam.top - cam.bottom) / (2 * cam.zoom);
      stars.scale.set(halfW, halfH, 1);
      earth.position.set(-halfW * 0.62, halfH * 0.5, -60);
      if (!dt) return;
      clock.time += dt;
      shine();
    };
    return { group, resources, frame };
  }, []);
  useEffect(() => {
    // The default camera sits outside the scene graph; parent it so the sky renders with it.
    scene.add(camera);
    camera.add(sky.group);
    return () => {
      camera.remove(sky.group);
      scene.remove(camera);
    };
  }, [camera, scene, sky]);
  useEffect(() => () => sky.resources.forEach((r) => r.dispose()), [sky]);
  useFrame((_, delta) => sky.frame(animate ? Math.min(delta, 0.1) : 0, camera as THREE.OrthographicCamera));
  return null;
}

function DragCamera({ animate }: { animate: boolean }) {
  const { camera, gl, invalidate, size } = useThree();
  const orbit = useRef<OrbitControls | null>(null);
  // 0 = still, 1 = full speed. Eases so the turn never starts or stops abruptly.
  const motion = useRef(0);
  const dragging = useRef(false);
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    cam.position.copy(HOME);
    const controls = new OrbitControls(cam, gl.domElement);
    controls.target.copy(TARGET);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = false;
    controls.autoRotate = false;
    controls.minPolarAngle = 0.65;
    controls.maxPolarAngle = 1.4;
    controls.rotateSpeed = 0.7;
    controls.cursorStyle = "grab";
    controls.update();
    // Horizontal swipes turn the scene; vertical swipes still scroll the page on touch screens.
    gl.domElement.style.setProperty("touch-action", "pan-y");
    orbit.current = controls;
    const change = () => invalidate();
    // Grabbing the scene stops the turn at once; letting go eases it back in.
    const grab = () => {
      dragging.current = true;
      motion.current = 0;
    };
    const release = () => {
      dragging.current = false;
      invalidate();
    };
    const key = (e: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      const spherical = new THREE.Spherical().setFromVector3(cam.position.clone().sub(controls.target));
      spherical.theta += e.key === "ArrowLeft" ? -0.12 : e.key === "ArrowRight" ? 0.12 : 0;
      spherical.phi += e.key === "ArrowUp" ? -0.08 : e.key === "ArrowDown" ? 0.08 : 0;
      cam.position.copy(new THREE.Vector3().setFromSpherical(spherical).add(controls.target));
      controls.update();
      invalidate();
    };
    gl.domElement.setAttribute("tabindex", "0");
    gl.domElement.setAttribute("aria-label", "Apollo 11 Moon landing. Drag to look around, or use the arrow keys.");
    gl.domElement.addEventListener("keydown", key);
    controls.addEventListener("change", change);
    controls.addEventListener("start", grab);
    controls.addEventListener("end", release);
    invalidate();
    return () => {
      orbit.current = null;
      dragging.current = false;
      controls.dispose();
      gl.domElement.removeEventListener("keydown", key);
    };
  }, [camera, gl, invalidate]);
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    // Three.js cameras are mutable scene objects; update their projection imperatively.
    // eslint-disable-next-line react-hooks/immutability
    cam.zoom = Math.min(size.width / FRAME_W, size.height / FRAME_H);
    cam.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate, size.width, size.height]);
  useEffect(() => {
    if (animate) invalidate();
  }, [animate, invalidate]);
  useFrame((_, delta) => {
    const controls = orbit.current;
    if (!controls) return;
    // Frames are on demand, so the first delta after a pause can be long.
    const dt = Math.min(delta, 0.1);
    const goal = animate && !dragging.current ? 1 : 0;
    motion.current += (goal - motion.current) * Math.min(1, dt * 2.5);
    if (Math.abs(goal - motion.current) < 0.005) motion.current = goal;
    // The astronaut, dust and stars need every frame, even mid-drag.
    if (animate || motion.current) invalidate();
    if (!motion.current) return;
    // Turn passively and drift back to the composed tilt after someone has dragged it.
    view.setFromVector3(offset.copy(camera.position).sub(controls.target));
    view.theta += SPIN * motion.current * dt;
    view.phi += (HOME_TILT - view.phi) * Math.min(1, dt * 0.6) * motion.current;
    camera.position.setFromSpherical(view).add(controls.target);
    controls.update();
  });
  return null;
}

function OnFirstFrame({ onReady }: { onReady?: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    requestAnimationFrame(() => onReady?.());
  });
  return null;
}

export function HeroScene({ onReady }: { onReady?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduce = useReducedMotion();
  // Reduced motion keeps the composed still pose; off-screen, nothing renders at all.
  const animate = inView && !reduce;
  return (
    <div ref={ref} className="moon-scene">
      <Canvas
        orthographic
        shadows="percentage"
        frameloop="demand"
        dpr={[1, 1.75]}
        camera={{ position: [6, 0.8, 8], zoom: 24, near: 0.1, far: 120 }}
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
      >
        <hemisphereLight args={["#d8e8ff", "#596273", 1.3]} />
        <directionalLight
          position={[-6, 12, 8]}
          intensity={3.2}
          color="#fff5df"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
          shadow-normalBias={0.04}
        />
        <directionalLight position={[6, 3, -8]} intensity={1.2} color="#99bcff" />
        <MoonLanding animate={animate} />
        <DragCamera animate={animate} />
        <Sky animate={animate} />
        <OnFirstFrame onReady={onReady} />
      </Canvas>
    </div>
  );
}
