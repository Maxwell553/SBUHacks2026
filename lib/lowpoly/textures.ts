/**
 * Procedural, deterministic canvas textures for world-scale ground detail,
 * contact shadows and soft glows. Ground maps are near-white so they modulate
 * the terrain's vertex colours instead of replacing them.
 */
import * as THREE from "three";
import { makeRng, range } from "@/lib/lowpoly/core";

export type GroundKind = "grass" | "dirt" | "sand" | "snow" | "rock" | "paving" | "cobble" | "mud" | "regolith";

const cache = new Map<string, THREE.Texture>();
const hasDom = () => typeof document !== "undefined";

function canvas(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

function finish(c: HTMLCanvasElement, repeat: boolean) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const grey = (v: number, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;

/** Tileable ground detail. One tile covers `GROUND_TILE_METRES` of world space. */
export const GROUND_TILE_METRES = 4;

export function groundTexture(kind: GroundKind, seed = 1): THREE.Texture | null {
  if (!hasDom()) return null;
  const key = `ground:${kind}:${seed % 7}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 256;
  const c = canvas(S);
  const g = c.getContext("2d")!;
  const rng = makeRng(seed * 31 + kind.length * 977);
  g.fillStyle = grey(236);
  g.fillRect(0, 0, S, S);
  // Draws a shape at (x, y) and its wrapped copies so the tile repeats seamlessly.
  const wrapped = (x: number, y: number, r: number, draw: (x: number, y: number) => void) => {
    for (const dx of [-S, 0, S])
      for (const dy of [-S, 0, S]) {
        const px = x + dx,
          py = y + dy;
        if (px + r < 0 || py + r < 0 || px - r > S || py - r > S) continue;
        draw(px, py);
      }
  };
  const specks = (n: number, lo: number, hi: number, rmin: number, rmax: number, alpha = 1) => {
    for (let i = 0; i < n; i++) {
      const x = rng() * S,
        y = rng() * S,
        r = range(rng, rmin, rmax);
      g.fillStyle = grey(range(rng, lo, hi), alpha);
      wrapped(x, y, r, (px, py) => {
        g.beginPath();
        g.ellipse(px, py, r, r * range(rng, 0.6, 1), rng() * Math.PI, 0, Math.PI * 2);
        g.fill();
      });
    }
  };
  switch (kind) {
    case "grass": {
      specks(90, 196, 225, 8, 22, 0.5);
      for (let i = 0; i < 1600; i++) {
        const x = rng() * S,
          y = rng() * S,
          l = range(rng, 3, 9),
          a = range(rng, -0.5, 0.5);
        g.strokeStyle = grey(rng() > 0.5 ? range(rng, 170, 205) : range(rng, 245, 255), 0.85);
        g.lineWidth = range(rng, 0.8, 1.6);
        wrapped(x, y, l, (px, py) => {
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(px + Math.sin(a) * l, py - Math.cos(a) * l);
          g.stroke();
        });
      }
      break;
    }
    case "dirt":
    case "mud":
      specks(140, kind === "mud" ? 160 : 185, 225, 6, 20, 0.45);
      specks(900, 150, 215, 0.6, 2.2);
      specks(160, 245, 255, 0.8, 2.5);
      break;
    case "sand":
      for (let y = 0; y < S; y += 9) {
        g.strokeStyle = grey(212, 0.35);
        g.lineWidth = 2;
        g.beginPath();
        for (let x = 0; x <= S; x += 8) g.lineTo(x, y + Math.sin((x / S) * Math.PI * 4 + y * 0.3) * 2.5);
        g.stroke();
      }
      specks(1400, 205, 250, 0.4, 1.3);
      break;
    case "snow":
      specks(60, 222, 240, 14, 34, 0.45);
      specks(500, 250, 255, 0.4, 1.2);
      break;
    case "regolith":
      specks(120, 170, 225, 4, 18, 0.55);
      specks(1200, 160, 245, 0.4, 1.6);
      break;
    case "rock":
      specks(80, 180, 230, 10, 26, 0.5);
      for (let i = 0; i < 26; i++) {
        let x = rng() * S,
          y = rng() * S;
        g.strokeStyle = grey(150, 0.55);
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += range(rng, -16, 16);
          y += range(rng, -16, 16);
          g.lineTo(x, y);
        }
        g.stroke();
      }
      break;
    case "paving": {
      const rows = 8;
      const h = S / rows;
      for (let r = 0; r < rows; r++) {
        let x = r % 2 ? -h * 0.75 : 0;
        while (x < S) {
          const w = h * range(rng, 1.2, 1.9);
          g.fillStyle = grey(range(rng, 214, 246));
          g.fillRect(x + 1.5, r * h + 1.5, w - 3, h - 3);
          x += w;
        }
      }
      g.strokeStyle = grey(165, 0.9);
      g.lineWidth = 2.5;
      for (let r = 0; r <= rows; r++) {
        g.beginPath();
        g.moveTo(0, r * h);
        g.lineTo(S, r * h);
        g.stroke();
      }
      specks(500, 190, 235, 0.5, 1.6, 0.8);
      break;
    }
    case "cobble": {
      g.fillStyle = grey(175);
      g.fillRect(0, 0, S, S);
      const n = 11;
      const cell = S / n;
      for (let r = 0; r < n; r++)
        for (let k = 0; k < n; k++) {
          const cx = (k + (r % 2) * 0.5) * cell,
            cy = (r + 0.5) * cell;
          const rr = cell * range(rng, 0.38, 0.46);
          g.fillStyle = grey(range(rng, 205, 245));
          wrapped(cx, cy, rr, (px, py) => {
            g.beginPath();
            g.ellipse(px, py, rr, rr * range(rng, 0.8, 0.95), rng() * 3, 0, Math.PI * 2);
            g.fill();
          });
        }
      break;
    }
  }
  const tex = finish(c, true);
  cache.set(key, tex);
  return tex;
}

/** Soft dark disc for contact shadows (alpha falls off to the edge). */
export function contactShadowTexture(): THREE.Texture | null {
  if (!hasDom()) return null;
  const hit = cache.get("contact");
  if (hit) return hit;
  const S = 128;
  const c = canvas(S);
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, "rgba(0,0,0,0.85)");
  grd.addColorStop(0.45, "rgba(0,0,0,0.5)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const tex = finish(c, false);
  tex.colorSpace = THREE.NoColorSpace;
  cache.set("contact", tex);
  return tex;
}

/** White radial glow for sun halos and night light pools. */
export function glowTexture(): THREE.Texture | null {
  if (!hasDom()) return null;
  const hit = cache.get("glow");
  if (hit) return hit;
  const S = 128;
  const c = canvas(S);
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.45)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const tex = finish(c, false);
  cache.set("glow", tex);
  return tex;
}
