/**
 * Decorative low-poly landmarks for the studio preview reel.
 * Hand-drawn flat-shaded polygons; never used as models in generated films.
 */

type Pt = readonly [x: number, y: number];

/** A flat-shaded polygon. `rise` (0 = ground, 1 = top) staggers the build-up animation. */
export interface Facet {
  fill: string;
  points: string;
  rise: number;
}

/** A terrain patch: fill and SVG points in the 100 × 40 terrain box. */
export type Patch = readonly [fill: string, points: string];

export interface Landmark {
  name: string;
  place: string;
  era: string;
  /** Atmosphere tint behind the scene. */
  sky: string;
  sun: string;
  /** Sun centre, as percentages of the stage. */
  sunAt: Pt;
  /** Terrain stretched to the stage width (viewBox 0 0 100 40). The landmark stands at about y = 19. */
  land: readonly Patch[];
  /** Water glints in terrain units: x, y, length. */
  glints?: readonly (readonly [x: number, y: number, length: number])[];
  /** Back to front, in viewBox -20 0 300 200 with the ground at y = 200. */
  art: readonly Facet[];
}

const GROUND = 200;

function facet(fill: string, ...pts: Pt[]): Facet {
  const ys = pts.map(([, y]) => y);
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  return {
    fill,
    points: pts.map(([x, y]) => `${+x.toFixed(1)},${+y.toFixed(1)}`).join(" "),
    rise: +Math.min(1, Math.max(0, 1 - mid / GROUND)).toFixed(3),
  };
}

const mirror = (cx: number, pts: readonly Pt[]): Pt[] => pts.map(([x, y]): Pt => [2 * cx - x, y]);

/** A symmetric shape from its left half (axis point first and last): lit on the left, shaded on the right. */
function sym(cx: number, lit: string, shade: string, half: readonly Pt[]): Facet[] {
  return [facet(lit, ...half), facet(shade, ...mirror(cx, half))];
}

function box(fill: string, x0: number, y0: number, x1: number, y1: number): Facet {
  return facet(fill, [x0, y0], [x1, y0], [x1, y1], [x0, y1]);
}

function arch(fill: string, x: number, top: number, w: number, bottom: number): Facet {
  return facet(
    fill,
    [x, bottom],
    [x, top + w * 0.5],
    [x + w * 0.15, top + w * 0.15],
    [x + w / 2, top],
    [x + w * 0.85, top + w * 0.15],
    [x + w, top + w * 0.5],
    [x + w, bottom],
  );
}

function tree(cx: number, r: number): Facet[] {
  const top = GROUND - r * 2.6;
  return [
    box("#7a6450", cx - 1.2, GROUND - r, cx + 1.2, GROUND),
    ...sym(cx, "#8fa676", "#738c60", [
      [cx, top],
      [cx - r * 0.7, top + r * 0.5],
      [cx - r, top + r * 1.3],
      [cx - r * 0.75, GROUND - r * 0.7],
      [cx, GROUND - r * 0.55],
    ]),
  ];
}

function pyramid(apex: Pt, left: number, front: number, right: number, [glow, lit, shade]: readonly string[]) {
  return [
    facet(lit, apex, [left, GROUND], [front, GROUND]),
    facet(glow, apex, [left, GROUND], [left + (front - left) * 0.42, GROUND]),
    facet(shade, apex, [front, GROUND], [right, GROUND]),
  ];
}

function palm(x: number): Facet[] {
  const crown: Pt = [x + 8.5, 166];
  return [
    facet("#9a7a55", [x, GROUND], [x + 5, GROUND], [x + 10, 167], [x + 7, 166]),
    facet("#75895c", crown, [x - 12, 174], [x - 4, 166]),
    facet("#8ea271", crown, [x - 6, 152], [x + 2, 158]),
    facet("#9db07e", crown, [x + 9, 146], [x + 14, 155]),
    facet("#8ea271", crown, [x + 26, 151], [x + 20, 159]),
    facet("#75895c", crown, [x + 30, 172], [x + 22, 166]),
  ];
}

const giza: Landmark = {
  name: "Pyramids of Giza",
  place: "Giza, Egypt",
  era: "c. 2560 BCE",
  sky: "#f2d3a2",
  sun: "#eaa966",
  sunAt: [24, 30],
  land: [
    ["#ead2a3", "0,12 16,6 30,10 52,4 74,11 100,6 100,22 0,22"],
    ["#dfc290", "16,6 30,10 21,11"],
    ["#dfc290", "52,4 74,11 58,12"],
    ["#dfc08a", "0,20 28,17 56,17.5 80,16 100,19 100,40 0,40"],
    ["#d5b37d", "0,27 36,21 70,24 100,22 100,40 0,40"],
  ],
  art: [
    ...pyramid([62, 84], -14, 78, 132, ["#f3dcae", "#ecd09a", "#c49563"]),
    facet("#f8ead0", [62, 84], [51.4, 100.2], [64.2, 100.2]),
    facet("#dcb684", [62, 84], [64.2, 100.2], [71.8, 100.2]),
    ...pyramid([150, 30], 46, 172, 262, ["#f6e0b1", "#efd29b", "#c79461"]),
    ...pyramid([238, 150], 206, 244, 276, ["#f0d4a2", "#e8c68c", "#b98a56"]),
    ...palm(2),
  ],
};

