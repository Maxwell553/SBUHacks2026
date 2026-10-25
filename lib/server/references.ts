import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Part } from "@google/genai";

/**
 * Example films the creative model studies as the target look. Every image or
 * short video in references/ is attached as-is; nothing about them is
 * described in code, so changing the look means changing the files.
 */
const DIR = path.join(process.cwd(), "references");
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

let loaded: Promise<Part[]> | undefined;
export function referenceParts(): Promise<Part[]> {
  return (loaded ??= (async () => {
    const files = (await readdir(DIR).catch(() => [])).filter((f) => TYPES[path.extname(f).toLowerCase()]).sort();
    const parts: Part[] = [];
    let used = 0;
    for (const file of files) {
      const data = (await readFile(path.join(DIR, file))).toString("base64");
      if (used + data.length > INLINE_BUDGET) continue;
      used += data.length;
      parts.push({ inlineData: { mimeType: TYPES[path.extname(file).toLowerCase()], data } });
    }
    return parts;
  })());
}

/** The request contents: the reference films, then the supplied data. */
export async function withReferences(data: string) {
  return [{ role: "user", parts: [...(await referenceParts()), { text: data }] }];
}
