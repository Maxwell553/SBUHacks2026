/**
 * Measured problems in rendered shots: objects passing through each other,
 * the camera inside a model, and subjects that leave the frame or shrink to
 * a speck. Pure: works on snapshots taken from PolyEngine.inspect().
 */
import { penetration } from "@/lib/lowpoly/layout";
import type { SceneElement, Scene } from "@/lib/schema/video";

/** Review rounds per film: render a draft, review it, apply the fixes. One keeps films quick. */
export const REVIEW_ROUNDS = 1;

export interface UnitSnapshot {
  element: number;
  model: string;
  role: NonNullable<SceneElement["role"]>;
  /** Takes up space: not a room shell, an effect stand-in or low ground cover. */
  solid: boolean;
  placement: "ground" | "water" | "air";
  /** A water-placed span (bridge, pier) that boats pass under. */
  span: boolean;
  /** Oriented footprint on the ground plane and vertical extent, world metres. */
  x: number;
  z: number;
  heading: number;
  hx: number;
  hz: number;
  y0: number;
  y1: number;
  /** Projected bounds in frame coordinates (0–1, y down); null when entirely behind the camera. */
  screen: { x0: number; y0: number; x1: number; y1: number } | null;
}

export interface ShotSnapshot {
  scene: number;
  /** Progress through the shot, 0–1. */
  at: number;
  shotSize?: Scene["shotSize"];
  camera: { x: number; y: number; z: number };
  units: UnitSnapshot[];
}

export type ShotIssueKind = "overlap" | "camera_inside" | "subject_offscreen" | "subject_small";

export interface ShotIssue {
  scene: number;
  kind: ShotIssueKind;
  elements: number[];
  models: string[];
  detail: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function overlapOf(a: UnitSnapshot, b: UnitSnapshot) {
  if (!a.solid || !b.solid) return 0;
  // Boats pass under spans; aircraft pass over everything at altitude (checked by height below).
  if ((a.span && b.placement === "water") || (b.span && a.placement === "water")) return 0;
  const vertical = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (vertical <= 0.25 * Math.min(a.y1 - a.y0, b.y1 - b.y0)) return 0;
  const depth = penetration(a, b).depth;
  const minor = Math.min(a.hx, a.hz, b.hx, b.hz);
  return depth > Math.max(0.08, minor * 0.35) ? depth : 0;
}

function inside(c: ShotSnapshot["camera"], u: UnitSnapshot) {
  if (!u.solid || c.y < u.y0 || c.y > u.y1) return false;
  const dx = c.x - u.x,
    dz = c.z - u.z;
  const cos = Math.cos(u.heading),
    sin = Math.sin(u.heading);
  const lx = dx * cos - dz * sin,
    lz = dx * sin + dz * cos;
  return Math.abs(lx) < u.hx * 0.9 && Math.abs(lz) < u.hz * 0.9;
}

/** Issues across all snapshots, one per scene, kind and element pair. */
export function shotIssues(snapshots: ShotSnapshot[]): ShotIssue[] {
  const found = new Map<string, ShotIssue>();
  const add = (issue: ShotIssue) => {
    const key = `${issue.scene}|${issue.kind}|${issue.elements.join(",")}`;
    if (!found.has(key)) found.set(key, issue);
  };
  for (const s of snapshots) {
    const { units } = s;
    for (let i = 0; i < units.length; i++)
      for (let j = i + 1; j < units.length; j++) {
        const depth = overlapOf(units[i], units[j]);
        if (!depth) continue;
        const [a, b] = [units[i], units[j]].sort((p, q) => p.element - q.element);
        add({
          scene: s.scene,
          kind: "overlap",
          elements: [a.element, b.element],
          models: [a.model, b.model],
          detail: `${a.model} and ${b.model} pass ${depth.toFixed(2)} m into each other at ${pct(s.at)} of the shot`,
        });
      }
    for (const u of units)
      if (inside(s.camera, u))
        add({
          scene: s.scene,
          kind: "camera_inside",
          elements: [u.element],
          models: [u.model],
          detail: `the camera is inside ${u.model} at ${pct(s.at)} of the shot`,
        });
    const subjects = units.filter((u) => u.role === "subject");
    if (!subjects.length) continue;
    const onScreen = subjects.filter((u) => {
      if (!u.screen) return false;
      const cx = (u.screen.x0 + u.screen.x1) / 2,
        cy = (u.screen.y0 + u.screen.y1) / 2;
      return cx > 0 && cx < 1 && cy > 0 && cy < 1;
    });
    const ids = [...new Set(subjects.map((u) => u.element))];
    const names = [...new Set(subjects.map((u) => u.model))];
    if (!onScreen.length) {
      add({
        scene: s.scene,
        kind: "subject_offscreen",
        elements: ids,
        models: names,
        detail: `no subject is in frame at ${pct(s.at)} of the shot`,
      });
      continue;
    }
    const tallest = Math.max(...onScreen.map((u) => u.screen!.y1 - u.screen!.y0));
    if (tallest < (s.shotSize === "wide" ? 0.05 : 0.12))
      add({
        scene: s.scene,
        kind: "subject_small",
        elements: ids,
        models: names,
        detail: `the subject is only ${pct(tallest)} of the frame height at ${pct(s.at)} of a ${s.shotSize ?? "default"} shot`,
      });
  }
  return [...found.values()];
}
