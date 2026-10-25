/**
 * 2D layer drawn over every frame with the PolyChronicle typefaces, in the
 * site's warm educational style: ivory cards with dark readable text, teal
 * and terracotta accents, soft faceted transitions and an end card.
 */
import type { Scene, VideoScript } from "@/lib/schema/video";
import { clamp, easeInOut, easeOut, makeRng } from "@/lib/lowpoly/core";

export const FONT_DISPLAY = "Facet";
export const FONT_TEXT = "Tessera";
export const FONT_MONO = "Tessera Mono";
const CARD = "rgba(251,247,239,0.95)";
const TEXT = "#253b38";
const TEXT2 = "#3f5652";
const TERRA = "#a64f35";
const TERRA_DEEP = "#8a3f2a";
const TEAL = "#246d62";
const PAPER = "#fbf7ef";

export interface OverlayLabel {
  x: number;
  y: number;
  text: string;
  visible: boolean;
}

export interface OverlayState {
  script: VideoScript;
  scene: Scene;
  index: number;
  local: number;
  time: number;
  width: number;
  height: number;
  labels: OverlayLabel[];
  pin?: { x: number; y: number; visible: boolean; label: string };
  flash: number;
  boundaries: number[];
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill = CARD) {
  ctx.save();
  ctx.shadowColor = "rgba(40,30,15,0.22)";
  ctx.shadowBlur = r * 1.2;
  ctx.shadowOffsetY = r * 0.25;
  rounded(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[][] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[][] = [];
  let line: string[] = [];
  for (const w of words) {
    const test = [...line, w].join(" ");
    if (ctx.measureText(test).width > maxW && line.length) {
      lines.push(line);
      line = [w];
    } else line.push(w);
  }
  if (line.length) lines.push(line);
  return lines;
}

function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return cx - x;
}

function spacedWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return w;
}

