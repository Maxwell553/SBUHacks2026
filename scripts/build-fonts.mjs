// Generates Polyhistor's original typefaces from hand-designed glyph skeletons.
//
//   Facet        — heavy, chamfered all-caps display face
//   Tessera      — octagonal monoline text face (Regular + Bold)
//   Tessera Mono — fixed-pitch cut of Tessera for data and labels
//
// Each glyph is a set of centre-line polylines. Polylines are faceted at
// flagged corners (chamfers / octagonal arcs), stroked into polygons, unioned
// and written as CFF outlines. Output: public/fonts/*.otf plus glyph polygon
// data used to extrude the 3D hero lettering.
//
// Usage: npm run fonts
import { mkdirSync, writeFileSync } from "node:fs";
import opentype from "opentype.js";
import pc from "polygon-clipping";

const R = 1;
const o = (...pts) => ({ pts, closed: false });
const c = (...pts) => ({ pts, closed: true });

// ---------------------------------------------------------------- styles
const STYLES = [
  {
    file: "Facet-Black.otf",
    family: "Facet",
    style: "Black",
    weight: 900,
    W: 150,
    cap: 720,
    xh: 720,
    asc: 760,
    desc: -220,
    r: 118,
    k: 1,
    sb: 44,
    widthScale: 1.16,
    caps: "square",
    bandClip: true,
    allCaps: true,
    space: 300,
    exportGlyphs: true,
  },
  {
    file: "Tessera-Regular.otf",
    family: "Tessera",
    style: "Regular",
    weight: 400,
    W: 74,
    cap: 720,
    xh: 520,
    asc: 770,
    desc: -220,
    r: 230,
    k: 2,
    sb: 54,
    widthScale: 1,
    caps: "octagon",
    space: 260,
  },
  {
    file: "Tessera-Bold.otf",
    family: "Tessera",
    style: "Bold",
    weight: 700,
    W: 116,
    cap: 720,
    xh: 530,
    asc: 770,
    desc: -220,
    r: 230,
    k: 2,
    sb: 46,
    widthScale: 1.04,
    caps: "octagon",
    space: 270,
  },
  {
    file: "TesseraMono-Regular.otf",
    family: "Tessera Mono",
    style: "Regular",
    weight: 400,
    W: 72,
    cap: 700,
    xh: 520,
    asc: 760,
    desc: -220,
    r: 200,
    k: 2,
    sb: 40,
    widthScale: 1,
    caps: "octagon",
    mono: 600,
    space: 600,
  },
];

// ---------------------------------------------------------------- glyphs
// Each entry: (m) => { w, p: paths[], dots?: [x,y][], noClip?: bool }
// m = { B baseline, X x-height, C cap, A ascender, D descender (all skeleton
// centre-lines), H = C-B, XH = X-B, W stroke weight, rd dot radius }
const G = {};

// Uppercase -------------------------------------------------------------
G.A = ({ B, C, H }) => {
  const w = 500,
    h = B + 0.3 * H,
    xl = ((h - B) / H) * (w / 2);
  return { w, p: [o([0, B], [w / 2, C], [w, B]), o([xl, h], [w - xl, h])] };
};
G.B = ({ B, C, H }) => {
  const w = 400,
    mu = B + 0.54 * H;
  return {
    w,
    p: [
      o([0, B], [0, C]),
      o([0, C], [w * 0.86, C, R], [w * 0.86, mu, R], [0, mu]),
      o([0, mu], [w, mu, R], [w, B, R], [0, B]),
    ],
  };
};
G.C = ({ B, C }) => ({ w: 440, p: [o([440, C], [0, C, R], [0, B, R], [440, B])] });
G.D = ({ B, C }) => ({ w: 450, p: [c([0, B], [0, C], [450, C, R], [450, B, R])] });
G.E = ({ B, C, H }) => {
  const w = 370,
    m = B + 0.5 * H;
  return { w, p: [o([w, C], [0, C], [0, B], [w, B]), o([0, m], [w * 0.84, m])] };
};
G.F = ({ B, C, H }) => {
  const w = 350,
    m = B + 0.48 * H;
  return { w, p: [o([w, C], [0, C], [0, B]), o([0, m], [w * 0.84, m])] };
};
G.G = ({ B, C, H }) => {
  const w = 460,
    m = B + 0.48 * H;
  return { w, p: [o([w, C], [0, C, R], [0, B, R], [w, B, R], [w, m], [w * 0.5, m])] };
};
G.H = ({ B, C, H }) => {
  const w = 430,
    m = B + 0.5 * H;
  return { w, p: [o([0, B], [0, C]), o([w, B], [w, C]), o([0, m], [w, m])] };
};
G.I = ({ B, C }) => ({ w: 0, p: [o([0, B], [0, C])] });
G.J = ({ B, C, H }) => ({ w: 330, p: [o([330, C], [330, B, R], [0, B, R], [0, B + 0.3 * H])] });
G.K = ({ B, C, H }) => {
  const w = 430,
    j = B + 0.38 * H,
    t = 0.36,
    jx = w * t,
    jy = j + t * (C - j);
  return { w, p: [o([0, B], [0, C]), o([w, C], [0, j]), o([jx, jy], [w, B])] };
};
G.L = ({ B, C }) => ({ w: 350, p: [o([0, C], [0, B], [350, B])] });
G.M = ({ B, C, H }) => {
  const w = 560;
  return { w, p: [o([0, B], [0, C], [w / 2, B + 0.28 * H], [w, C], [w, B])] };
};
G.N = ({ B, C }) => ({ w: 450, p: [o([0, B], [0, C], [450, B], [450, C])] });
G.O = ({ B, C }) => ({ w: 520, p: [c([0, B, R], [0, C, R], [520, C, R], [520, B, R])] });
G.P = ({ B, C, H }) => {
  const w = 410,
    mp = B + 0.46 * H;
  return { w, p: [o([0, B], [0, C], [w, C, R], [w, mp, R], [0, mp])] };
};
G.Q = (m) => {
  const base = G.O(m);
  const { B, H, W } = m;
  return { ...base, noClip: true, p: [...base.p, o([base.w * 0.6, B + 0.3 * H], [base.w + W * 0.15, B - W * 0.35])] };
};
G.R = (m) => {
  const base = G.P(m);
  const mp = m.B + 0.46 * m.H;
  return { ...base, p: [...base.p, o([base.w * 0.42, mp], [base.w, m.B])] };
};
G.S = ({ B, C, H }) => {
  const w = 430,
    ms = B + 0.53 * H;
  return { w, p: [o([w, C], [0, C, R], [0, ms, R], [w, ms, R], [w, B, R], [0, B])] };
};
G.T = ({ B, C }) => ({ w: 460, p: [o([0, C], [460, C]), o([230, C], [230, B])] });
G.U = ({ B, C }) => ({ w: 440, p: [o([0, C], [0, B, R], [440, B, R], [440, C])] });
G.V = ({ B, C }) => ({ w: 500, p: [o([0, C], [250, B], [500, C])] });
G.W = ({ B, C }) => ({ w: 720, p: [o([0, C], [180, B], [360, C], [540, B], [720, C])] });
G.X = ({ B, C }) => ({ w: 470, p: [o([0, C], [470, B]), o([470, C], [0, B])] });
G.Y = ({ B, C, H }) => {
  const w = 500,
    my = B + 0.42 * H;
  return { w, p: [o([0, C], [w / 2, my], [w, C]), o([w / 2, my], [w / 2, B])] };
};
G.Z = ({ B, C }) => ({ w: 430, p: [o([0, C], [430, C], [0, B], [430, B])] });

