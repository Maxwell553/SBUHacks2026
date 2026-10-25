import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Open rectangular structural frame, optionally tapered. No solid infill. */
export function trussGeometry(size: [number, number, number], bays: number, taper: number, beamWidth?: number) {
  const [width, height, depth] = size;
  bays = Math.max(3, Math.min(8, Math.round(bays)));
  taper = Math.max(0.05, Math.min(2, taper));
  const narrow = Math.min(width, depth),
    wide = Math.max(width, depth);
  // A shallow frame is a planar structure: size its beams from the span,
  // while keeping them inside its depth. Volumetric towers retain slender posts.
  const planar = wide > narrow * 4;
  const defaultWidth = planar ? Math.min(wide, height) * 0.025 : narrow * 0.035;
  const thickness = Math.max(0.01, Math.min(beamWidth ?? defaultWidth, narrow * (planar ? 0.5 : 0.2)));
  const pieces: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const beam = (a: THREE.Vector3, b: THREE.Vector3) => {
    const delta = b.clone().sub(a);
    const geometry = new THREE.BoxGeometry(thickness, delta.length(), thickness);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, delta.normalize()));
    geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    pieces.push(geometry);
  };
  const rings = Array.from({ length: bays + 1 }, (_, i) => {
    const t = i / bays,
      scale = 1 + (taper - 1) * t;
    return [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([x, z]) => new THREE.Vector3((x * width * scale) / 2, (t - 0.5) * height, (z * depth * scale) / 2));
  });
  for (let corner = 0; corner < 4; corner++) beam(rings[0][corner], rings[bays][corner]);
  for (let i = 0; i <= bays; i++) {
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4;
      beam(rings[i][side], rings[i][next]);
      if (i < bays) {
        beam(rings[i][side], rings[i + 1][next]);
        beam(rings[i][next], rings[i + 1][side]);
      }
    }
  }
  const result = mergeGeometries(pieces, false)!;
  pieces.forEach((g) => g.dispose());
  return result;
}