function logo(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const tri = (pts: number[], color: string) => {
    ctx.beginPath();
    ctx.moveTo(x + pts[0] * s, y + pts[1] * s);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(x + pts[i] * s, y + pts[i + 1] * s);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  tri([0.5, 0.08, 0.92, 0.8, 0.5, 0.6], TERRA);
  tri([0.5, 0.08, 0.5, 0.6, 0.08, 0.8], "#c99a3c");
  tri([0.08, 0.8, 0.5, 0.6, 0.92, 0.8], TEAL);
}

export function drawOverlay(ctx: CanvasRenderingContext2D, st: OverlayState) {
  const { width: W, height: H, script, scene, local } = st;
  const portrait = H > W;
  const u = Math.min(W, H) / 100;
  const pad = u * 4.5;
  ctx.save();
  ctx.textBaseline = "alphabetic";

  // Watermark pill.
  {
    ctx.font = `900 ${u * 2.6}px ${FONT_DISPLAY}`;
    const text = "POLYCHRONICLE";
    const tw = spacedWidth(ctx, text, u * 0.2);
    const h = u * 5.2;
    const w = tw + u * 8.2;
    const x = W - pad - w,
      y = pad;
    ctx.globalAlpha = 0.92;
    card(ctx, x, y, w, h, h / 2);
    logo(ctx, x + u * 1.6, y + u * 1.0, u * 3.2);
    ctx.fillStyle = TEXT;
    spaced(ctx, text, x + u * 5.6, y + h * 0.66, u * 0.2);
    ctx.globalAlpha = 1;
  }

  const immersive = script.presentation === "immersive";
  if (immersive) {
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, "rgba(8,18,27,.6)");
    shade.addColorStop(0.22, "rgba(8,18,27,0)");
    shade.addColorStop(0.65, "rgba(8,18,27,0)");
    shade.addColorStop(1, "rgba(8,18,27,.8)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);
    ctx.font = `400 ${u * 2.6}px ${FONT_MONO}`;
    ctx.fillStyle = "#e0ebe9";
    ctx.fillText(script.dateLabel.toUpperCase(), pad, pad + u * 3);
    let headingSize = u * (portrait ? 6.2 : 4.8);
    const headingText = st.index === 0 ? script.title : scene.kicker;
    ctx.font = `700 ${headingSize}px ${FONT_TEXT}`;
    let heading = wrap(ctx, headingText, W - pad * 2);
    while (heading.length > 2 && headingSize > u * 3.2) {
      headingSize *= 0.9;
      ctx.font = `700 ${headingSize}px ${FONT_TEXT}`;
      heading = wrap(ctx, headingText, W - pad * 2);
    }
    const headlineIn = easeOut(clamp(local / 0.35, 0, 1));
    ctx.globalAlpha = headlineIn;
    heading
      .slice(0, 2)
      .forEach((line, i) =>
        ctx.fillText(line.join(" "), pad, pad + u * (11 + i * (portrait ? 7.2 : 5.8) + (1 - headlineIn) * 1.5)),
      );
    ctx.globalAlpha = 1;
  }

  // Title card (scene 0).
  if (st.index === 0 && !immersive) {
    const a = easeOut(clamp(local / 0.7, 0, 1)) * (1 - clamp((local - (scene.duration - 0.6)) / 0.5, 0, 1));
    if (a > 0.01) {
      const maxW = W * (portrait ? 0.84 : 0.58);
      const long = script.title.length > 26;
      const size = u * (long ? (portrait ? 5.6 : 6) : portrait ? 7.4 : 8.4);
      ctx.font = long ? `700 ${size}px ${FONT_TEXT}` : `900 ${size}px ${FONT_DISPLAY}`;
      const titleLines = wrap(ctx, long ? script.title : script.title.toUpperCase(), maxW - u * 8).map((l) =>
        l.join(" "),
      );
      ctx.font = `400 ${u * 3}px ${FONT_TEXT}`;
      const subLines = script.subtitle ? wrap(ctx, script.subtitle, maxW - u * 8).map((l) => l.join(" ")) : [];
      const h = u * 9 + titleLines.length * size * 1.02 + subLines.length * u * 4.2 + u * 2;
      const slide = (1 - easeOut(clamp(local / 0.8, 0, 1))) * u * 3;
      ctx.globalAlpha = a;
      card(ctx, pad, pad + slide, maxW, h, u * 2.6);
      ctx.font = `400 ${u * 2.3}px ${FONT_MONO}`;
      ctx.fillStyle = TERRA_DEEP;
      spaced(ctx, `${script.dateLabel} · ${script.location}`.toUpperCase(), pad + u * 4, pad + slide + u * 6, u * 0.3);
      ctx.font = long ? `700 ${size}px ${FONT_TEXT}` : `900 ${size}px ${FONT_DISPLAY}`;
      ctx.fillStyle = TEXT;
      let y = pad + slide + u * 7.5 + size * 0.9;
      for (const line of titleLines) {
        ctx.fillText(line, pad + u * 4, y);
        y += size * 1.02;
      }
      y += u * 4.8 - size * 1.02;
      ctx.font = `400 ${u * 3}px ${FONT_TEXT}`;
      ctx.fillStyle = TEXT2;
      for (const line of subLines) {
        ctx.fillText(line, pad + u * 4, y);
        y += u * 4.2;
      }
      ctx.globalAlpha = 1;
    }
  }

  // Faction legend.
  if (!immersive && st.index > 0 && scene.kind === "diorama" && script.factions?.length) {
    const a = easeOut(clamp((local - 0.3) / 0.5, 0, 1)) * 0.95;
    ctx.font = `700 ${u * 2.5}px ${FONT_TEXT}`;
    const w = Math.max(...script.factions.map((f) => ctx.measureText(f.name).width)) + u * 9;
    const h = script.factions.length * u * 4.2 + u * 2.6;
    ctx.globalAlpha = a;
    card(ctx, pad, pad, w, h, u * 2);
    script.factions.forEach((f, i) => {
      const y = pad + u * 1.4 + i * u * 4.2;
      ctx.fillStyle = f.color;
      rounded(ctx, pad + u * 2, y + u * 0.8, u * 2.4, u * 2.4, u * 0.7);
      ctx.fill();
      ctx.fillStyle = TEXT;
      ctx.fillText(f.name, pad + u * 5.6, y + u * 2.9);
    });
    ctx.globalAlpha = 1;
  }

  // Element labels.
  ctx.font = `700 ${u * 2.3}px ${FONT_TEXT}`;
  for (const l of immersive ? [] : st.labels) {
    if (!l.visible) continue;
    const a = easeOut(clamp((local - 0.8) / 0.5, 0, 1)) * (1 - clamp((local - scene.duration + 0.7) / 0.4, 0, 1));
    if (a <= 0.01) continue;
    const tw = ctx.measureText(l.text).width;
    const w = tw + u * 6,
      h = u * 4.4;
    const bx = clamp(l.x - w / 2, pad * 0.6, W - w - pad * 0.6);
    const by = clamp(l.y - u * 10, pad * 2.4, H * 0.6);
    ctx.globalAlpha = a;
    ctx.strokeStyle = "rgba(251,247,239,0.9)";
    ctx.lineWidth = Math.max(1, u * 0.3);
    ctx.beginPath();
    ctx.moveTo(clamp(l.x, bx + h / 2, bx + w - h / 2), by + h);
    ctx.lineTo(l.x, Math.max(by + h, l.y - u * 1.2));
    ctx.stroke();
    card(ctx, bx, by, w, h, h / 2);
    ctx.fillStyle = TEAL;
    ctx.beginPath();
    ctx.arc(bx + u * 2.2, by + h / 2, u * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = TEXT;
    ctx.fillText(l.text, bx + u * 3.8, by + h * 0.66);
    ctx.globalAlpha = 1;
  }

  // Map pin label.
  if (st.pin?.visible) {
    const a = easeOut(clamp((local - scene.duration * 0.55) / 0.5, 0, 1));
    if (a > 0.01) {
      ctx.font = `700 ${u * 3.2}px ${FONT_TEXT}`;
      const tw = ctx.measureText(st.pin.label).width;
      const w = tw + u * 5,
        h = u * 5.6;
      const bx = clamp(st.pin.x + u * 2.5, pad, W - w - pad);
      const by = clamp(st.pin.y - u * 9, pad * 2.2, H - u * 32);
      ctx.globalAlpha = a;
      card(ctx, bx, by, w, h, h / 2, TERRA);
      ctx.fillStyle = PAPER;
      ctx.fillText(st.pin.label, bx + u * 2.5, by + h * 0.68);
      ctx.globalAlpha = 1;
    }
  }

  // Kicker + caption card.
  const capIn = clamp((local - 0.25) / 0.45, 0, 1);
  const capOut = 1 - clamp((local - (scene.duration - 0.35)) / 0.3, 0, 1);
  if (capIn > 0 && capOut > 0) {
    const maxW = W * (immersive ? 0.9 : portrait ? 0.9 : 0.68);
    const size = u * (portrait ? 4.1 : 4.3);
    ctx.font = `700 ${size}px ${FONT_TEXT}`;
    const lines = wrap(ctx, scene.caption, maxW - u * 9);
    const lineH = size * 1.32;
    const boxH = lines.length * lineH + u * 9.5;
    const boxW = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l.join(" ")).width)) + u * 9);
    const bx = pad;
    const by = H - pad - boxH - u * 2.6;
    const rise = (1 - easeOut(capIn)) * u * 2.5;
    ctx.globalAlpha = capOut * easeOut(capIn);
    if (!immersive) card(ctx, bx, by + rise, boxW, boxH, u * 2.6);
    ctx.fillStyle = TEAL;
    rounded(ctx, bx + u * 2.2, by + rise + u * 2.4, u * 0.7, boxH - u * 4.8, u * 0.35);
    ctx.fill();
    ctx.font = `400 ${u * 2.3}px ${FONT_MONO}`;
    ctx.fillStyle = immersive ? "#b8d8d4" : TERRA_DEEP;
    spaced(ctx, scene.kicker.toUpperCase(), bx + u * 4.6, by + rise + u * 5, u * 0.25);
    ctx.font = `700 ${size}px ${FONT_TEXT}`;
    let wi = 0;
    lines.forEach((line, li) => {
      let x = bx + u * 4.6;
      const y = by + rise + u * 7 + (li + 1) * lineH - size * 0.3;
      for (const word of line) {
        const e = easeOut(clamp((local - 0.4 - wi * 0.045) / 0.3, 0, 1));
        ctx.globalAlpha = capOut * e;
        ctx.fillStyle = immersive ? "#ffffff" : TEXT;
        ctx.fillText(word, x, y + (1 - e) * u);
        x += ctx.measureText(word + " ").width;
        wi++;
      }
    });
    ctx.globalAlpha = 1;
  }

  // Progress rail.
  const railH = Math.max(3, u * 0.8);
  const railY = H - railH - u * 1.6;
  let acc = 0;
  for (const sc of script.scenes) {
    const x0 = pad + ((W - pad * 2) * acc) / script.totalDuration;
    const x1 = pad + ((W - pad * 2) * (acc + sc.duration)) / script.totalDuration - u * 0.7;
    ctx.fillStyle = "rgba(251,247,239,0.55)";
    rounded(ctx, x0, railY, x1 - x0, railH, railH / 2);
    ctx.fill();
    const fill = clamp((st.time - acc) / sc.duration, 0, 1);
    if (fill > 0) {
      ctx.fillStyle = TEAL;
      rounded(ctx, x0, railY, Math.max(railH, (x1 - x0) * fill), railH, railH / 2);
      ctx.fill();
    }
    acc += sc.duration;
  }

  if (st.flash > 0) {
    ctx.fillStyle = `rgba(245,248,255,${st.flash * 0.4})`;
    ctx.fillRect(0, 0, W, H);
  }

  drawTransition(ctx, st);
  drawEndCard(ctx, st);
  ctx.restore();
}