// Lowercase -------------------------------------------------------------
const bowl = (B, X, w) => c([0, B, R], [0, X, R], [w, X, R], [w, B, R]);
G.a = ({ B, X }) => ({ w: 380, p: [bowl(B, X, 380), o([380, X], [380, B])] });
G.b = ({ B, X, A }) => ({ w: 390, p: [o([0, A], [0, B]), bowl(B, X, 390)] });
G.c = ({ B, X }) => ({ w: 350, p: [o([350, X], [0, X, R], [0, B, R], [350, B])] });
G.d = ({ B, X, A }) => ({ w: 390, p: [o([390, A], [390, B]), bowl(B, X, 390)] });
G.e = ({ B, X, XH }) => {
  const w = 380,
    me = B + 0.48 * XH;
  return { w, p: [o([0, me], [w, me], [w, X, R], [0, X, R], [0, B, R], [w, B])] };
};
G.f = ({ B, X, A }) => {
  const w = 250,
    s = w * 0.36;
  return { w, p: [o([w, A], [s, A, R], [s, B]), o([0, X], [w * 0.92, X])] };
};
G.g = ({ B, X, D }) => ({ w: 390, p: [bowl(B, X, 390), o([390, X], [390, D, R], [20, D])] });
G.h = ({ B, X, A }) => ({ w: 370, p: [o([0, A], [0, B]), o([0, X], [370, X, R], [370, B])] });
G.i = ({ B, X, dotY }) => ({ w: 0, p: [o([0, X], [0, B])], dots: [[0, dotY]] });
G["ı"] = ({ B, X }) => ({ w: 0, p: [o([0, X], [0, B])] });
G.j = ({ X, D, dotY }) => ({ w: 0, p: [o([0, X], [0, D, R], [-150, D])], dots: [[0, dotY]] });
G["ȷ"] = ({ X, D }) => ({ w: 0, p: [o([0, X], [0, D, R], [-150, D])] });
G.k = ({ B, X, A, XH }) => {
  const w = 370,
    j = B + 0.36 * XH,
    t = 0.4,
    jx = w * t,
    jy = j + t * (X - j);
  return { w, p: [o([0, A], [0, B]), o([w, X], [0, j]), o([jx, jy], [w, B])] };
};
G.l = ({ B, A }) => ({ w: 110, p: [o([0, A], [0, B, R], [110, B])] });
G.m = ({ B, X }) => {
  const w = 580;
  return { w, p: [o([0, X], [0, B]), o([0, X], [w / 2, X, R], [w / 2, B]), o([w / 2, X], [w, X, R], [w, B])] };
};
G.n = ({ B, X }) => ({ w: 370, p: [o([0, X], [0, B]), o([0, X], [370, X, R], [370, B])] });
G.o = ({ B, X }) => ({ w: 390, p: [bowl(B, X, 390)] });
G.p = ({ B, X, D }) => ({ w: 390, p: [o([0, X], [0, D]), bowl(B, X, 390)] });
G.q = ({ B, X, D }) => ({ w: 390, p: [o([390, X], [390, D]), bowl(B, X, 390)] });
G.r = ({ B, X, XH }) => ({ w: 250, p: [o([0, X], [0, B]), o([0, X], [250, X, R], [250, X - 0.24 * XH])] });
G.s = ({ B, X, XH }) => {
  const w = 340,
    ms = B + 0.52 * XH;
  return { w, p: [o([w, X], [0, X, R], [0, ms, R], [w, ms, R], [w, B, R], [0, B])] };
};
G.t = ({ B, X, A }) => {
  const w = 250,
    s = w * 0.36;
  return { w, p: [o([s, A - 0.12 * (A - X)], [s, B, R], [w, B]), o([0, X], [w * 0.92, X])] };
};
G.u = ({ B, X }) => ({ w: 370, p: [o([0, X], [0, B, R], [370, B]), o([370, X], [370, B])] });
G.v = ({ B, X }) => ({ w: 400, p: [o([0, X], [200, B], [400, X])] });
G.w = ({ B, X }) => ({ w: 620, p: [o([0, X], [155, B], [310, X], [465, B], [620, X])] });
G.x = ({ B, X }) => ({ w: 380, p: [o([0, X], [380, B]), o([380, X], [0, B])] });
G.y = ({ B, X, D }) => {
  const w = 400,
    x2 = w * 0.12,
    t = (X - B) / (X - D),
    xb = w + (x2 - w) * t;
  return { w, p: [o([w, X], [x2, D]), o([0, X], [xb, B])] };
};
G.z = ({ B, X }) => ({ w: 340, p: [o([0, X], [340, X], [0, B], [340, B])] });
G["ß"] = ({ B, A }) => {
  const w = 370,
    mu = B + 0.62 * (A - B);
  return {
    w,
    p: [
      o([0, B], [0, A, R], [w * 0.82, A, R], [w * 0.82, mu, R], [w * 0.3, mu]),
      o([w * 0.3, mu], [w, mu, R], [w, B, R], [w * 0.35, B]),
    ],
  };
};