/** A roof shell with its tip leaning forward over a glass wall. Back shells are drawn first, in duller tones. */
function sail(bx: number, w: number, h: number, depth: number): Facet[] {
  const p = (u: number, v: number): Pt => [bx + w * u, 174 - h * v];
  const tone = (light: number) => `hsl(40 ${32 - depth * 4}% ${light - depth * 2.5}%)`;
  return [
    facet("#97a5a3", p(0.9, 0.9), p(1.06, 0.84), p(1.1, 0), p(0.92, 0)),
    facet(tone(96), p(0, 0), p(0.08, 0.38), p(0.24, 0.7), p(0.46, 0.9), p(0.72, 0.99), p(0.96, 1), p(0.34, 0)),
    facet(tone(86), p(0.96, 1), p(0.84, 0.72), p(0.84, 0.42), p(0.9, 0.16), p(1, 0), p(0.34, 0)),
  ];
}

const sydney: Landmark = {
  name: "Sydney Opera House",
  place: "Sydney, Australia",
  era: "1973",
  sky: "#cfe1e4",
  sun: "#f2d08e",
  sunAt: [74, 27],
  land: [
    ["#bccab7", "0,7 14,5 30,6.5 48,4.5 70,6 100,4 100,10 0,10"],
    ["#a8c6c7", "0,9 100,8 100,40 0,40"],
    ["#9ebfc1", "0,24 40,19 100,26 100,40 0,40"],
    ["#95b8bb", "0,34 60,30 100,36 100,40 0,40"],
  ],
  glints: [
    [10, 15, 6],
    [80, 13, 7],
    [28, 30, 5],
    [66, 33, 6],
  ],
  art: [
    facet(
      "#cdd7d2",
      [-14, 152],
      [-4, 138],
      [8, 129],
      [20, 126],
      [32, 129],
      [44, 138],
      [54, 152],
      [48, 152],
      [40, 142],
      [30, 135],
      [20, 133],
      [10, 135],
      [0, 142],
      [-8, 152],
    ),
    box("#c3cfca", -22, 136, -14, 166),
    box("#c3cfca", 54, 136, 62, 166),
    box("#c3cfca", -24, 150, 66, 153),
    ...sail(16, 92, 138, 2),
    ...sail(50, 72, 104, 1),
    ...sail(80, 54, 70, 0),
    ...sail(132, 80, 110, 2),
    ...sail(160, 62, 80, 1),
    ...sail(186, 44, 52, 0),
    facet("#e9d8b9", [6, 170], [254, 170], [260, 178], [0, 178]),
    box("#d0b38b", 0, 178, 130, 200),
    box("#c4a67e", 130, 178, 260, 200),
    box("#b4966e", 0, 186, 260, 188),
  ],
};

function minaret(cx: number): Facet[] {
  return [
    ...sym(cx, "#f7f0e3", "#ddd2bf", [
      [cx, 85],
      [cx - 4, 85],
      [cx - 5, 184],
      [cx, 184],
    ]),
    box("#e4d9c6", cx - 6.5, 150, cx + 6.5, 153),
    box("#e4d9c6", cx - 6, 118, cx + 6, 121),
    box("#e4d9c6", cx - 7, 82, cx + 7, 85),
    ...sym(cx, "#fbf6ec", "#e2d8c6", [
      [cx, 70],
      [cx - 3, 72],
      [cx - 6, 77],
      [cx - 6, 82],
      [cx, 82],
    ]),
    box("#c99a3c", cx - 0.6, 64, cx + 0.6, 70),
  ];
}

function kiosk(cx: number): Facet[] {
  return [
    box("#efe6d6", cx - 9, 98, cx + 9, 106),
    box("#cdbfa8", cx - 5, 100, cx - 1, 106),
    box("#cdbfa8", cx + 1, 100, cx + 5, 106),
    ...sym(cx, "#fbf6ec", "#e2d8c6", [
      [cx, 84],
      [cx - 5, 87],
      [cx - 9, 93],
      [cx - 9, 98],
      [cx, 98],
    ]),
    box("#c99a3c", cx - 0.5, 79, cx + 0.5, 84),
  ];
}

