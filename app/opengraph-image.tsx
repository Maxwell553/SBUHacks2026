import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "PolyChronicle — a little curiosity, a window into history";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// next/og’s bundled parser has an unresolved ltag variable. This optional
// language-name table is irrelevant to glyph outlines; omit it only in the
// in-memory preview copy, preserving the original custom fonts on disk.
function previewFont(data: Buffer) {
  const copy = Buffer.from(data);
  for (let i = 0; i < copy.readUInt16BE(4); i++) {
    const offset = 12 + i * 16;
    if (copy.toString("ascii", offset, offset + 4) === "ltag") copy.write("zzzz", offset, "ascii");
  }
  return copy;
}
const fonts = Promise.all([
  readFile(join(process.cwd(), "public/fonts/Facet-Black.otf")),
  readFile(join(process.cwd(), "public/fonts/Tessera-Bold.otf")),
]);

export default async function OpenGraphImage() {
  const [facet, tessera] = await fonts;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: "linear-gradient(135deg, #fbf7ef 0%, #eef0df 55%, #dde7d8 100%)",
        color: "#253b38",
        fontFamily: "Tessera",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="64" height="64" viewBox="0 0 100 100">
          <polygon points="50,8 92,80 50,60" fill="#a64f35" />
          <polygon points="50,8 50,60 8,80" fill="#c99a3c" />
          <polygon points="8,80 50,60 92,80" fill="#246d62" />
        </svg>
        <span style={{ fontFamily: "Facet", fontSize: 40, letterSpacing: 2 }}>POLYCHRONICLE</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ fontSize: 46, color: "#3f5652" }}>A little curiosity.</span>
        <span style={{ fontFamily: "Facet", fontSize: 92, lineHeight: 1, color: "#a64f35" }}>
          A WINDOW INTO HISTORY
        </span>
      </div>
      <span style={{ fontSize: 30, color: "#3f5652" }}>
        Short low-poly history films, researched from public sources — every source listed.
      </span>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Facet", data: previewFont(facet), style: "normal", weight: 900 },
        { name: "Tessera", data: previewFont(tessera), style: "normal", weight: 700 },
      ],
    },
  );
}