// Digits (tabular) --------------------------------------------------------
const DW = 390;
G["0"] = ({ B, C }) => ({ w: DW, p: [c([0, B, R], [0, C, R], [DW, C, R], [DW, B, R])] });
G["1"] = ({ B, C, H }) => ({
  w: DW,
  p: [o([DW * 0.14, C - 0.22 * H], [DW * 0.56, C], [DW * 0.56, B]), o([DW * 0.14, B], [DW * 0.98, B])],
});
G["2"] = ({ B, C, H }) => {
  const m = B + 0.5 * H;
  return { w: DW, p: [o([0, C], [DW, C, R], [DW, m, R], [0, m, R], [0, B], [DW, B])] };
};
G["3"] = ({ B, C, H }) => {
  const m = B + 0.52 * H;
  return { w: DW, p: [o([0, C], [DW, C, R], [DW, B, R], [0, B]), o([DW * 0.3, m], [DW, m])] };
};
G["4"] = ({ B, C, H }) => {
  const m = B + 0.34 * H;
  return { w: DW, p: [o([DW * 0.74, B], [DW * 0.74, C], [0, m], [DW, m])] };
};
G["5"] = ({ B, C, H }) => {
  const m = B + 0.56 * H;
  return { w: DW, p: [o([DW, C], [DW * 0.04, C], [0, m], [DW, m, R], [DW, B, R], [0, B])] };
};
G["6"] = ({ B, C, H }) => {
  const m = B + 0.56 * H;
  return { w: DW, p: [o([DW * 0.9, C], [0, C, R], [0, B, R], [DW, B, R], [DW, m, R], [0, m])] };
};
G["7"] = ({ B, C }) => ({ w: DW, p: [o([0, C], [DW, C], [DW * 0.3, B])] });
G["8"] = ({ B, C, H }) => {
  const m = B + 0.54 * H;
  return {
    w: DW,
    p: [
      c([DW * 0.07, m], [DW * 0.07, C, R], [DW * 0.93, C, R], [DW * 0.93, m]),
      c([0, m], [DW, m], [DW, B, R], [0, B, R]),
    ],
  };
};
G["9"] = ({ B, C, H }) => {
  const m = B + 0.44 * H;
  return { w: DW, p: [o([DW * 0.1, B], [DW, B, R], [DW, C, R], [0, C, R], [0, m, R], [DW, m])] };
};

