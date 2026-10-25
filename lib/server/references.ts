import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Part } from "@google/genai";

/**
 * Example films the creative model studies as the target. references/films/
 * holds whole short films (format, pacing, captions and look) for the
 * director; references/stills/ holds frames from them (the look alone) for the
 * planner and the geometry builders, which run many times per film.
 */
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
      const files = (await readdir(dir).catch(() => [])).filter((f) => TYPES[path.extname(f).toLowerCase()]).sort();
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

/** The request contents: the reference set, then the supplied data. */
export async function withReferences(data: string, set: ReferenceSet = "stills") {
  return [{ role: "user", parts: [...(await referenceParts(set)), { text: data }] }];
}