/** Soft faceted wipe around scene boundaries (paper, teal and terracotta). */
function drawTransition(ctx: CanvasRenderingContext2D, st: OverlayState) {
  const T = 0.45;
  let cover = 0,
    dir = 1,
    which = 0;
  st.boundaries.forEach((b, i) => {
    const d = st.time - b;
    if (d > -T && d < 0) {
      cover = 1 + d / T;
      dir = 1;
      which = i;
    } else if (d >= 0 && d < T) {
      cover = 1 - d / T;
      dir = -1;
      which = i;
    }
  });
  if (cover <= 0) return;
  const { width: W, height: H } = st;
  const cols = H > W ? 6 : 10;
  const size = W / cols;
  const rows = Math.ceil(H / (size * 0.866)) + 1;
  const rng = makeRng(11 + which);
  const tones = ["#fbf7ef", "#f3ecdf", "#ebe2d1", "#f3ecdf", "#fbf7ef", "#dfe8dc", "#f5e2d9"];
  for (let r = 0; r < rows; r++) {
    for (let c = -1; c <= cols; c++) {
      for (let k = 0; k < 2; k++) {
        const x = c * size + (r % 2 ? size / 2 : 0);
        const y = r * size * 0.866;
        const pts =
          k === 0
            ? [x, y, x + size, y, x + size / 2, y + size * 0.866]
            : [x + size, y, x + size * 1.5, y + size * 0.866, x + size / 2, y + size * 0.866];
        const cx = (pts[0] + pts[2] + pts[4]) / 3,
          cy = (pts[1] + pts[3] + pts[5]) / 3;
        const order = (cx / W) * 0.6 + (cy / H) * 0.4;
        const delay = (dir > 0 ? order : 1 - order) * 0.45;
        const s = easeInOut(clamp((cover - delay) / 0.55, 0, 1));
        if (s <= 0.001) continue;
        ctx.beginPath();
        ctx.moveTo(cx + (pts[0] - cx) * s * 1.02, cy + (pts[1] - cy) * s * 1.02);
        ctx.lineTo(cx + (pts[2] - cx) * s * 1.02, cy + (pts[3] - cy) * s * 1.02);
        ctx.lineTo(cx + (pts[4] - cx) * s * 1.02, cy + (pts[5] - cy) * s * 1.02);
        ctx.closePath();
        ctx.fillStyle = tones[Math.floor(rng() * tones.length)];
        ctx.fill();
      }
    }
  }
}

