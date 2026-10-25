/**
 * Pulls people out of the lens and back to the thing the shot is about.
 * A subject person stands just off the subject's flank, at its depth, so a
 * side-on machine is not hidden by someone authored metres toward the camera.
 * Foreground witnesses stay off that centre line and only a short way in front.
 * A crowd of six or more keeps its formation. Background stays put.
 */

export interface StageFigure {
  x: number;
  z: number;
  /** Standing clearance, metres. */
  radius: number;
  role?: "subject" | "background" | "foreground";
  /** Lies on the machine instead of standing beside it. */
  aboard?: boolean;
  /** Travels with the load, so they stand ahead of it instead of in a crowd. */
  crew?: boolean;
}

export interface StageProp {
  x: number;
  z: number;
  /** Half-extent along the prop's facing, metres. */
  hx: number;
  /** Half-extent to the prop's right, metres. */
  hz: number;
  /** Radians. Zero faces world +x. */
  heading: number;
}

function worldHalf(prop: StageProp) {
  const c = Math.abs(Math.cos(prop.heading));
  const s = Math.abs(Math.sin(prop.heading));
  return { halfX: prop.hx * c + prop.hz * s, halfZ: prop.hx * s + prop.hz * c };
}

export interface DeckPart {
  parent?: string;
  shape?: string;
  size: [number, number, number];
  position?: [number, number, number];
  anchor?: string;
}

/**
 * Top of the lowest broad, flat root surface, in the model's own space.
 * Chosen by shape: thin, and wide in both horizontal directions. A beam, a
 * rail, or a post is not a surface, whatever it is named.
 */
export function deckTop(parts: readonly DeckPart[]): number | null {
  let best: number | null = null;
  for (const part of parts) {
    if (part.parent || part.shape === "group") continue;
    const [sx, sy, sz] = part.size;
    const narrow = Math.min(sx, sz);
    if (sy <= 0 || sy > 0.4 || narrow < 0.8 || narrow < sy * 4) continue;
    const py = part.position?.[1] ?? 0;
    const top = part.anchor === "bottom" ? py + sy : part.anchor === "top" ? py : py + sy / 2;
    if (best == null || top < best) best = top;
  }
  return best;
}

/**
 * Lines people up at the nose of a load they are moving, in the direction it
 * travels. Heading zero faces world +x, and forward is (cos heading, -sin heading).
 * `lead` is -1 when the load is backing up. Returns how many moved.
 */
export function stageCrew(figures: StageFigure[], prop: StageProp, lead = 1): number {
  const crew = figures.filter((figure) => figure.crew && !figure.aboard && figure.role !== "background").slice(0, 18);
  if (!crew.length) return 0;
  const dir = lead < 0 ? -1 : 1;
  const fx = Math.cos(prop.heading) * dir;
  const fz = -Math.sin(prop.heading) * dir;
  const rx = Math.sin(prop.heading);
  const rz = Math.cos(prop.heading);
  const files = crew.length >= 4 ? 2 : 1;
  crew.forEach((figure, index) => {
    const row = Math.floor(index / files);
    const file = index % files;
    const along = prop.hx + figure.radius + 0.65 + row * (figure.radius * 2.2 + 0.35);
    const across = (file - (files - 1) / 2) * (figure.radius * 2.4 + 0.3);
    figure.x = prop.x + fx * along + rx * across;
    figure.z = prop.z + fz * along + rz * across;
  });
  return crew.length;
}

/** Moves figures in place. Returns how many moved. */
export function stageBeside(figures: StageFigure[], prop: StageProp): number {
  const subjects = figures.filter((figure) => !figure.crew && (!figure.role || figure.role === "subject"));
  if (subjects.length >= 6) return 0;
  const { halfX, halfZ } = worldHalf(prop);
  let moved = 0;
  let slot = 0;
  for (const figure of figures) {
    if (figure.crew || figure.role === "background") continue;
    const subject = !figure.role || figure.role === "subject";
    if (subject && figure.aboard) {
      // A lying figure rests on the machine. When the footprint is much wider
      // across the camera than it is long, the middle is hidden, so they rest
      // on the near half of the surface instead of past its edge.
      const wideAcross = halfZ > halfX * 1.35;
      const x = prop.x;
      const z = wideAcross ? prop.z + halfZ * 0.55 : prop.z;
      if (Math.hypot(figure.x - x, figure.z - z) > 0.35) {
        figure.x = x;
        figure.z = z;
        moved++;
      }
      continue;
    }
    if (subject && halfZ > halfX * 1.35) {
      // The footprint is wide across the camera. Standing on its centre line
      // hides a person under it. Step them to the near edge, still alongside the body.
      const edge = prop.z + halfZ + figure.radius + 0.4;
      const along = (slot - 0.5) * (figure.radius * 2.4 + 0.5);
      figure.z = edge;
      figure.x = prop.x + Math.min(halfX * 0.65, Math.max(-halfX * 0.65, along));
      slot++;
      moved++;
      continue;
    }
    if (subject) {
      const flank = halfX + figure.radius + 0.55;
      const onFlank =
        Math.abs(figure.x - prop.x) >= flank - 0.45 &&
        Math.abs(figure.x - prop.x) <= flank + 1.8 &&
        Math.abs(figure.z - prop.z) <= Math.min(halfZ, 1.2) + 0.8;
      if (onFlank) continue;
      const side = Math.abs(figure.x - prop.x) < 0.05 ? (slot % 2 === 0 ? 1 : -1) : Math.sign(figure.x - prop.x);
      const step = Math.floor(slot / 2) * (figure.radius * 2.2 + 0.35);
      figure.x = prop.x + side * (flank + step);
      figure.z = prop.z + Math.min(0.7, Math.max(-0.7, (figure.z - prop.z) * 0.08));
      slot++;
      moved++;
      continue;
    }
    const maxZ = prop.z + halfZ + figure.radius + 1.3;
    const sideX = halfX + figure.radius + 0.45;
    let changed = false;
    if (figure.z > maxZ) {
      figure.z = maxZ;
      changed = true;
    }
    if (Math.abs(figure.x - prop.x) < sideX * 0.85) {
      figure.x = prop.x + Math.sign(figure.x - prop.x || 1) * sideX;
      changed = true;
    }
    if (changed) moved++;
  }
  return moved;
}