// Punctuation & symbols ---------------------------------------------------
const mid = ({ B, X }) => (B + X) / 2;
G["."] = ({ rd }) => ({ w: 0, dots: [[0, rd]], noClip: true });
G[","] = ({ rd, W }) => ({ w: 0, p: [o([0, rd], [-W * 0.55, -W * 1.45])], dots: [[0, rd]], noClip: true });
G[":"] = ({ rd, X, W }) => ({
  w: 0,
  dots: [
    [0, rd],
    [0, X + W / 2 - rd],
  ],
  noClip: true,
});
G[";"] = ({ rd, X, W }) => ({
  w: 0,
  p: [o([0, rd], [-W * 0.55, -W * 1.45])],
  dots: [
    [0, rd],
    [0, X + W / 2 - rd],
  ],
  noClip: true,
});
G["!"] = ({ B, C, H, rd }) => ({ w: 0, p: [o([0, C], [0, B + 0.34 * H])], dots: [[0, rd]], noClip: true });
G["?"] = ({ B, C, H, rd }) => {
  const w = 330,
    mq = B + 0.58 * H;
  return {
    w,
    p: [o([0, C - 0.18 * H], [0, C, R], [w, C, R], [w, mq, R], [w / 2, mq, R], [w / 2, B + 0.34 * H])],
    dots: [[w / 2, rd]],
    noClip: true,
  };
};
G["'"] = ({ C, H }) => ({ w: 0, p: [o([0, C], [0, C - 0.26 * H])], noClip: true });
G['"'] = ({ C, H }) => ({ w: 150, p: [o([0, C], [0, C - 0.26 * H]), o([150, C], [150, C - 0.26 * H])], noClip: true });
G["’"] = ({ C, rd, W }) => ({
  w: 0,
  p: [o([0, C - rd], [-W * 0.55, C - rd - W * 1.45])],
  dots: [[0, C + W / 2 - rd]],
  noClip: true,
});
G["‘"] = ({ C, W }) => ({
  w: 0,
  p: [o([0, C - W * 0.9], [W * 0.55, C + W * 0.4])],
  dots: [[0, C - W * 0.9]],
  noClip: true,
});
G["”"] = (m) => {
  const a = G["’"](m);
  const dx = m.W * 1.9;
  return {
    w: dx,
    p: [...a.p, ...a.p.map((p) => o(...p.pts.map(([x, y]) => [x + dx, y])))],
    dots: [...a.dots, ...a.dots.map(([x, y]) => [x + dx, y])],
    noClip: true,
  };
};
G["“"] = (m) => {
  const a = G["‘"](m);
  const dx = m.W * 1.9;
  return {
    w: dx,
    p: [...a.p, ...a.p.map((p) => o(...p.pts.map(([x, y]) => [x + dx, y])))],
    dots: [...a.dots, ...a.dots.map(([x, y]) => [x + dx, y])],
    noClip: true,
  };
};
G["-"] = (m) => ({ w: 230, p: [o([0, mid(m)], [230, mid(m)])], noClip: true });
G["–"] = (m) => ({ w: 460, p: [o([0, mid(m)], [460, mid(m)])], noClip: true });
G["—"] = (m) => ({ w: 820, p: [o([0, mid(m)], [820, mid(m)])], noClip: true });
G["_"] = ({ D }) => ({ w: 460, p: [o([0, D * 0.5], [460, D * 0.5])], noClip: true });
G["("] = ({ A, D }) => {
  const w = 130,
    h = A - D;
  return { w, p: [o([w, A], [0, A - 0.22 * h, R], [0, D + 0.22 * h, R], [w, D])], noClip: true };
};
G[")"] = ({ A, D }) => {
  const w = 130,
    h = A - D;
  return { w, p: [o([0, A], [w, A - 0.22 * h, R], [w, D + 0.22 * h, R], [0, D])], noClip: true };
};
G["["] = ({ A, D }) => ({ w: 150, p: [o([150, A], [0, A], [0, D], [150, D])], noClip: true });
G["]"] = ({ A, D }) => ({ w: 150, p: [o([0, A], [150, A], [150, D], [0, D])], noClip: true });
G["{"] = ({ A, D }) => {
  const w = 210,
    m = (A + D) / 2;
  return {
    w,
    p: [o([w, A], [w / 2, A, R], [w / 2, m + 70], [0, m], [w / 2, m - 70], [w / 2, D, R], [w, D])],
    noClip: true,
  };
};
G["}"] = ({ A, D }) => {
  const w = 210,
    m = (A + D) / 2;
  return {
    w,
    p: [o([0, A], [w / 2, A, R], [w / 2, m + 70], [w, m], [w / 2, m - 70], [w / 2, D, R], [0, D])],
    noClip: true,
  };
};
G["/"] = ({ A, D }) => ({ w: 320, p: [o([0, D], [320, A])], noClip: true });
G["\\"] = ({ A, D }) => ({ w: 320, p: [o([0, A], [320, D])], noClip: true });
G["|"] = ({ A, D }) => ({ w: 0, p: [o([0, A], [0, D])], noClip: true });
G["@"] = ({ B, C, H }) => {
  const w = 620,
    lo = B + 0.2 * H,
    hi = B + 0.64 * H;
  return {
    w,
    p: [
      c([w * 0.3, lo, R], [w * 0.3, hi, R], [w * 0.68, hi, R], [w * 0.68, lo, R]),
      o([w * 0.68, hi], [w * 0.68, lo, R], [w, lo, R], [w, C, R], [0, C, R], [0, B, R], [w * 0.86, B]),
    ],
    noClip: true,
  };
};
G["#"] = ({ B, C, H }) => {
  const w = 480;
  return {
    w,
    p: [
      o([w * 0.34, C], [w * 0.24, B]),
      o([w * 0.8, C], [w * 0.7, B]),
      o([0, B + 0.66 * H], [w, B + 0.66 * H]),
      o([0, B + 0.32 * H], [w, B + 0.32 * H]),
    ],
  };
};
G["$"] = (m) => {
  const s = G.S(m);
  return { ...s, noClip: true, p: [...s.p, o([s.w / 2, m.C + m.W * 0.9], [s.w / 2, m.B - m.W * 0.9])] };
};
G["%"] = ({ B, C, H }) => {
  const w = 560,
    b = 0.3 * H;
  return {
    w,
    p: [
      c([0, C - b, R], [0, C, R], [w * 0.3, C, R], [w * 0.3, C - b, R]),
      c([w * 0.7, B, R], [w * 0.7, B + b, R], [w, B + b, R], [w, B, R]),
      o([w * 0.05, B], [w * 0.95, C]),
    ],
  };
};
G["&"] = ({ B, C, H }) => {
  const w = 500,
    mt = B + 0.58 * H;
  return {
    w,
    p: [
      o(
        [w, B],
        [w * 0.12, mt, R],
        [w * 0.12, C, R],
        [w * 0.62, C, R],
        [w * 0.62, mt, R],
        [0, B + 0.3 * H, R],
        [0, B, R],
        [w * 0.6, B, R],
        [w, B + 0.36 * H],
      ),
    ],
  };
};
G["*"] = ({ C, H }) => {
  const w = 320,
    cx = w / 2,
    cy = C - 0.2 * H,
    r = 0.2 * H;
  const ray = (a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  const rayB = (a) => [cx - Math.cos(a) * r, cy - Math.sin(a) * r];
  const a1 = Math.PI / 2,
    a2 = Math.PI / 6,
    a3 = (5 * Math.PI) / 6;
  return { w, p: [o(ray(a1), rayB(a1)), o(ray(a2), rayB(a2)), o(ray(a3), rayB(a3))], noClip: true };
};
G["+"] = (m) => {
  const w = 400,
    y = mid(m);
  return { w, p: [o([w / 2, y - w / 2 + 20], [w / 2, y + w / 2 - 20]), o([0, y], [w, y])], noClip: true };
};
G["="] = (m) => {
  const w = 400,
    y = mid(m),
    d = m.W * 0.5 + 50;
  return { w, p: [o([0, y + d], [w, y + d]), o([0, y - d], [w, y - d])], noClip: true };
};
G["<"] = (m) => {
  const w = 330,
    y = mid(m);
  return { w, p: [o([w, y + w * 0.62], [0, y], [w, y - w * 0.62])], noClip: true };
};
G[">"] = (m) => {
  const w = 330,
    y = mid(m);
  return { w, p: [o([0, y + w * 0.62], [w, y], [0, y - w * 0.62])], noClip: true };
};
G["^"] = ({ C, H }) => ({ w: 330, p: [o([0, C - 0.36 * H], [165, C], [330, C - 0.36 * H])], noClip: true });
G["~"] = (m) => {
  const y = mid(m),
    d = 55;
  return { w: 420, p: [o([0, y - d], [140, y + d], [280, y - d], [420, y + d])], noClip: true };
};
G["`"] = ({ C, H }) => ({ w: 110, p: [o([0, C], [110, C - 0.16 * H])], noClip: true });
G["©"] = ({ B, C, H }) => {
  const w = 680,
    i = 0.28 * H;
  return {
    w,
    p: [
      c([0, B, R], [0, C, R], [w, C, R], [w, B, R]),
      o([w * 0.66, C - i], [w * 0.3, C - i, R], [w * 0.3, B + i, R], [w * 0.66, B + i]),
    ],
    noClip: true,
  };
};
G["•"] = (m) => ({ w: 0, dots: [[0, mid(m)]], bigDots: true, noClip: true });
G["·"] = (m) => ({ w: 0, dots: [[0, mid(m)]], noClip: true });
G["…"] = ({ rd }) => ({
  w: 380,
  dots: [
    [0, rd],
    [190, rd],
    [380, rd],
  ],
  noClip: true,
});
G["°"] = ({ C }) => ({ w: 170, p: [c([0, C - 170, R], [0, C, R], [170, C, R], [170, C - 170, R])], noClip: true });
G["→"] = (m) => {
  const w = 580,
    y = mid(m),
    h = 0.36 * (m.C - m.B);
  return { w, p: [o([0, y], [w, y]), o([w - h, y + h], [w, y], [w - h, y - h])], noClip: true };
};
G["←"] = (m) => {
  const w = 580,
    y = mid(m),
    h = 0.36 * (m.C - m.B);
  return { w, p: [o([w, y], [0, y]), o([h, y + h], [0, y], [h, y - h])], noClip: true };
};
G["↗"] = ({ B, C, H }) => {
  const w = 460,
    a = 0.5 * H;
  return { w, p: [o([0, B], [w, C]), o([w - a, C], [w, C], [w, C - a])], noClip: true };
};
G["↓"] = ({ B, C, H }) => {
  const w = 420,
    a = 0.4 * H;
  return { w, p: [o([w / 2, C], [w / 2, B]), o([w / 2 - a, B + a], [w / 2, B], [w / 2 + a, B + a])], noClip: true };
};
G["×"] = (m) => {
  const w = 320,
    y = mid(m),
    h = w / 2;
  return { w, p: [o([0, y + h], [w, y - h]), o([0, y - h], [w, y + h])], noClip: true };
};
G["✓"] = ({ B, X, XH }) => ({ w: 440, p: [o([0, B + 0.5 * XH], [150, B], [440, X + 0.3 * XH])], noClip: true });

// Accented composites -------------------------------------------------------
const ACCENTS = {
  acute: (cx, yb, ah) => ({ p: [o([cx - 45, yb], [cx + 60, yb + ah])] }),
  grave: (cx, yb, ah) => ({ p: [o([cx + 45, yb], [cx - 60, yb + ah])] }),
  circ: (cx, yb, ah) => ({ p: [o([cx - 105, yb], [cx, yb + ah * 0.9], [cx + 105, yb])] }),
  caron: (cx, yb, ah) => ({ p: [o([cx - 105, yb + ah * 0.9], [cx, yb], [cx + 105, yb + ah * 0.9])] }),
  tilde: (cx, yb, ah) => ({
    p: [o([cx - 125, yb], [cx - 42, yb + ah * 0.65], [cx + 42, yb], [cx + 125, yb + ah * 0.65])],
  }),
  macron: (cx, yb) => ({ p: [o([cx - 115, yb + 30], [cx + 115, yb + 30])] }),
  breve: (cx, yb, ah) => ({
    p: [o([cx - 100, yb + ah * 0.8], [cx - 100, yb, R], [cx + 100, yb, R], [cx + 100, yb + ah * 0.8])],
  }),
  ring: (cx, yb, ah) => ({ p: [c([cx - 70, yb, R], [cx - 70, yb + ah, R], [cx + 70, yb + ah, R], [cx + 70, yb, R])] }),
  diaer: (cx, yb, ah, m) => ({
    dots: [
      [cx - (m.W * 0.62 + 62), yb + m.rd * 0.4],
      [cx + (m.W * 0.62 + 62), yb + m.rd * 0.4],
    ],
  }),
  dot: (cx, yb, ah, m) => ({ dots: [[cx, yb + m.rd * 0.4]] }),
  dblacute: (cx, yb, ah) => ({ p: [o([cx - 120, yb], [cx - 30, yb + ah]), o([cx + 20, yb], [cx + 110, yb + ah])] }),
  cedilla: (cx, yb, ah, m) => ({ p: [o([cx, m.B], [cx + 45, -95], [cx - 55, -175])], below: true }),
  ogonek: (cx, yb, ah, m, w) => ({ p: [o([w * 0.85, m.B], [w * 0.68, -110, R], [w * 0.98, -175])], below: true }),
};
const COMPOSITES = {};
const addSet = (base, map) => {
  for (const [ch, acc] of Object.entries(map)) COMPOSITES[ch] = [base, acc];
};
addSet("A", {
  À: "grave",
  Á: "acute",
  Â: "circ",
  Ã: "tilde",
  Ä: "diaer",
  Å: "ring",
  Ā: "macron",
  Ă: "breve",
  Ą: "ogonek",
});
addSet("a", {
  à: "grave",
  á: "acute",
  â: "circ",
  ã: "tilde",
  ä: "diaer",
  å: "ring",
  ā: "macron",
  ă: "breve",
  ą: "ogonek",
});
addSet("C", { Ç: "cedilla", Ć: "acute", Č: "caron" });
addSet("c", { ç: "cedilla", ć: "acute", č: "caron" });
addSet("D", { Ď: "caron" });
addSet("E", { È: "grave", É: "acute", Ê: "circ", Ë: "diaer", Ē: "macron", Ė: "dot", Ę: "ogonek", Ě: "caron" });
addSet("e", { è: "grave", é: "acute", ê: "circ", ë: "diaer", ē: "macron", ė: "dot", ę: "ogonek", ě: "caron" });
addSet("G", { Ğ: "breve" });
addSet("g", { ğ: "breve" });
addSet("I", { Ì: "grave", Í: "acute", Î: "circ", Ï: "diaer", Ī: "macron", İ: "dot" });
addSet("ı", { ì: "grave", í: "acute", î: "circ", ï: "diaer", ī: "macron" });
addSet("N", { Ñ: "tilde", Ń: "acute", Ň: "caron" });
addSet("n", { ñ: "tilde", ń: "acute", ň: "caron" });
addSet("O", { Ò: "grave", Ó: "acute", Ô: "circ", Õ: "tilde", Ö: "diaer", Ō: "macron", Ő: "dblacute" });
addSet("o", { ò: "grave", ó: "acute", ô: "circ", õ: "tilde", ö: "diaer", ō: "macron", ő: "dblacute" });
addSet("R", { Ř: "caron" });
addSet("r", { ř: "caron" });
addSet("S", { Ś: "acute", Ş: "cedilla", Š: "caron" });
addSet("s", { ś: "acute", ş: "cedilla", š: "caron" });
addSet("T", { Ţ: "cedilla", Ť: "caron" });
addSet("U", { Ù: "grave", Ú: "acute", Û: "circ", Ü: "diaer", Ū: "macron", Ů: "ring", Ű: "dblacute" });
addSet("u", { ù: "grave", ú: "acute", û: "circ", ü: "diaer", ū: "macron", ů: "ring", ű: "dblacute" });
addSet("Y", { Ý: "acute", Ÿ: "diaer" });
addSet("y", { ý: "acute", ÿ: "diaer" });
addSet("Z", { Ź: "acute", Ż: "dot", Ž: "caron" });
addSet("z", { ź: "acute", ż: "dot", ž: "caron" });

// Letters with strokes through them.
const STROKED = {
  Ø: ["O", (m, w) => o([-m.W * 0.3, m.B - m.W * 0.5], [w + m.W * 0.3, m.C + m.W * 0.5])],
  ø: ["o", (m, w) => o([-m.W * 0.3, m.B - m.W * 0.5], [w + m.W * 0.3, m.X + m.W * 0.5])],
  Ł: ["L", (m) => o([-90, m.B + 0.34 * m.H], [150, m.B + 0.6 * m.H])],
  ł: ["l", (m) => o([-80, m.B + 0.42 * (m.A - m.B)], [130, m.B + 0.62 * (m.A - m.B)])],
  Đ: ["D", (m) => o([-80, m.B + 0.5 * m.H], [150, m.B + 0.5 * m.H])],
  đ: ["d", (m) => o([240, m.A - 0.12 * (m.A - m.B)], [480, m.A - 0.12 * (m.A - m.B)])],
};

// ---------------------------------------------------------------- geometry
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
const norm = (v) => {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l];
};

