/**
 * Procedural environments: faceted terrain per setting, animated low-poly
 * water, gradient sky dome, sun/moon, clouds, stars and weather. Everything
 * is seeded and a pure function of time.
 */
import * as THREE from "three";
import type { Setting, TimeOfDay, Weather } from "@/lib/schema/video";
import { clamp, lerp, makeNoise2, makeRng, range, smooth } from "@/lib/lowpoly/core";
import { makeSmoke, type Effect } from "@/lib/lowpoly/effects";
import { buildGlobe } from "@/lib/lowpoly/globe";

export interface EnvSpec {
  setting: Setting;
  timeOfDay: TimeOfDay;
  weather: Weather;
  palette?: { sky?: string; ground?: string; accent?: string };
}

export interface Environment {
  group: THREE.Group;
  fog: THREE.Fog | null;
  background: THREE.Color;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  night: boolean;
  hasWater: boolean;
  heightAt(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
  flash(t: number): number;
  update(t: number): void;
  dispose(): void;
}

interface Light {
  top: string;
  horizon: string;
  sun: string;
  sunI: number;
  elev: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  water: string;
}

const TOD: Record<TimeOfDay, Light> = {
  dawn: {
    top: "#3d4a8c",
    horizon: "#ffb38a",
    sun: "#ffc9a0",
    sunI: 2.3,
    elev: 12,
    hemiSky: "#c3c8ff",
    hemiGround: "#6a5040",
    hemiI: 1.0,
    water: "#3a6f9a",
  },
  day: {
    top: "#3f7fd6",
    horizon: "#d6eaff",
    sun: "#fff3df",
    sunI: 3.0,
    elev: 52,
    hemiSky: "#d4e6ff",
    hemiGround: "#6f6a52",
    hemiI: 1.2,
    water: "#2b8fb3",
  },
  dusk: {
    top: "#2a2152",
    horizon: "#ff7a45",
    sun: "#ff9b5e",
    sunI: 2.2,
    elev: 9,
    hemiSky: "#a08ad0",
    hemiGround: "#4a3330",
    hemiI: 0.85,
    water: "#3c4f80",
  },
  night: {
    top: "#04060e",
    horizon: "#1d2748",
    sun: "#9fb4ff",
    sunI: 0.9,
    elev: 40,
    hemiSky: "#40508a",
    hemiGround: "#151520",
    hemiI: 0.55,
    water: "#11314f",
  },
};

const GROUND: Record<Setting, [string, string, string]> = {
  plains: ["#86b352", "#6f9c45", "#9cbd5e"],
  hills: ["#73a34b", "#5d8c3e", "#93b663"],
  forest: ["#558f3f", "#437a35", "#6ea04c"],
  desert: ["#e4bb76", "#d4a35c", "#efcc8e"],
  snow: ["#e8eef5", "#d3dce8", "#ffffff"],
  mountains: ["#829070", "#6c7660", "#9ea493"],
  coast: ["#86b352", "#6f9c45", "#9cbd5e"],
  ocean: ["#86b352", "#6f9c45", "#9cbd5e"],
  river: ["#86b352", "#6f9c45", "#9cbd5e"],
  city: ["#a19d94", "#8d897f", "#b3afa6"],
  jungle: ["#40924a", "#2f7a3a", "#5aa857"],
  battlefield: ["#7d6e51", "#62563f", "#8f7f5e"],
  lunar: ["#a3a3a8", "#85858b", "#bdbdc2"],
  orbit: ["#000000", "#000000", "#000000"],
};

const WATER_SETTINGS = new Set<Setting>(["coast", "ocean", "river"]);
const tmp = new THREE.Color();
const mix = (a: string, b: string, k: number) => "#" + tmp.set(a).lerp(new THREE.Color(b), k).getHexString();

function lighting(spec: EnvSpec): Light & { fogNear: number; fogFar: number } {
  const base = { ...TOD[spec.timeOfDay] };
  let fogNear = 70,
    fogFar = 280;
  const greyTo = (k: number, grey = "#8d939c") => {
    base.horizon = mix(base.horizon, grey, k);
    base.top = mix(base.top, grey, k * 0.8);
    base.sunI *= 1 - k * 0.6;
  };
  switch (spec.weather) {
    case "cloudy":
      greyTo(0.3, "#b8bec6");
      break;
    case "rain":
      greyTo(0.5);
      fogNear = 35;
      fogFar = 180;
      break;
    case "storm":
      greyTo(0.7, "#5d6470");
      fogNear = 30;
      fogFar = 160;
      break;
    case "fog":
      greyTo(0.55, "#c9ced3");
      fogNear = 8;
      fogFar = 75;
      break;
    case "dust":
      base.horizon = mix(base.horizon, "#d9b27a", 0.6);
      base.top = mix(base.top, "#c9a46a", 0.4);
      fogNear = 22;
      fogFar = 130;
      break;
    case "smoke":
      base.horizon = mix(base.horizon, "#8a7f73", 0.5);
      base.top = mix(base.top, "#5f5852", 0.35);
      base.sunI *= 0.7;
      fogNear = 25;
      fogFar = 140;
      break;
    case "snow":
      greyTo(0.35, "#dfe6ee");
      fogNear = 30;
      fogFar = 170;
      break;
    default:
      break;
  }
  if (spec.setting === "lunar" || spec.setting === "orbit") {
    base.top = "#000000";
    base.horizon = "#05060c";
    base.sun = "#ffffff";
    base.sunI = 3.2;
    base.hemiI = 0.35;
    base.hemiSky = "#8090b0";
    base.hemiGround = "#202024";
  }
  if (spec.palette?.sky) {
    base.top = mix(base.top, spec.palette.sky, 0.5);
    base.horizon = mix(base.horizon, spec.palette.sky, 0.35);
  }
  return { ...base, fogNear, fogFar };
}

export function buildEnvironment(spec: EnvSpec, seed: number, o: { forceWater?: boolean } = {}): Environment {
  const rng = makeRng(seed);
  const noise = makeNoise2(seed);
  const L = lighting(spec);
  const night = spec.timeOfDay === "night";
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const effects: Effect[] = [];
  const setting = spec.setting;
  const space = setting === "lunar" || setting === "orbit";
  const hasWater = WATER_SETTINGS.has(setting) || (!!o.forceWater && !space);

  // ---------------------------------------------------------- height field
  const craters = Array.from({ length: setting === "lunar" ? 14 : setting === "battlefield" ? 9 : 0 }, () => ({
    x: range(rng, -40, 40),
    z: range(rng, -40, 40),
    r: range(rng, 1.5, setting === "lunar" ? 7 : 3),
    d: range(rng, 0.4, 1.4),
  }));
  const shore = (x: number) => -5 + 3.5 * noise(x * 0.04 + 11, 3.7, 2);
  const riverZ = (x: number) => 3 * Math.sin(x * 0.07 + (seed % 7));
  const waterBand =
    setting === "coast" || setting === "ocean" || setting === "river" ? setting : o.forceWater ? "coast" : null;

  const heightAt = (x: number, z: number): number => {
    if (setting === "orbit") return -1000;
    const n = noise(x * 0.035, z * 0.035, 3);
    const r = Math.hypot(x, z);
    const f = smooth(clamp((r - 18) / 40, 0, 1));
    let h: number;
    switch (setting) {
      case "hills":
      case "snow":
        h = 1.1 * n + f * 11 * (0.6 + n);
        break;
      case "forest":
      case "jungle":
        h = 0.8 * n + f * 7 * (0.6 + n);
        break;
      case "desert":
        h = 0.9 * Math.sin(x * 0.12 + n * 3) + 0.4 * n + f * 6 * (0.5 + n);
        break;
      case "mountains":
        h = n + f * f * 30 * (0.45 + Math.abs(n));
        break;
      case "city":
        h = 0;
        break;
      case "lunar":
        h = 0.6 * n + f * 6 * (0.5 + n);
        break;
      case "ocean":
        h = -7 + (r > 45 && n > 0.25 ? (n - 0.25) * 20 : 0);
        break;
      default:
        h = 0.6 * n + f * 4 * (0.5 + n);
    }
    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z) / c.r;
      if (d < 1.3) h += d < 1 ? -c.d * (1 - d * d) : (c.d * 0.35 * (1.3 - d)) / 0.3;
    }
    if (waterBand === "coast") {
      const s = shore(x);
      if (z < s) h = Math.min(h, -1.8 - (s - z) * 0.18);
      else h = Math.max(h, 0.35 + Math.min(1, (z - s) * 0.2) * 0.4);
    } else if (waterBand === "river") {
      const d = Math.abs(z - riverZ(x));
      if (d < 3.6) h = -1.6;
      else if (d < 6) h = Math.min(h, lerp(-1.6, 0.4, (d - 3.6) / 2.4)) + 0 * h;
    }
    return h;
  };
  const isWater = (x: number, z: number) => hasWater && heightAt(x, z) < -0.05;

  // ---------------------------------------------------------- terrain
  if (setting !== "orbit") {
    const size = 600,
      segs = 72;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (i % 3 === 0 ? 0 : 0),
        z = pos.getZ(i);
      const jx = noise(x * 0.9 + 5, z * 0.9, 1) * 0.9,
        jz = noise(x * 0.9, z * 0.9 + 9, 1) * 0.9;
      pos.setXYZ(i, x + jx, heightAt(x + jx, z + jz), z + jz);
    }
    const flat = geo.toNonIndexed();
    geo.dispose();
    flat.computeVertexNormals();
    const p = flat.getAttribute("position") as THREE.BufferAttribute;
    const nrm = flat.getAttribute("normal") as THREE.BufferAttribute;
    const cols = new Float32Array(p.count * 3);
    let [low, mid, high] = GROUND[setting];
    if (spec.palette?.ground) {
      low = mix(low, spec.palette.ground, 0.6);
      mid = mix(mid, spec.palette.ground, 0.6);
      high = mix(high, spec.palette.ground, 0.6);
    }
    if (spec.weather === "snow" && setting !== "desert") {
      low = mix(low, "#eef2f7", 0.65);
      mid = mix(mid, "#e2e8f0", 0.65);
      high = mix(high, "#ffffff", 0.65);
    }
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i += 3) {
      const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
      const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      const ny = nrm.getY(i);
      const v = noise(cx * 0.08 + 3, cz * 0.08, 2);
      c.set(v < -0.15 ? mid : v > 0.2 ? high : low);
      if (setting === "city" && Math.hypot(cx, cz) < 30 && (Math.abs(cx % 12) < 1.6 || Math.abs(cz % 12) < 1.6))
        c.set("#6f6b64");
      if (setting === "city") c.lerp(new THREE.Color(mid), 0.7);
      if (ny < 0.72) c.set(setting === "desert" ? "#c08e52" : setting === "lunar" ? "#78787e" : "#7f7a6e");
      if ((setting === "mountains" || setting === "snow") && y > 12) c.set("#f4f7fb");
      if (hasWater && y < 0.6 && y > -0.4) c.set("#e2cf98");
      if (hasWater && y <= -0.4) c.set("#b9a77a");
      const j = 1 + (rng() - 0.5) * 0.08;
      for (let k = 0; k < 3; k++) {
        cols[(i + k) * 3] = c.r * j;
        cols[(i + k) * 3 + 1] = c.g * j;
        cols[(i + k) * 3 + 2] = c.b * j;
      }
    }
    flat.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
    const terrain = new THREE.Mesh(flat, mat);
    terrain.receiveShadow = true;
    group.add(terrain);
    disposables.push(flat, mat);
  }

  // ---------------------------------------------------------- water
  let waterUpdate: ((t: number) => void) | null = null;
  if (hasWater) {
    const wgeo = new THREE.PlaneGeometry(600, 600, 48, 48).toNonIndexed();
    wgeo.rotateX(-Math.PI / 2);
    const wpos = wgeo.getAttribute("position") as THREE.BufferAttribute;
    const base = (wpos.array as Float32Array).slice();
    const wmat = new THREE.MeshStandardMaterial({
      color: L.water,
      flatShading: true,
      roughness: 0.32,
      metalness: 0.12,
      transparent: true,
      opacity: 0.9,
    });
    const water = new THREE.Mesh(wgeo, wmat);
    water.receiveShadow = true;
    group.add(water);
    disposables.push(wgeo, wmat);
    waterUpdate = (t) => {
      const a = wpos.array as Float32Array;
      for (let i = 0; i < a.length; i += 3) {
        const x = base[i],
          z = base[i + 2];
        a[i + 1] =
          0.16 * Math.sin(x * 0.23 + t * 1.3) +
          0.11 * Math.cos(z * 0.31 + t * 0.95) +
          0.05 * Math.sin((x + z) * 0.6 + t * 2.1);
      }
      wpos.needsUpdate = true;
      wgeo.computeVertexNormals();
    };
  }

  // ---------------------------------------------------------- sky
  const skyGeo = new THREE.SphereGeometry(460, 18, 12);
  const sp = skyGeo.getAttribute("position") as THREE.BufferAttribute;
  const skyCols = new Float32Array(sp.count * 3);
  const top = new THREE.Color(L.top),
    hor = new THREE.Color(L.horizon),
    below = new THREE.Color(L.horizon).multiplyScalar(0.7);
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i) / 460;
    const col = y >= 0 ? hor.clone().lerp(top, Math.pow(y, 0.6)) : hor.clone().lerp(below, Math.min(1, -y * 3));
    skyCols.set([col.r, col.g, col.b], i * 3);
  }
  skyGeo.setAttribute("color", new THREE.BufferAttribute(skyCols, 3));
  const skyMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -1;
  group.add(sky);
  disposables.push(skyGeo, skyMat);

  // ---------------------------------------------------------- lights
  const elev = THREE.MathUtils.degToRad(L.elev);
  const azim = THREE.MathUtils.degToRad(38 + range(rng, -20, 20));
  const sunDir = new THREE.Vector3(
    Math.sin(azim) * Math.cos(elev),
    Math.sin(elev),
    Math.cos(azim) * Math.cos(elev),
  ).normalize();
  const sun = new THREE.DirectionalLight(L.sun, L.sunI);
  sun.position.copy(sunDir).multiplyScalar(80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -45;
  sc.right = 45;
  sc.top = 45;
  sc.bottom = -45;
  sc.near = 1;
  sc.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  group.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiI);
  group.add(hemi);
  group.add(new THREE.AmbientLight("#ffffff", night ? 0.12 : 0.18));

  // Sun / moon disc.
  const discMat = new THREE.MeshBasicMaterial({ color: night ? "#e8ecff" : L.sun, fog: false, toneMapped: false });
  const discGeo = new THREE.IcosahedronGeometry(night ? 10 : 15, 1);
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.position.copy(sunDir).multiplyScalar(400);
  if (L.elev > 2 && spec.weather !== "storm" && spec.weather !== "fog") group.add(disc);
  disposables.push(discMat, discGeo);

  // Stars.
  if (night || space) {
    const n = 500;
    const sgeo = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rng() * Math.PI * 2,
        v = Math.acos(range(rng, space ? -1 : 0.05, 1));
      arr.set([Math.sin(v) * Math.cos(u) * 440, Math.cos(v) * 440, Math.sin(v) * Math.sin(u) * 440], i * 3);
    }
    sgeo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const smat = new THREE.PointsMaterial({ color: "#ffffff", size: 1.8, sizeAttenuation: false, fog: false });
    group.add(new THREE.Points(sgeo, smat));
    disposables.push(sgeo, smat);
  }

  // Earth in the sky (lunar) or below (orbit).
  if (space) {
    const earth = buildGlobe(setting === "orbit" ? 70 : 22, setting === "orbit" ? 18 : 10, seed);
    if (setting === "orbit") {
      earth.group.position.set(0, -82, -30);
      earth.group.rotation.set(0.4, 1.2, 0);
    } else {
      earth.group.position.set(-90, 120, -320);
    }
    group.add(earth.group);
    disposables.push(earth);
  }

  // Clouds.
  const cloudCount = space
    ? 0
    : ({ clear: 4, cloudy: 11, rain: 14, storm: 16, fog: 3, dust: 3, smoke: 5, snow: 10 } as Record<Weather, number>)[
        spec.weather
      ];
  const cloudMat = new THREE.MeshStandardMaterial({
    color: spec.weather === "storm" || spec.weather === "rain" ? "#8a9099" : night ? "#5a6480" : "#ffffff",
    flatShading: true,
    roughness: 1,
    transparent: true,
    opacity: 0.95,
  });
  const cloudGeo = new THREE.IcosahedronGeometry(1, 0);
  disposables.push(cloudMat, cloudGeo);
  const clouds: { g: THREE.Group; x0: number; speed: number }[] = [];
  for (let i = 0; i < cloudCount; i++) {
    const g = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < puffs; k++) {
      const m = new THREE.Mesh(cloudGeo, cloudMat);
      const s = range(rng, 3, 6);
      m.scale.set(s * 1.3, s * 0.8, s);
      m.position.set(k * 4 - puffs * 2 + range(rng, -1, 1), range(rng, -1, 1.5), range(rng, -1.5, 1.5));
      m.castShadow = true;
      g.add(m);
    }
    g.position.set(range(rng, -120, 120), range(rng, 32, 50), range(rng, -140, 40));
    group.add(g);
    clouds.push({ g, x0: g.position.x, speed: range(rng, 0.6, 1.6) });
  }

  // ---------------------------------------------------------- weather
  let weatherUpdate: ((t: number) => void) | null = null;
  if (spec.weather === "rain" || spec.weather === "storm") {
    const n = 1400;
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 6);
    const seeds = Array.from({ length: n }, () => [range(rng, -45, 45), range(rng, -45, 30), rng()]);
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const m = new THREE.LineBasicMaterial({ color: "#b8cde6", transparent: true, opacity: 0.55 });
    const lines = new THREE.LineSegments(g, m);
    lines.frustumCulled = false;
    group.add(lines);
    disposables.push(g, m);
    weatherUpdate = (t) => {
      for (let i = 0; i < n; i++) {
        const [x, z, ph] = seeds[i];
        const y = 32 - ((((t * 24 + ph * 32) % 32) + 32) % 32);
        arr.set([x, y, z, x + 0.18, y + 1.1, z], i * 6);
      }
      g.getAttribute("position").needsUpdate = true;
    };
  } else if (spec.weather === "snow" || spec.weather === "dust") {
    const n = spec.weather === "snow" ? 1000 : 600;
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3);
    const seeds = Array.from({ length: n }, () => [range(rng, -45, 45), range(rng, -45, 30), rng()]);
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({
      color: spec.weather === "snow" ? "#ffffff" : "#d8b47e",
      size: spec.weather === "snow" ? 0.28 : 0.2,
      transparent: true,
      opacity: 0.9,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    group.add(pts);
    disposables.push(g, m);
    weatherUpdate = (t) => {
      for (let i = 0; i < n; i++) {
        const [x, z, ph] = seeds[i];
        if (spec.weather === "snow") {
          const y = 26 - ((((t * 1.9 + ph * 26) % 26) + 26) % 26);
          arr.set([x + Math.sin(t * 0.8 + ph * 9) * 0.8, y, z + Math.cos(t * 0.6 + ph * 7) * 0.5], i * 3);
        } else {
          const xx = ((((x + t * 6 + 45) % 90) + 90) % 90) - 45;
          arr.set([xx, 0.5 + ph * 8 + Math.sin(t + ph * 6) * 0.4, z], i * 3);
        }
      }
      g.getAttribute("position").needsUpdate = true;
    };
  }
  if (spec.weather === "smoke" || setting === "battlefield") {
    for (let i = 0; i < 4; i++) {
      const a = range(rng, -2.6, -0.5);
      const r = range(rng, 26, 42);
      const fx = makeSmoke(rng, {
        size: range(rng, 2.2, 3.4),
        rise: range(rng, 18, 28),
        color: "#6f6862",
        count: 10,
        life: 7,
      });
      const x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      fx.object.position.set(x, heightAt(x, z), z);
      group.add(fx.object);
      effects.push(fx);
    }
  }

  const strikes = spec.weather === "storm" ? Array.from({ length: 6 }, () => rng() * 12) : [];
  const flash = (t: number) => {
    for (const s of strikes) {
      const d = (t % 12) - s;
      if (d >= 0 && d < 0.35) return d < 0.08 ? 1 : d > 0.16 && d < 0.22 ? 0.7 : 0.15;
    }
    return 0;
  };

  const fog = space ? null : new THREE.Fog(L.horizon, L.fogNear, L.fogFar);

  return {
    group,
    fog,
    background: new THREE.Color(L.horizon),
    sun,
    hemi,
    night,
    hasWater,
    heightAt,
    isWater,
    flash,
    update(t) {
      waterUpdate?.(t);
      weatherUpdate?.(t);
      for (const c of clouds) c.g.position.x = ((((c.x0 + t * c.speed + 140) % 280) + 280) % 280) - 140;
      const st = { time: t, progress: 0, moving: false, night, phase: 0 };
      for (const fx of effects) fx.update(st);
      const f = flash(t);
      hemi.intensity = L.hemiI + f * 2.5;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      effects.forEach((e) => e.dispose());
    },
  };
}