const taj: Landmark = {
  name: "Taj Mahal",
  place: "Agra, India",
  era: "1653",
  sky: "#f2d7d0",
  sun: "#f2c48e",
  sunAt: [24, 27],
  land: [
    ["#bfcdab", "0,8 100,8 100,22 0,22"],
    ["#c6d3b4", "0,19 100,19 100,40 0,40"],
    ["#e9e1d0", "44,19 56,19 65,40 35,40"],
    ["#b4ccd0", "46,19 54,19 62,40 38,40"],
  ],
  glints: [
    [48, 26, 4],
    [47, 33, 6],
  ],
  art: [
    box("#f8f1e4", 4, 183, 256, 186),
    box("#efe5d3", 4, 186, 130, 200),
    box("#e4d8c4", 130, 186, 256, 200),
    ...minaret(22),
    ...minaret(238),
    box("#ece3d3", 64, 112, 78, 184),
    box("#fbf6ec", 78, 110, 182, 184),
    box("#ded4c2", 182, 112, 196, 184),
    box("#f1e9da", 62, 106, 198, 112),
    arch("#d8ccb7", 67, 122, 8, 146),
    arch("#d8ccb7", 67, 154, 8, 180),
    arch("#cbbfa9", 185, 122, 8, 146),
    arch("#cbbfa9", 185, 154, 8, 180),
    arch("#cdbfa8", 86, 118, 16, 146),
    arch("#cdbfa8", 86, 152, 16, 182),
    arch("#cdbfa8", 158, 118, 16, 146),
    arch("#cdbfa8", 158, 152, 16, 182),
    ...kiosk(82),
    ...kiosk(178),
    box("#fdfaf2", 106, 96, 154, 184),
    facet(
      "#cdbfa8",
      [114, 184],
      [114, 128],
      [118, 118],
      [124, 111],
      [130, 106],
      [136, 111],
      [142, 118],
      [146, 128],
      [146, 184],
    ),
    facet("#8f9b93", [121, 184], [121, 152], [125, 145], [130, 141], [135, 145], [139, 152], [139, 184]),
    box("#f3ecdf", 102, 86, 158, 96),
    ...sym(130, "#fcf8f0", "#e4dac8", [
      [130, 30],
      [122, 37],
      [110, 47],
      [100, 59],
      [96, 71],
      [98, 81],
      [102, 87],
      [130, 87],
    ]),
    facet("#fffdf8", [130, 30], [118, 40], [108, 52], [104, 64], [113, 57], [123, 44]),
    box("#c99a3c", 129, 14, 131, 30),
    box("#c99a3c", 127.5, 20, 132.5, 23),
  ],
};

function hut(x: number, y: number, w: number, h: number): Facet[] {
  return [
    ...sym(x + w / 2, "#d3c7ad", "#b1a58b", [
      [x + w / 2, y],
      [x, y + h * 0.38],
      [x, y + h],
      [x + w / 2, y + h],
    ]),
    facet(
      "#6d6556",
      [x + w * 0.4, y + h],
      [x + w * 0.43, y + h * 0.6],
      [x + w * 0.57, y + h * 0.6],
      [x + w * 0.6, y + h],
    ),
  ];
}

function machuPicchu(): Facet[] {
  const a: Pt = [100, 200];
  const b: Pt = [134, 134];
  const c: Pt = [154, 88];
  const d: Pt = [168, 54];
  const e: Pt = [180, 32];
  const f: Pt = [193, 28];
  const g: Pt = [205, 48];
  const h: Pt = [215, 82];
  const i: Pt = [228, 122];
  const j: Pt = [252, 170];
  const k: Pt = [272, 200];
  const m: Pt = [184, 98];
  const n: Pt = [200, 150];
  const o: Pt = [156, 200];
  const q: Pt = [222, 200];
  const out: Facet[] = [
    facet("#a6b995", [-20, 200], [-4, 170], [16, 142], [40, 118], [34, 200]),
    facet("#92a882", [40, 118], [66, 128], [92, 160], [110, 200], [34, 200]),
    facet("#94ab84", a, b, c, m, o),
    facet("#a5b994", c, d, e, m),
    facet("#7f9874", e, f, g, h, m),
    facet("#87a07b", m, h, n),
    facet("#7a9370", o, m, n, q),
    facet("#6a8262", h, i, j, k, q, n),
  ];
  for (let t = 0; t < 4; t++) {
    const y = 150 + t * 10;
    const left = 14 - t * 9;
    const right = 52 + t * 12;
    out.push(
      facet(t % 2 ? "#aabb8f" : "#b8c79d", [left, y], [right, y], [right + 4, y + 10], [left - 5, y + 10]),
      facet("#cdbf9f", [left - 4.4, y + 8.6], [right + 3.4, y + 8.6], [right + 4, y + 10], [left - 5, y + 10]),
    );
  }
  out.push(facet("#a9bb8d", [54, 184], [238, 184], [250, 200], [44, 200]));
  for (const [x, y, w, hh] of [
    [70, 160, 22, 26],
    [98, 166, 18, 20],
    [122, 154, 24, 30],
    [152, 164, 20, 22],
    [178, 158, 22, 28],
    [206, 168, 16, 18],
  ]) {
    out.push(...hut(x, y, w, hh));
  }
  out.push(box("#cdc1a6", 50, 186, 246, 190), box("#a3b688", 44, 190, 250, 200));
  return out;
}

const machu: Landmark = {
  name: "Machu Picchu",
  place: "Cusco Region, Peru",
  era: "c. 1450",
  sky: "#d4e2d4",
  sun: "#efd29a",
  sunAt: [20, 25],
  land: [
    ["#b4c3a8", "0,10 10,2 22,8 36,0 48,7 64,1 80,9 92,3 100,6 100,24 0,24"],
    ["#dfe6d9", "0,14 100,12 100,20 0,22"],
    ["#a9bc90", "0,20 30,17 70,17 100,20 100,40 0,40"],
    ["#9db285", "0,28 50,22 100,30 100,40 0,40"],
  ],
  art: machuPicchu(),
};