// Replace flagged vertices with faceted arcs (k segments per 90°).
function facet(path, style) {
  const pts = path.pts;
  const n = pts.length;
  const out = [];
  const isRounded = (i) => {
    if (!path.closed && (i === 0 || i === n - 1)) return false;
    return !!pts[(i + n) % n][2];
  };
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (!isRounded(i)) {
      out.push([p[0], p[1]]);
      continue;
    }
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const d1 = norm(sub(p, prev));
    const d2 = norm(sub(next, p));
    const dot = Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1]));
    const theta = Math.acos(dot);
    if (theta < 1e-3) {
      out.push([p[0], p[1]]);
      continue;
    }
    const l1 = len(sub(p, prev));
    const l2 = len(sub(next, p));
    const lim1 = isRounded(i - 1) ? l1 / 2 : l1 * 0.98;
    const lim2 = isRounded(i + 1) ? l2 / 2 : l2 * 0.98;
    const t = Math.min(style.r * (p[2] || 1), lim1, lim2);
    const rad = t / Math.tan(theta / 2);
    const s = [p[0] - d1[0] * t, p[1] - d1[1] * t];
    const cross = d1[0] * d2[1] - d1[1] * d2[0];
    const nrm = cross > 0 ? [-d1[1], d1[0]] : [d1[1], -d1[0]];
    const ctr = [s[0] + nrm[0] * rad, s[1] + nrm[1] * rad];
    const a0 = Math.atan2(s[1] - ctr[1], s[0] - ctr[0]);
    const segs = Math.max(1, Math.round((theta / (Math.PI / 2)) * style.k));
    const sweep = cross > 0 ? theta : -theta;
    for (let j = 0; j <= segs; j++) {
      const a = a0 + (sweep * j) / segs;
      out.push([ctr[0] + Math.cos(a) * rad, ctr[1] + Math.sin(a) * rad]);
    }
  }
  return out;
}

