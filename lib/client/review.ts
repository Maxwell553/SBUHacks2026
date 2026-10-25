"use client";
import { videos, type Video } from "@/lib/client/api";
import { REVIEW_ROUNDS, shotIssues, type ShotIssue, type ShotSnapshot } from "@/lib/lowpoly/shot-audit";
import type { Aspect, VideoScript } from "@/lib/schema/video";

export interface ReviewProgress {
  round: number;
  rounds: number;
  stage: "rendering" | "reviewing" | "done";
  /** Measured problems in the draft being reviewed. */
  issues?: number;
  shotsChanged?: number;
  modelsRepaired?: number;
}

/** Contact-sheet frames per shot, and the moments each shot is measured at. */
const FRAMES = [0.25, 0.75];
const MEASURE = [0.08, 0.3, 0.5, 0.7, 0.92];

/**
 * Renders a labelled draft contact sheet of the script (two frames per shot)
 * and measures every shot with the engine's shot audit.
 */
export async function draftSheet(
  script: VideoScript,
  aspect: Aspect,
  signal?: AbortSignal,
): Promise<{ sheet: string; issues: ShotIssue[] }> {
  const { PolyEngine } = await import("@/lib/lowpoly/engine");
  await PolyEngine.loadFonts();
  const portrait = aspect === "portrait";
  const [w, h] = portrait ? [270, 480] : [480, 270];
  const engine = new PolyEngine(script, { width: w, height: h, pixelRatio: 1 });
  const cols = portrait ? 8 : 4;
  const tiles = script.scenes.length * FRAMES.length;
  const sheet = document.createElement("canvas");
  sheet.width = cols * w;
  sheet.height = Math.ceil(tiles / cols) * h;
  const ctx = sheet.getContext("2d")!;
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  const snapshots: ShotSnapshot[] = [];
  try {
    let start = 0,
      tile = 0;
    for (const [i, sc] of script.scenes.entries()) {
      signal?.throwIfAborted();
      for (const at of [...new Set([...FRAMES, ...MEASURE])].sort((a, b) => a - b)) {
        const t = Math.min(start + sc.duration * at, script.totalDuration - 0.01);
        if (FRAMES.includes(at)) {
          engine.renderAt(t);
          const x = (tile % cols) * w,
            y = Math.floor(tile / cols) * h;
          ctx.drawImage(engine.canvas, x, y, w, h);
          ctx.fillStyle = "rgba(0,0,0,0.72)";
          ctx.fillRect(x, y, 108, 22);
          ctx.fillStyle = "#fff";
          ctx.font = "bold 14px sans-serif";
          ctx.fillText(`shot ${i} · ${Math.round(at * 100)}%`, x + 6, y + 16);
          tile++;
        }
        if (MEASURE.includes(at)) {
          const snap = engine.inspect(t);
          if (snap) snapshots.push(snap);
        }
      }
      start += sc.duration;
      // Let the page breathe between shots.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    engine.dispose();
  }
  return { sheet: sheet.toDataURL("image/jpeg", 0.75), issues: shotIssues(snapshots) };
}

/**
 * Reviews the film as it is being made: renders a draft, has the server
 * review it (shot fixes and model repairs), and repeats once if anything
 * changed. Review problems never stop the film; it renders as it stands.
 */
export async function reviewRender(
  video: Video,
  onProgress?: (p: ReviewProgress) => void,
  signal?: AbortSignal,
): Promise<Video> {
  let current = video;
  const aspect: Aspect = video.aspect === "portrait" ? "portrait" : "landscape";
  for (let round = 1; round <= REVIEW_ROUNDS; round++) {
    if (!current.script) break;
    onProgress?.({ round, rounds: REVIEW_ROUNDS, stage: "rendering" });
    let result, issues: ShotIssue[];
    try {
      const draft = await draftSheet(current.script, aspect, signal);
      issues = draft.issues;
      onProgress?.({ round, rounds: REVIEW_ROUNDS, stage: "reviewing", issues: issues.length });
      result = await videos.review(current.id, { round, sheet: draft.sheet, issues }, signal);
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      break;
    }
    current = { ...current, ...result.video };
    const { verdict, shotsChanged, modelsRepaired } = result.review;
    onProgress?.({
      round,
      rounds: REVIEW_ROUNDS,
      stage: "done",
      issues: issues.length,
      shotsChanged,
      modelsRepaired: modelsRepaired.length,
    });
    if (verdict === "pass" || (!shotsChanged && !modelsRepaired.length)) break;
  }
  return current;
}