function eiffelTower(): Facet[] {
  return [
    ...tree(34, 14),
    ...tree(56, 10),
    ...tree(204, 10),
    ...tree(226, 14),
    ...sym(130, "#a8865f", "#7e6248", [
      [130, 140],
      [92, 140],
      [70, 200],
      [98, 200],
      [104, 186],
      [112, 175],
      [122, 168],
      [130, 166],
    ]),
    facet("#8d6f51", [80, 196], [92, 148], [96, 196]),
    facet("#6c533d", [180, 196], [168, 148], [164, 196]),
    box("#5f4b39", 84, 132, 176, 140),
    box("#c39f74", 84, 132, 176, 134.5),
    ...sym(130, "#a8865f", "#7e6248", [
      [130, 84],
      [114, 84],
      [98, 132],
      [118, 132],
      [124, 118],
      [130, 112],
    ]),
    box("#5f4b39", 108, 78, 152, 84),
    box("#c39f74", 108, 78, 152, 80),
    ...sym(130, "#a8865f", "#7e6248", [
      [130, 20],
      [126, 20],
      [115, 78],
      [130, 78],
    ]),
    box("#5f4b39", 124, 14, 136, 20),
    facet("#5f4b39", [129, 14], [131, 14], [130.4, 2], [129.6, 2]),
  ];
}

const eiffel: Landmark = {
  name: "Eiffel Tower",
  place: "Paris, France",
  era: "1889",
  sky: "#dcdeea",
  sun: "#efc58c",
  sunAt: [70, 30],
  land: [
    ["#cfd1cc", "0,12 8,10 14,12 22,9 30,11 40,10 48,12 60,9 70,11 80,10 90,12 100,10 100,20 0,20"],
    ["#bccaa8", "0,18 100,18 100,40 0,40"],
    ["#b1c19b", "0,28 34,24 34,40 0,40"],
    ["#b1c19b", "66,24 100,28 100,40 66,40"],
    ["#e2d6bd", "46,18 54,18 66,40 34,40"],
  ],
  art: eiffelTower(),
};

function moai(cx: number, h: number, w: number, topknot = false): Facet[] {
  const p = (u: number, v: number): Pt => [cx + (u * w) / 2, 180 - v * h];
  const out = [
    ...sym(cx, "#8f8574", "#6f6759", [p(0, 0.46), p(-0.8, 0.46), p(-0.96, 0.38), p(-1, 0), p(0, 0)]),
    facet("#7d7466", p(-0.82, 0.36), p(-0.7, 0.36), p(-0.12, 0.1), p(-0.26, 0.08)),
    facet("#5f584f", p(0.82, 0.36), p(0.7, 0.36), p(0.12, 0.1), p(0.26, 0.08)),
    facet("#6f6759", p(-0.72, 0.88), p(-0.84, 0.86), p(-0.84, 0.62), p(-0.72, 0.62)),
    facet("#5f584f", p(0.72, 0.88), p(0.84, 0.86), p(0.84, 0.62), p(0.72, 0.62)),
    ...sym(cx, "#968b79", "#71695b", [p(0, 1), p(-0.6, 1), p(-0.7, 0.93), p(-0.72, 0.58), p(-0.6, 0.46), p(0, 0.46)]),
    facet("#544d45", p(-0.68, 0.85), p(0.68, 0.85), p(0.62, 0.79), p(-0.62, 0.79)),
    facet("#a89d8a", p(0, 0.82), p(0.04, 0.62), p(-0.2, 0.62)),
    facet("#5f584f", p(0, 0.82), p(0.2, 0.62), p(0.04, 0.62)),
    facet("#544d45", p(-0.32, 0.56), p(0.32, 0.56), p(0.28, 0.53), p(-0.28, 0.53)),
  ];
  if (topknot) {
    out.push(
      facet("#b0634a", p(-0.5, 1), p(0.5, 1), p(0.46, 1.1), p(-0.46, 1.1)),
      facet("#c57a5c", p(-0.46, 1.1), p(0.46, 1.1), p(0.38, 1.14), p(-0.38, 1.14)),
    );
  }
  return out;
}

const rapaNui: Landmark = {
  name: "Moai of Rapa Nui",
  place: "Easter Island, Chile",
  era: "c. 1250–1500",
  sky: "#d3e4e2",
  sun: "#efc27c",
  sunAt: [78, 26],
  land: [
    ["#a2c2c4", "0,4 100,3 100,17 0,18"],
    ["#98bbbe", "0,10 100,9 100,17 0,18"],
    ["#b5c69d", "0,17 24,15.5 60,16.5 100,15 100,40 0,40"],
    ["#a8bb8f", "0,26 46,21 100,27 100,40 0,40"],
  ],
  glints: [
    [8, 7, 6],
    [84, 6, 7],
    [60, 12, 5],
  ],
  art: [
    box("#b8ae9b", 13, 180, 247, 184),
    facet("#a49a88", [13, 184], [247, 184], [250, 200], [10, 200]),
    ...moai(40, 92, 30),
    ...moai(84, 108, 34, true),
    ...moai(130, 120, 38),
    ...moai(176, 104, 34, true),
    ...moai(220, 90, 30),
  ],
};