function octagon(cx, cy, flat) {
  const R0 = flat / Math.cos(Math.PI / 8);
  const ring = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    ring.push([cx + Math.cos(a) * R0, cy + Math.sin(a) * R0]);
  }
  ring.push(ring[0]);
  return [ring];
}

function quad(a, b, hw) {
  const d = norm(sub(b, a));
  const nx = -d[1] * hw,
    ny = d[0] * hw;
  return [
    [
      [a[0] - nx, a[1] - ny],
      [b[0] - nx, b[1] - ny],
      [b[0] + nx, b[1] + ny],
      [a[0] + nx, a[1] + ny],
      [a[0] - nx, a[1] - ny],
    ],
  ];
}

function strokePath(path, style) {
  const hw = style.W / 2;
  let pts = facet(path, style);
  if (path.closed) pts = [...pts, pts[0]];
  const polys = [];
  for (let i = 0; i < pts.length - 1; i++) {
    let a = pts[i],
      b = pts[i + 1];
    if (len(sub(b, a)) < 0.01) continue;
    if (style.caps === "square" && !path.closed) {
      const d = norm(sub(b, a));
      if (i === 0) a = [a[0] - d[0] * hw, a[1] - d[1] * hw];
      if (i === pts.length - 2) b = [b[0] + d[0] * hw, b[1] + d[1] * hw];
    }
    polys.push(quad(a, b, hw));
  }
  pts.forEach((p, i) => {
    const endpoint = !path.closed && (i === 0 || i === pts.length - 1);
    if (endpoint && style.caps === "square") return;
    polys.push(octagon(p[0], p[1], hw));
  });
  return polys;
}

