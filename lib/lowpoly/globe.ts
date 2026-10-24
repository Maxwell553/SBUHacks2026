import * as THREE from "three";
import { makeNoise2, makeRng } from "@/lib/lowpoly/core";
import { LANDMASK_B64, LANDMASK_H, LANDMASK_W } from "@/lib/lowpoly/landmask";

let mask: Uint8Array | null = null;
function landMask(): Uint8Array {
  if (mask) return mask;
  const bin = typeof atob === "function" ? atob(LANDMASK_B64) : Buffer.from(LANDMASK_B64, "base64").toString("binary");
  mask = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) mask[i] = bin.charCodeAt(i);
  return mask;
}

export function isLand(lat: number, lon: number): boolean {
  const m = landMask();
  const y = Math.min(LANDMASK_H - 1, Math.max(0, Math.floor(89.999 - lat)));
  const x = ((Math.floor(lon + 180) % LANDMASK_W) + LANDMASK_W) % LANDMASK_W;
  const i = y * LANDMASK_W + x;
  return ((m[i >> 3] >> (i & 7)) & 1) === 1;
}

/** lat/lon (degrees) -> point on a sphere of radius r (three.js globe convention). */
export function latLonToVec3(lat: number, lon: number, r: number, out = new THREE.Vector3()) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return out.set(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

export function vec3ToLatLon(v: THREE.Vector3) {
  const r = v.length();
  const lat = 90 - THREE.MathUtils.radToDeg(Math.acos(v.y / r));
  let lon = THREE.MathUtils.radToDeg(Math.atan2(v.z, -v.x)) - 180;
  if (lon < -180) lon += 360;
  return { lat, lon };
}

/** Rotation (inner y, outer x) that brings lat/lon to face +z. */
export function faceRotation(lat: number, lon: number) {
  return { y: THREE.MathUtils.degToRad(-90 - lon), x: THREE.MathUtils.degToRad(lat) };
}

function biome(lat: number, n: number): string {
  const a = Math.abs(lat);
  if (a > 68) return "#eef3f7";
  if (a > 56) return n > 0.1 ? "#7c8f5e" : "#5f7f4a";
  if (a > 36) return n > 0.25 ? "#a7a463" : "#6fa04f";
  if (a > 14) return n > -0.1 ? "#d2b56e" : "#8fae55";
  return n > 0.35 ? "#7fa34f" : "#4f9a4a";
}

/** Faceted Earth with real coastlines (Natural Earth 1° mask). */
export function buildGlobe(radius: number, detail: number, seed = 1) {
  const noise = makeNoise2(seed + 7);
  const rng = makeRng(seed + 3);
  const base = new THREE.IcosahedronGeometry(1, detail);
  const geo = base.index ? base.toNonIndexed() : base;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const { lat, lon } = vec3ToLatLon(v);
    const land = isLand(lat, lon);
    const lift = land ? 1.012 + Math.max(0, noise(lon * 0.08, lat * 0.08, 2)) * 0.022 : 1;
    v.multiplyScalar(radius * lift);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  const cols = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const cen = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    cen.set(0, 0, 0);
    for (let k = 0; k < 3; k++) cen.add(v.fromBufferAttribute(pos, i + k));
    cen.multiplyScalar(1 / 3);
    const { lat, lon } = vec3ToLatLon(cen);
    const n = noise(lon * 0.05, lat * 0.05, 2);
    if (isLand(lat, lon)) c.set(biome(lat, n));
    else c.set(Math.abs(lat) > 72 ? "#d9e6ef" : n > 0.2 ? "#24679a" : "#1e5a8c");
    const j = 1 + (rng() - 0.5) * 0.1;
    for (let k = 0; k < 3; k++) cols.set([c.r * j, c.g * j, c.b * j], (i + k) * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  geo.computeVertexNormals();
  if (geo !== base) base.dispose();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  const atmoGeo = new THREE.IcosahedronGeometry(radius * 1.06, 3);
  const atmoMat = new THREE.MeshBasicMaterial({
    color: "#7fb6ff",
    transparent: true,
    opacity: 0.12,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const atmo = new THREE.Mesh(atmoGeo, atmoMat);
  const group = new THREE.Group();
  group.add(mesh, atmo);
  return {
    group,
    mesh,
    dispose() {
      geo.dispose();
      mat.dispose();
      atmoGeo.dispose();
      atmoMat.dispose();
    },
  };
}