function watchtower(cx: number, base: number, w: number, h: number): Facet[] {
  const top = base - h;
  const x0 = cx - w / 2;
  const out = [
    ...sym(cx, "#d6c29c", "#b09a75", [
      [cx, top],
      [x0, top],
      [x0, base],
      [cx, base],
    ]),
    box("#e6d7b4", x0 - 1.5, top - 2, cx + w / 2 + 1.5, top + 1),
  ];
  for (let k = 0; k < 4; k++) {
    const mx = x0 - 1.5 + ((w + 3) * (k + 0.5)) / 4;
    out.push(box("#c7b089", mx - 2, top - 6.5, mx + 2, top - 2));
  }
  out.push(
    arch("#6c5d4b", cx - w * 0.3 - 2.5, top + h * 0.3, 5, top + h * 0.55),
    arch("#5f5242", cx + w * 0.3 - 2.5, top + h * 0.3, 5, top + h * 0.55),
  );
  return out;
}

function greatWall(): Facet[] {
  const ridge: Pt[] = [
    [-20, 198],
    [0, 186],
    [26, 156],
    [52, 124],
    [78, 100],
    [96, 92],
    [118, 106],
    [142, 112],
    [166, 86],
    [186, 72],
    [210, 88],
    [238, 104],
    [262, 152],
    [280, 196],
  ];
  const last = ridge.length - 1;
  const mids = ridge.slice(1).map(([x, y], i): Pt => {
    const my = (ridge[i][1] + y) / 2;
    return [(ridge[i][0] + x) / 2, my + (GROUND - my) * (i % 2 ? 0.42 : 0.55)];
  });
  const out: Facet[] = [
    facet("#9aae88", ridge[0], ...mids, ridge[last], [ridge[last][0], GROUND], [ridge[0][0], GROUND]),
    facet("#93a782", mids[2], mids[5], [mids[3][0], GROUND]),
    facet("#a1b48e", mids[8], mids[11], [mids[10][0], GROUND]),
  ];
  for (let i = 0; i < last; i++) {
    const rising = ridge[i + 1][1] < ridge[i][1];
    out.push(facet(rising ? "#b2c39c" : "#93a882", ridge[i], ridge[i + 1], mids[i]));
    if (i < last - 1) out.push(facet(i % 2 ? "#9caf89" : "#a7b993", ridge[i + 1], mids[i + 1], mids[i]));
  }

  const height = (i: number) => (i === 0 || i === last ? 3 : i === 1 || i === last - 1 ? 8 : 12);
  const top = ridge.map(([x, y], i): Pt => [x, y - height(i)]);
  for (let i = 0; i < last; i++) {
    const rising = ridge[i + 1][1] < ridge[i][1];
    const [ax, ay] = top[i];
    const [bx, by] = top[i + 1];
    out.push(
      facet(rising ? "#d9c7a2" : "#bca681", top[i], top[i + 1], ridge[i + 1], ridge[i]),
      facet("#ebdfc0", [ax, ay - 3], [bx, by - 3], top[i + 1], top[i]),
    );
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 7));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      out.push(box("#cbb68f", x - 1.8, y - 4.5, x + 1.8, y));
    }
  }
  out.push(...watchtower(26, 160, 16, 24), ...watchtower(96, 96, 24, 38), ...watchtower(186, 76, 24, 36));
  return out;
}

const wall: Landmark = {
  name: "Great Wall of China",
  place: "Northern China",
  era: "Ming dynasty, 1368–1644",
  sky: "#e0e6d2",
  sun: "#edc993",
  sunAt: [76, 25],
  land: [
    ["#c7d2bb", "0,9 12,3 24,8 40,1 56,7 70,2 86,8 100,3 100,24 0,24"],
    ["#b3c3a1", "0,16 18,10 34,15 60,9 82,14 100,10 100,26 0,26"],
    ["#a3b58f", "0,21 40,18 70,18.5 100,21 100,40 0,40"],
  ],
  art: greatWall(),
};

