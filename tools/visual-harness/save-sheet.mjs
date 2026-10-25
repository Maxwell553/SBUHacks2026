// Saves the contact sheet from a saved CDP Runtime.evaluate response (or any
// text file containing a JPEG/PNG data URL) as an image file.
//   node tools/visual-harness/save-sheet.mjs <response.json> <out.jpg>
import { readFileSync, writeFileSync } from "node:fs";

const [src, out] = process.argv.slice(2);
const match = readFileSync(src, "utf8").match(/data:image\/(?:jpeg|png);base64,([A-Za-z0-9+/=]+)/);
if (!match) throw new Error(`No image data URL in ${src}`);
writeFileSync(out, Buffer.from(match[1], "base64"));
console.log("Wrote", out);