const snapGeom = (g, q) =>
  g.map((ring) =>
    Array.isArray(ring[0][0])
      ? snapGeom(ring, q)
      : ring.map(([x, y]) => [Math.round(x / q) * q, Math.round(y / q) * q]),
  );

// polygon-clipping is sensitive to float noise; snap to the font grid and
// retry coarser grids, finally falling back to overlapping contours (which
// render identically under the nonzero fill rule).
function unionAll(polys) {
  if (!polys.length) return [];
  for (const q of [1, 2, 3]) {
    try {
      return pc.union(...polys.map((p) => snapGeom(p, q)));
    } catch {
      /* retry */
    }
  }
  let acc = [];
  for (const p of polys) {
    try {
      acc = pc.union(acc, snapGeom(p, 1));
    } catch {
      acc = [...acc, snapGeom(p, 1)];
    }
  }
  return acc;
}

function buildGeometry(def, style, m, extra) {
  const scaleX = (pt) => [pt[0] * style.widthScale, pt[1], pt[2]];
  const scalePath = (p) => ({ ...p, pts: p.pts.map(scaleX) });
  const polys = [];
  for (const p of def.p ?? []) polys.push(...strokePath(scalePath(p), style));
  const dotFlat = def.bigDots ? m.rd * 1.6 : m.rd;
  for (const [x, y] of def.dots ?? []) polys.push(octagon(x * style.widthScale, y, dotFlat));
  let geom = unionAll(polys);
  if (style.bandClip && !def.noClip && geom.length) {
    try {
      geom = pc.intersection(geom, [
        [
          [-4000, 0],
          [4000, 0],
          [4000, style.cap],
          [-4000, style.cap],
          [-4000, 0],
        ],
      ]);
    } catch {
      /* keep unclipped */
    }
  }
  if (extra) {
    const ex = [];
    for (const p of extra.p ?? []) ex.push(...strokePath(p, { ...style, caps: "octagon" }));
    for (const [x, y] of extra.dots ?? []) ex.push(octagon(x, y, m.rd));
    if (ex.length) geom = unionAll([geom, ...ex].filter((g) => g.length));
  }
  return geom;
}

function bbox(geom) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const poly of geom)
    for (const ring of poly)
      for (const [x, y] of ring) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
  return { minX, maxX, minY, maxY };
}

function metricsFor(style) {
  const h = style.W / 2;
  const B = h,
    X = style.xh - h,
    C = style.cap - h,
    A = style.asc - h,
    D = style.desc + h;
  const rd = style.W * 0.62;
  return { W: style.W, B, X, C, A, D, H: C - B, XH: X - B, rd, dotY: X + style.W * 0.5 + 90 + rd };
}