function statueOfLiberty(): Facet[] {
  const granite = ["#e0d3b9", "#c1b296"] as const;
  const cornice = ["#ebe1ca", "#cbbd9f"] as const;
  const crown = [-162, -136, -112, -90, -68, -44, -18].map((deg) => {
    const a = (deg * Math.PI) / 180;
    const at = (r: number, side: number): Pt => [
      130 + Math.cos(a) * r - Math.sin(a) * side,
      39 + Math.sin(a) * r + Math.cos(a) * side,
    ];
    return facet("#93c2b1", at(5, -1.7), at(14, 0), at(5, 1.7));
  });
  return [
    ...sym(130, "#cdbf9f", "#b3a483", [
      [130, 186],
      [56, 186],
      [40, 200],
      [130, 200],
    ]),
    ...sym(130, ...granite, [
      [130, 165],
      [98, 165],
      [94, 186],
      [130, 186],
    ]),
    ...sym(130, ...cornice, [
      [130, 160],
      [97, 160],
      [95, 165],
      [130, 165],
    ]),
    ...sym(130, ...granite, [
      [130, 124],
      [105, 124],
      [102, 160],
      [130, 160],
    ]),
    box("#9d8e70", 108, 136, 114, 148),
    box("#8e7f62", 146, 136, 152, 148),
    box("#8e7f62", 125, 132, 135, 150),
    ...sym(130, ...cornice, [
      [130, 116],
      [101, 116],
      [103, 124],
      [130, 124],
    ]),
    ...sym(130, ...granite, [
      [130, 110],
      [107, 110],
      [106, 116],
      [130, 116],
    ]),
    ...sym(130, "#8fbfae", "#6c9e8e", [
      [130, 48],
      [124, 50],
      [120, 58],
      [117, 74],
      [115, 92],
      [112, 104],
      [109, 110],
      [130, 110],
    ]),
    facet("#7aae9c", [121, 62], [125, 60], [127, 108], [121, 108]),
    facet("#5f9282", [136, 64], [140, 62], [143, 108], [137, 108]),
    ...crown,
    ...sym(130, "#97c5b4", "#73a494", [
      [130, 33],
      [125.5, 35],
      [124.5, 41],
      [126, 46],
      [130, 48],
    ]),
    facet("#8fbfae", [120, 60], [126, 52], [117, 20], [111, 22]),
    facet("#6c9e8e", [110, 24], [117, 22], [116, 15], [110, 16]),
    facet("#c99a3c", [108, 16], [119, 14], [118.5, 11], [108.5, 12.5]),
    facet("#e8ae4a", [109, 12.5], [118.5, 11], [113, 1.5]),
    facet("#f6d78a", [111.5, 12], [116.5, 11.2], [113.6, 5]),
    facet("#80b2a0", [139, 64], [149, 58], [153, 84], [143, 88]),
    facet("#5e9080", [149, 58], [152, 59], [156, 84], [153, 84]),
  ];
}

const liberty: Landmark = {
  name: "Statue of Liberty",
  place: "New York, United States",
  era: "1886",
  sky: "#d6e3e6",
  sun: "#f0ca8c",
  sunAt: [24, 28],
  land: [
    [
      "#c6d0cf",
      "0,9 0,6 3,6 3,4 6,4 6,7 9,7 9,2 11,2 11,5 14,5 14,3 17,3 17,6 21,6 21,4 24,4 24,8 76,8 76,5 79,5 79,1 81,1 81,4 84,4 84,6 88,6 88,3 91,3 91,5 95,5 95,2 97,2 97,6 100,6 100,9",
    ],
    ["#a7c4c5", "0,8.5 100,8.5 100,40 0,40"],
    ["#9ebdbf", "0,30 50,26 100,31 100,40 0,40"],
    ["#b9c8a3", "12,40 18,22 34,17.5 66,17.5 82,22 88,40"],
    ["#c3d1ad", "12,40 18,22 34,17.5 40,40"],
  ],
  glints: [
    [4, 14, 6],
    [90, 13, 6],
    [4, 31, 5],
    [92, 34, 5],
  ],
  art: statueOfLiberty(),
};