function drawEndCard(ctx: CanvasRenderingContext2D, st: OverlayState) {
  const { width: W, height: H, script } = st;
  const start = script.totalDuration - 1.8;
  const k = clamp((st.time - start) / 0.5, 0, 1);
  if (k <= 0) return;
  const u = Math.min(W, H) / 100;
  ctx.globalAlpha = easeInOut(k) * 0.96;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = easeInOut(clamp((st.time - start - 0.2) / 0.5, 0, 1));
  const size = u * (H > W ? 6.5 : 8);
  ctx.font = `900 ${size}px ${FONT_DISPLAY}`;
  const tw = ctx.measureText("POLYCHRONICLE").width;
  logo(ctx, W / 2 - u * 4.5, H / 2 - size * 1.7, u * 9);
  ctx.fillStyle = TEXT;
  ctx.fillText("POLYCHRONICLE", W / 2 - tw / 2, H / 2 + size * 0.3);
  ctx.font = `700 ${u * 3.4}px ${FONT_TEXT}`;
  ctx.fillStyle = TERRA_DEEP;
  ctx.fillText(script.title, W / 2 - ctx.measureText(script.title).width / 2, H / 2 + size * 0.3 + u * 6);
  ctx.globalAlpha = 1;
}

let fontsReady: Promise<void> | null = null;

/** Loads the custom faces for canvas use (idempotent). */
export function loadFonts(base = "/fonts"): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (fontsReady) return fontsReady;
  const faces: [string, string, string][] = [
    [FONT_DISPLAY, `${base}/Facet-Black.otf`, "900"],
    [FONT_TEXT, `${base}/Tessera-Regular.otf`, "400"],
    [FONT_TEXT, `${base}/Tessera-Bold.otf`, "700"],
    [FONT_MONO, `${base}/TesseraMono-Regular.otf`, "400"],
  ];
  fontsReady = Promise.all(
    faces.map(async ([family, url, weight]) => {
      const face = new FontFace(family, `url(${url})`, { weight });
      await face.load();
      document.fonts.add(face);
    }),
  ).then(() => undefined);
  return fontsReady;
}