function resolveDef(ch, style, m) {
  const isUpper = (s) => s === s.toUpperCase() && s !== s.toLowerCase();
  if (style.allCaps) {
    const up = ch.toUpperCase();
    if (up !== ch && up.length === 1 && (G[up] || COMPOSITES[up] || STROKED[up])) ch = up;
    if (ch === "ı") ch = "I";
    if (ch === "ß") return null;
  }
  if (G[ch]) return { def: G[ch](m) };
  if (STROKED[ch]) {
    const [base, fn] = STROKED[ch];
    const r = resolveDef(base, style, m);
    if (!r) return null;
    const w = r.def.w * style.widthScale;
    return { def: r.def, extra: { p: [fn(m, w)] } };
  }
  if (COMPOSITES[ch]) {
    let [base, acc] = COMPOSITES[ch];
    if (style.allCaps) {
      base = base === "ı" ? "I" : base.toUpperCase();
    }
    const r = resolveDef(base, style, m);
    if (!r) return null;
    const w = r.def.w * style.widthScale;
    const upper = isUpper(base) || style.allCaps;
    const top = upper ? m.C : m.X;
    const ah = upper ? 95 : 120;
    const yb = top + m.W + (upper ? 40 : 55);
    const extra = ACCENTS[acc](w / 2, yb, ah, m, w);
    return { def: r.def, extra };
  }
  return null;
}

// ---------------------------------------------------------------- font build
function buildFont(style) {
  const m = metricsFor(style);
  const glyphs = [];
  const exported = {};

  const notdef = new opentype.Path();
  notdef.moveTo(60, 0);
  notdef.lineTo(60, 700);
  notdef.lineTo(440, 700);
  notdef.lineTo(440, 0);
  notdef.close();
  notdef.moveTo(120, 60);
  notdef.lineTo(380, 60);
  notdef.lineTo(380, 640);
  notdef.lineTo(120, 640);
  notdef.close();
  glyphs.push(new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: notdef }));
  glyphs.push(new opentype.Glyph({ name: "space", unicode: 32, advanceWidth: style.space, path: new opentype.Path() }));
  glyphs.push(
    new opentype.Glyph({ name: "uni00A0", unicode: 0xa0, advanceWidth: style.space, path: new opentype.Path() }),
  );

  const chars = new Set([...Object.keys(G), ...Object.keys(COMPOSITES), ...Object.keys(STROKED)]);
  const supported = [];
  for (const ch of chars) {
    const resolved = resolveDef(ch, style, m);
    if (!resolved) continue;
    const geom = buildGeometry(resolved.def, style, m, resolved.extra);
    if (!geom.length) continue;
    const bb = bbox(geom);
    const inkW = bb.maxX - bb.minX;
    let advance, shift;
    if (style.mono) {
      advance = style.mono;
      shift = (advance - inkW) / 2 - bb.minX;
    } else {
      advance = Math.round(inkW + style.sb * 2);
      shift = style.sb - bb.minX;
    }
    let geomOut = geom;
    if (style.mono) {
      const maxInk = style.mono - style.sb * 2;
      if (inkW > maxInk) {
        // Squeeze wide glyphs horizontally to fit the fixed pitch.
        const s = maxInk / inkW;
        geomOut = geom.map((poly) => poly.map((ring) => ring.map(([x, y]) => [(x - bb.minX) * s + bb.minX, y])));
        shift = style.sb - bb.minX;
      }
    }
    const path = new opentype.Path();
    const ringsOut = [];
    for (const poly of geomOut) {
      for (const ring of poly) {
        const pts = ring.slice(0, -1).map(([x, y]) => [Math.round(x + shift), Math.round(y)]);
        const clean = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
        if (clean.length < 3) continue;
        path.moveTo(clean[0][0], clean[0][1]);
        for (let i = 1; i < clean.length; i++) path.lineTo(clean[i][0], clean[i][1]);
        path.close();
        ringsOut.push(clean);
      }
    }
    const cp = ch.codePointAt(0);
    glyphs.push(
      new opentype.Glyph({
        name: `uni${cp.toString(16).toUpperCase().padStart(4, "0")}`,
        unicode: cp,
        advanceWidth: advance,
        path,
      }),
    );
    supported.push(ch);
    if (style.exportGlyphs && /^[A-Z0-9.\-&!?']$/.test(ch)) {
      exported[ch] = {
        advance,
        polygons: geomOut.map((poly) =>
          poly.map((ring) => ring.slice(0, -1).map(([x, y]) => [Math.round(x + shift), Math.round(y)])),
        ),
      };
    }
  }

  const font = new opentype.Font({
    familyName: style.family,
    styleName: style.style,
    unitsPerEm: 1000,
    ascender: 960,
    descender: -280,
    weightClass: style.weight,
    designer: "Polyhistor",
    designerURL: "https://polyhistor.app",
    manufacturer: "Polyhistor",
    license: "Original typeface created for Polyhistor. All rights reserved.",
    version: "1.000",
    glyphs,
  });
  return { font, exported, supported };
}

mkdirSync("public/fonts", { recursive: true });
mkdirSync("lib/typography", { recursive: true });
let charset = null;
for (const style of STYLES) {
  const { font, exported, supported } = buildFont(style);
  const buf = Buffer.from(font.toArrayBuffer());
  writeFileSync(`public/fonts/${style.file}`, buf);
  console.log(`${style.file}: ${supported.length} glyphs, ${(buf.length / 1024).toFixed(1)} KB`);
  if (style.exportGlyphs) {
    writeFileSync(
      "lib/typography/facet-glyphs.json",
      JSON.stringify({ unitsPerEm: 1000, cap: style.cap, space: style.space, glyphs: exported }),
    );
  }
  if (style.family === "Tessera" && style.style === "Regular") charset = supported;
}
writeFileSync("lib/typography/charset.json", JSON.stringify([" ", "\u00a0", ...charset].join("")));
console.log("wrote lib/typography/facet-glyphs.json and lib/typography/charset.json");