function colosseum(): Facet[] {
  const sag = (x: number) => 9 * ((x - 130) / 120) ** 2;
  const at = (x: number, y: number): Pt => [x, y - sag(x)];
  const rim: Pt[] = [
    [10, 70],
    [150, 70],
    [154, 84],
    [160, 88],
    [164, 98],
    [172, 100],
    [176, 112],
    [186, 116],
    [190, 130],
    [214, 130],
    [219, 125],
    [226, 131],
    [250, 132],
  ];
  const rimAt = (x: number) => {
    for (let i = 1; i < rim.length; i++) {
      const [x0, y0] = rim[i - 1];
      const [x1, y1] = rim[i];
      if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
    return rim[rim.length - 1][1];
  };
  const out: Facet[] = [
    facet("#b4936c", at(146, 76), at(182, 80), at(216, 90), at(250, 104), at(250, 200), at(146, 200)),
  ];
  for (const x of [192, 210, 228]) out.push(arch("#86694d", x, 112 - sag(x + 5), 10, 128 - sag(x + 5)));

  const cuts = [10, 42, 76, 110, 146, 182, 216, 250];
  const tones = ["#d3b588", "#e0c59a", "#e8d0a6", "#e2c79b", "#d6b98b", "#c9aa7c", "#bb9b6f"];
  tones.forEach((tone, i) => {
    const [x0, x1] = [cuts[i], cuts[i + 1]];
    const edge: Pt[] = [[x0, rimAt(x0)], ...rim.filter(([x]) => x > x0 && x < x1), [x1, rimAt(x1)]];
    out.push(facet(tone, ...edge.map(([x, y]) => at(x, y)), at(x1, GROUND), at(x0, GROUND)));
  });
  for (const y of [164, 130, 98]) {
    let end = 10;
    while (end < 250 && rimAt(end + 2) <= y - 3) end += 2;
    const xs = [...cuts.filter((x) => x < end), end];
    out.push(facet("#f0deb8", ...xs.map((x) => at(x, y - 2.5)), ...[...xs].reverse().map((x) => at(x, y + 1))));
  }
  for (const [top, bottom] of [
    [172, 197],
    [138, 160],
    [105, 126],
  ]) {
    for (let c = 20; c <= 240; c += 20) {
      if (Math.max(rimAt(c - 6), rimAt(c), rimAt(c + 6)) > top - 5) continue;
      out.push(arch("#735c46", c - 5.5, top - sag(c), 11, bottom - sag(c)));
    }
  }
  for (let c = 30; c <= 150; c += 20) {
    if (rimAt(c + 3) <= 76) out.push(box("#8a7055", c - 3, 80 - sag(c), c + 3, 87 - sag(c)));
  }
  return out;
}

const rome: Landmark = {
  name: "Colosseum",
  place: "Rome, Italy",
  era: "80 CE",
  sky: "#f0dabe",
  sun: "#e9b67a",
  sunAt: [72, 26],
  land: [
    ["#d2cdb6", "0,12 10,9 20,11 30,8 44,10 56,8 70,11 84,9 100,11 100,22 0,22"],
    ["#d8cdb1", "0,18 100,18 100,40 0,40"],
    ["#bec7a2", "0,18 22,18 16,26 0,28"],
    ["#bec7a2", "78,18 100,18 100,28 84,26"],
    ["#cdc1a3", "0,30 50,24 100,30 100,40 0,40"],
  ],
  art: colosseum(),
};

function lotusTower(cx: number, base: number, w: number, h: number): Facet[] {
  const p = (u: number, v: number): Pt => [cx - w * u, base - h * v];
  const out = sym(cx, "#c8ac87", "#a3876a", [
    p(0, 1),
    p(0.08, 0.92),
    p(0.2, 0.8),
    p(0.3, 0.66),
    p(0.38, 0.5),
    p(0.44, 0.34),
    p(0.5, 0.2),
    p(0.5, 0),
    p(0, 0),
  ]);
  for (const [v, u] of [
    [0.34, 0.44],
    [0.5, 0.38],
    [0.66, 0.3],
    [0.8, 0.2],
  ]) {
    const y = base - h * v;
    out.push(
      facet("#8d735a", [cx - w * u, y], [cx + w * u, y], [cx + w * u * 0.94, y + 2], [cx - w * u * 0.94, y + 2]),
    );
  }
  out.push(facet("#b49877", p(0.04, 1), p(-0.04, 1), [cx, base - h - 6]));
  return out;
}

function angkorWat(): Facet[] {
  const out: Facet[] = [
    ...lotusTower(46, 172, 28, 62),
    ...lotusTower(214, 172, 28, 62),
    ...lotusTower(86, 162, 34, 84),
    ...lotusTower(174, 162, 34, 84),
    ...lotusTower(130, 152, 46, 122),
    ...sym(130, "#c3a782", "#a68a6b", [
      [130, 148],
      [66, 148],
      [64, 172],
      [130, 172],
    ]),
    box("#d8c09c", 62, 145, 198, 149),
  ];
  for (let x = 72; x < 188; x += 9) if (Math.abs(x + 2 - 130) > 9) out.push(box("#5f4e3f", x, 156, x + 4, 166));
  out.push(
    arch("#4f4134", 124, 152, 12, 172),
    ...sym(130, "#bfa37f", "#a0856a", [
      [130, 170],
      [10, 170],
      [6, 188],
      [130, 188],
    ]),
    box("#d4bc97", 8, 167, 252, 171),
  );
  for (let x = 16; x < 244; x += 10) if (Math.abs(x + 2 - 130) > 12) out.push(box("#5f4e3f", x, 175, x + 4.5, 184));
  out.push(
    arch("#4f4134", 122, 172, 16, 188),
    ...sym(130, "#b09572", "#94795d", [
      [130, 188],
      [2, 188],
      [-2, 200],
      [130, 200],
    ]),
  );
  return out;
}

const angkor: Landmark = {
  name: "Angkor Wat",
  place: "Siem Reap, Cambodia",
  era: "12th century",
  sky: "#f4d6b2",
  sun: "#eda865",
  sunAt: [50, 36],
  land: [
    ["#a7b88f", "0,10 6,7 12,9 18,6 26,9 34,7 42,10 58,10 66,7 74,9 82,6 90,9 96,7 100,8 100,20 0,20"],
    ["#b5c49e", "0,18 100,18 100,21 0,21"],
    ["#b9ccc8", "0,20.5 100,20.5 100,40 0,40"],
    ["#adc3c0", "0,32 50,27 100,33 100,40 0,40"],
  ],
  glints: [
    [20, 25, 6],
    [72, 27, 6],
    [44, 35, 5],
  ],
  art: angkorWat(),
};

function elCastillo(): Facet[] {
  const cx = 130;
  const top = 88;
  const rise = (GROUND - top) / 9;
  const out: Facet[] = [];
  for (let k = 0; k < 9; k++) {
    const yb = GROUND - k * rise;
    const yt = yb - rise;
    const wb = 112 - k * 8;
    const wt = wb - 3;
    out.push(
      ...sym(cx, "#d9c295", "#bfa577", [
        [cx, yt],
        [cx - wt, yt],
        [cx - wb, yb],
        [cx, yb],
      ]),
      facet("#ecdcb4", [cx - wt, yt], [cx + wt, yt], [cx + wt - 0.8, yt + 2.4], [cx - wt + 0.8, yt + 2.4]),
    );
  }
  out.push(
    facet("#a68c5f", [cx - 21, GROUND], [cx - 16, GROUND], [cx - 11, top], [cx - 14, top]),
    facet("#93794f", [cx + 21, GROUND], [cx + 16, GROUND], [cx + 11, top], [cx + 14, top]),
    facet("#e7d6ae", [cx - 16, GROUND], [cx + 16, GROUND], [cx + 11, top], [cx - 11, top]),
  );
  for (let y = GROUND - 6; y > top + 2; y -= 6) {
    const hw = 16 - (5 * (GROUND - y)) / (GROUND - top);
    out.push(box("#cbb58b", cx - hw, y, cx + hw, y + 1.4));
  }
  out.push(
    box("#7f6a48", cx - 26, 193, cx - 17, GROUND),
    box("#7f6a48", cx + 17, 193, cx + 26, GROUND),
    ...sym(cx, "#d2b98b", "#b39a6c", [
      [cx, 58],
      [cx - 28, 58],
      [cx - 30, top],
      [cx, top],
    ]),
    box("#bfa272", cx - 32, 50, cx + 32, 58),
    box("#e3cfa4", cx - 32, 48, cx + 32, 51),
    box("#5d4f3e", cx - 5, 68, cx + 5, top),
    box("#5d4f3e", cx - 21, 72, cx - 14, top),
    box("#5d4f3e", cx + 14, 72, cx + 21, top),
  );
  return out;
}

const chichen: Landmark = {
  name: "Chichén Itzá",
  place: "Yucatán, Mexico",
  era: "c. 9th–12th century",
  sky: "#e4e3c2",
  sun: "#ebb468",
  sunAt: [26, 26],
  land: [
    ["#9fb48b", "0,12 5,8 10,11 16,7 22,10 28,8 34,11 66,11 72,8 78,10 84,7 90,10 95,8 100,10 100,22 0,22"],
    ["#93a87f", "0,16 100,15 100,22 0,22"],
    ["#c7cfa8", "0,19 100,19 100,40 0,40"],
    ["#bcc59b", "0,28 40,23 100,29 100,40 0,40"],
  ],
  art: elCastillo(),
};

function parthenon(): Facet[] {
  const out: Facet[] = [
    facet("#cdb88f", [-20, GROUND], [-6, 182], [16, 170], [40, 164], [70, GROUND]),
    facet("#c3ad84", [40, 164], [220, 164], [190, GROUND], [70, GROUND]),
    facet("#a99369", [220, 164], [244, 170], [266, 184], [280, GROUND], [190, GROUND]),
    facet("#b7a178", [70, GROUND], [98, 178], [124, GROUND]),
    facet("#b29c73", [150, GROUND], [174, 176], [192, GROUND]),
  ];
  for (const [x0, x1, y] of [
    [44, 216, 159],
    [48, 212, 154],
    [52, 208, 149],
  ]) {
    out.push(box("#e8c68e", x0, y, x1, y + 5), box("#bb945f", x0, y + 3.6, x1, y + 5));
  }
  out.push(box("#2d5047", 58, 94, 202, 149));
  for (let k = 0; k < 8; k++) {
    const x = 58 + k * ((202 - 58 - 12) / 7);
    out.push(box("#e8c68e", x, 94, x + 7.8, 149), box("#b98e5d", x + 7.8, 94, x + 12, 149));
    out.push(box("#f1d9a5", x - 1.5, 90, x + 13.5, 94));
  }
  out.push(box("#f1d9a5", 52, 82, 208, 90), box("#e3c48c", 52, 74, 208, 82));
  for (let x = 56; x < 204; x += 9.5) out.push(box("#c9a26b", x, 75.5, x + 3, 80.5));
  out.push(
    box("#f5dfab", 48, 70, 212, 74),
    facet("#f5dfab", [48, 70], [130, 70], [130, 44]),
    facet("#c99b67", [130, 44], [212, 70], [130, 70]),
  );
  return out;
}

const athens: Landmark = {
  name: "Parthenon",
  place: "Athens, Greece",
  era: "c. 438 BCE",
  sky: "#e7dbc4",
  sun: "#e8c786",
  sunAt: [64, 25],
  land: [
    ["#cbd4bb", "0,16 14,9 26,13 42,5 60,12 78,6 100,14 100,24 0,24"],
    ["#c3d0b8", "0,22 38,17 100,22 100,40 0,40"],
    ["#b8c6aa", "0,30 50,25 100,31 100,40 0,40"],
  ],
  art: parthenon(),
};

/** Ordered so neighbouring scenes contrast in continent and palette. */
export const LANDMARKS: readonly Landmark[] = [
  giza,
  sydney,
  taj,
  machu,
  eiffel,
  rapaNui,
  wall,
  liberty,
  rome,
  angkor,
  chichen,
  athens,
];
