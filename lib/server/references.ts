import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Part } from "@google/genai";

/**
 * Example frames the planner, the builders and the director study for look.
 * references/stills/ holds frames from the example films. Each request sends
 * three of them — a street, a waterfront and a park — so the model sees the
 * picture without spending the film budget on ten images. The films themselves
 * stay in references/films/ as the source of those frames; they are not sent
 * inline. What to take from the films is written in FILM_FORMAT.
 */
const LOOK_STILLS = ["atmosphere-street-2s.jpg", "oxygen-waterfront-10s.jpg", "protons-park-4s.jpg"];
const ROOT = path.join(process.cwd(), "references");
export type ReferenceSet = "films" | "stills";
const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};
// Inline request data is capped by the provider; leave room for the rest of the request.
const INLINE_BUDGET = 14 * 1024 * 1024;

const loaded = new Map<ReferenceSet, Promise<Part[]>>();
export function referenceParts(set: ReferenceSet): Promise<Part[]> {
  let parts = loaded.get(set);
  if (!parts) {
    parts = (async () => {
      const dir = path.join(ROOT, set);
      const files = (await readdir(dir).catch(() => []))
        .filter((f) => TYPES[path.extname(f).toLowerCase()])
        .filter((f) => set !== "stills" || LOOK_STILLS.includes(f))
        .sort();
      const out: Part[] = [];
      let used = 0;
      for (const file of files) {
        const data = (await readFile(path.join(dir, file))).toString("base64");
        if (used + data.length > INLINE_BUDGET) continue;
        used += data.length;
        out.push({ inlineData: { mimeType: TYPES[path.extname(file).toLowerCase()], data } });
      }
      return out;
    })();
    loaded.set(set, parts);
  }
  return parts;
}

/** The request contents: the reference set, then the supplied data. `frames` keeps the first frames only. */
export async function withReferences(data: string, set: ReferenceSet = "stills", frames = Number.POSITIVE_INFINITY) {
  const parts = await referenceParts(set);
  return [{ role: "user", parts: [...parts.slice(0, frames), { text: data }] }];
}
