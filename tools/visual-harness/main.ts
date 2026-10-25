// PolyEngine visual harness. See tools/visual-harness/README.md for usage.
//
// Film mode (default): one frame per scene as a contact sheet, plus optional
// collision audit, debug report and frame timings.
//   ?f=<fixture>        tracked fixture name (tools/visual-harness/fixtures/<f>.json),
//                       or a tmp/fixtures name; default: the showcase script
//   ?file=<path>        any repo-relative JSON (script, {script}, or {video:{script}})
//   ?p=1                portrait (9:16)          ?big=1  larger frames
//   ?scene=<i>          only scene i             ?at=0.55 sample point within each scene
//   ?check=1            collision audit          ?perf=0  skip timing   ?full=1 time the whole film
//   ?audit=1            shot audit used by the in-studio review (result.shotIssues)
//   ?debug=<i>&deep=<k> object report for scene i (meshes of scene child k)
//   ?set=field:value    override a field on every scene (A/B checks), repeatable
// Model mode: ?models=<a.json>&vs=<b.json> renders the same model ids from two
// builders side by side (two views each) for builder comparisons.
// Results: window.__result (JSON) and window.__sheet (JPEG data URL of the sheet).
import { PolyEngine } from "@/lib/lowpoly/engine";
import { exportMovie } from "@/lib/render/movie";
import { ModelLibrary } from "@/lib/lowpoly/compiler";
import { shotIssues, type ShotSnapshot } from "@/lib/lowpoly/shot-audit";
import { SHOWCASE_SCRIPT } from "@/lib/content/showcase";
import type { VideoScript } from "@/lib/schema/video";
import { normalizeModelDefinition } from "@/lib/schema/model";
import * as THREE from "three";

declare global {
  interface Window {
    __result?: unknown;
    __sheet?: string;
  }
}

const q = new URLSearchParams(location.search);

async function fetchJson(paths: string[]) {
  for (const path of paths) {
    const res = await fetch(path);
    if (res.ok) return res.json();
  }
  throw new Error(`Not found: ${paths.join(" or ")}`);
}

async function loadScript(): Promise<VideoScript> {
  const file = q.get("file");
  const f = q.get("f");
  if (!file && (!f || f === "showcase")) return SHOWCASE_SCRIPT;
  const raw = file
    ? await fetchJson([`/${file}`])
    : await fetchJson([`/tools/visual-harness/fixtures/${f}.json`, `/tmp/fixtures/${f}.json`]);
  return (raw.video?.script ?? raw.script ?? raw) as VideoScript;
}

/** Saves a composite of every rendered figure as a JPEG data URL. */
function composite(sheet: HTMLElement, w: number, h: number, cols: number) {
  const figs = [...sheet.querySelectorAll("figure")];
  const comp = document.createElement("canvas");
  comp.width = cols * w;
  comp.height = Math.ceil(figs.length / cols) * (h + 16);
  const g = comp.getContext("2d")!;
  g.fillStyle = "#111";
  g.fillRect(0, 0, comp.width, comp.height);
  g.font = "12px monospace";
  figs.forEach((fig, i) => {
    const x = (i % cols) * w,
      y = Math.floor(i / cols) * (h + 16);
    g.drawImage(fig.querySelector("canvas")!, x, y + 16);
    g.fillStyle = "#ddd";
    g.fillText(fig.querySelector("figcaption")!.textContent ?? "", x + 4, y + 12, w - 8);
  });
  window.__sheet = comp.toDataURL("image/jpeg", 0.85);
  // ?view=sheet: show only the composite, fitted to the window, for screenshots.
  if (q.get("view") === "sheet") {
    sheet.style.display = "none";
    document.getElementById("stats")!.style.display = "none";
    const img = document.createElement("img");
    img.src = window.__sheet;
    img.style.cssText = "display:block;width:100%;height:auto";
    document.body.appendChild(img);
  }
}

function figure(sheet: HTMLElement, source: HTMLCanvasElement, w: number, h: number, caption: string) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(source, 0, 0, w, h);
  const fig = document.createElement("figure");
  const cap = document.createElement("figcaption");
  cap.textContent = caption;
  fig.append(c, cap);
  sheet.appendChild(fig);
}

// ---------------------------------------------------------------- model mode
async function compareModels() {
  // Normalize exactly as the pipeline does, so raw and saved sets compare fairly.
  const load = async (path: string | null) =>
    ((await fetchJson([`/${path}`])) as { id: string }[]).map((m) =>
      normalizeModelDefinition(m, m.id, { requireComplete: true }),
    );
  const a = await load(q.get("models"));
  const b = await load(q.get("vs"));
  // models-<n>-<builder>.json -> <builder>
  const label = (path: string | null) =>
    (path ?? "")
      .split("/")
      .pop()!
      .replace(/\.json$/, "")
      .replace(/^models-\d+-/, "");
  const [w, h] = [420, 315];
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  const sheet = document.getElementById("sheet")!;
  const rows: unknown[] = [];
  for (const def of a) {
    if (q.get("model") && def.id !== q.get("model")) continue;
    const other = b.find((m) => m.id === def.id);
    for (const [name, model] of [
      [label(q.get("models")), def],
      [label(q.get("vs")), other],
    ] as const) {
      if (!model) continue;
      const lib = new ModelLibrary([model]);
      const inst = lib.instance(model.id)!;
      const bounds = lib.bounds(model.id);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#cfd8e0");
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(bounds.radius * 4, 48).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: "#a9a493", roughness: 1 }),
      );
      ground.receiveShadow = true;
      const sun = new THREE.DirectionalLight("#fff4e0", 2.6);
      sun.position.set(bounds.radius * 2, bounds.radius * 3, bounds.radius * 2.4);
      sun.castShadow = true;
      const sc = sun.shadow.camera as THREE.OrthographicCamera;
      sc.left = sc.bottom = -bounds.radius * 2;
      sc.right = sc.top = bounds.radius * 2;
      sc.far = bounds.radius * 12;
      scene.add(ground, sun, new THREE.HemisphereLight("#dfe8ff", "#6f6a52", 1.1), inst.object);
      inst.update({ time: 1.2, progress: 0.5, moving: true, night: false, phase: 0 });
      let tris = 0;
      inst.object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        tris += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3;
      });
      const camera = new THREE.PerspectiveCamera(36, w / h, 0.05, bounds.radius * 40);
      const target = new THREE.Vector3(bounds.center.x, bounds.height * 0.45, bounds.center.z);
      const dist = Math.max(bounds.radius, bounds.height * 0.8) * 2.6;
      // Three-quarter front view, then a side view.
      for (const [view, az] of [
        ["3/4", 0.75],
        ["side", Math.PI / 2],
      ] as const) {
        camera.position.set(target.x + Math.cos(az) * dist, target.y + dist * 0.35, target.z + Math.sin(az) * dist);
        camera.lookAt(target);
        renderer.render(scene, camera);
        figure(
          sheet,
          renderer.domElement,
          w,
          h,
          `${model.id} · ${name} · ${view} · ${model.parts.length}p ${Math.round(tris)}t`,
        );
      }
      rows.push({
        id: model.id,
        builder: name,
        parts: model.parts.length,
        materials: model.materials.length,
        triangles: Math.round(tris),
      });
      inst.dispose();
      lib.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
    }
  }
  renderer.dispose();
  composite(sheet, w, h, 4);
  return { mode: "models", rows };
}

/** Encodes the loaded film to an HD movie and reports size and time. The bytes stay in memory. */
async function encodeFilm() {
  const script = await loadScript();
  const portrait = q.get("p") === "1";
  await PolyEngine.loadFonts("/public/fonts");
  const started = performance.now();
  const { movie, mime, frames } = await exportMovie(script, { aspect: portrait ? "portrait" : "landscape" });
  return {
    mode: "encode",
    encodeMs: Math.round(performance.now() - started),
    bytes: movie.size,
    mime,
    frames,
    scenes: script.scenes.length,
    duration: script.totalDuration,
  };
}

// ---------------------------------------------------------------- film mode
async function renderFilm() {
  let script = await loadScript();
  const portrait = q.get("p") === "1";
  const at = Number(q.get("at") || 0.55);
  const only = q.get("scene");
  if (q.get("immersive") === "1") script = { ...script, presentation: "immersive" };
  for (const kv of q.getAll("set")) {
    const [k, v] = kv.split(":");
    script = {
      ...script,
      scenes: script.scenes.map((s) => ({ ...s, [k]: Number.isNaN(Number(v)) ? v : Number(v) })),
    };
  }
  await PolyEngine.loadFonts("/public/fonts");
  const big = q.get("big") === "1";
  const [w, h] = portrait ? (big ? [540, 960] : [270, 480]) : big ? [960, 540] : [640, 360];
  const engine = new PolyEngine(script, { width: w, height: h, pixelRatio: 1 });
  const sheet = document.getElementById("sheet")!;
  const sync = (e: PolyEngine) => e.canvas.getContext("2d")!.getImageData(0, 0, 1, 1);
  const times: number[] = [];
  let acc = 0;
  script.scenes.forEach((s, i) => {
    const t = acc + s.duration * at;
    acc += s.duration;
    if (only != null && Number(only) !== i) return;
    const t0 = performance.now();
    engine.renderAt(t);
    sync(engine);
    times.push(performance.now() - t0);
    figure(sheet, engine.canvas, w, h, `${i} ${s.kind}/${s.setting}/${s.camera}/${s.timeOfDay}/${s.weather}`);
  });
  engine.dispose();
  composite(sheet, w, h, portrait ? 4 : 2);

  const result: Record<string, unknown> = {
    scenes: script.scenes.length,
    buildAndFirstFrameMs: times.map((x) => Math.round(x)),
  };
  type Internals = { built: Map<number, { scene: THREE.Scene; camera: THREE.PerspectiveCamera }> };

  if (q.get("debug") != null) {
    // Camera and top-level object report for one scene at its sample time.
    const di = Number(q.get("debug"));
    const dbg = new PolyEngine(script, { width: w, height: h, pixelRatio: 1 });
    const t = script.scenes.slice(0, di).reduce((a, s) => a + s.duration, 0) + script.scenes[di].duration * at;
    dbg.renderAt(t);
    const b = (dbg as unknown as Internals).built.get(di)!;
    const bb = new THREE.Box3();
    const fmt = (v: THREE.Vector3) => v.toArray().map((n) => n.toFixed(1));
    const rows = b.scene.children.map((o, k) => {
      bb.setFromObject(o);
      const c = bb.getCenter(new THREE.Vector3());
      return `${k} ${o.type}(${o.children.length}) c=${fmt(c)} s=${fmt(bb.getSize(new THREE.Vector3()))} d=${c.distanceTo(b.camera.position).toFixed(1)}`;
    });
    const deep = q.get("deep");
    const meshes: string[] = [];
    if (deep != null)
      b.scene.children[Number(deep)].traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        bb.setFromObject(m);
        const tris = (m.geometry.index?.count ?? m.geometry.getAttribute("position").count) / 3;
        meshes.push(
          `${m.type} tris=${tris} c=${fmt(bb.getCenter(new THREE.Vector3()))} s=${fmt(bb.getSize(new THREE.Vector3()))}`,
        );
      });
    result.debug = { cam: b.camera.position.toArray().map((v) => +v.toFixed(2)), fov: b.camera.fov, rows, meshes };
    dbg.dispose();
  }

  if (q.get("audit") === "1") {
    // The shot audit the in-studio review uses: overlaps, camera inside a model, subject framing.
    const audit = new PolyEngine(script, { width: w, height: h, pixelRatio: 1 });
    const snapshots: ShotSnapshot[] = [];
    let start = 0;
    for (const sc of script.scenes) {
      for (const k of [0.08, 0.3, 0.5, 0.7, 0.92]) {
        const snap = audit.inspect(start + sc.duration * k);
        if (snap) snapshots.push(snap);
      }
      start += sc.duration;
    }
    audit.dispose();
    result.shotIssues = shotIssues(snapshots);
  }

  if (q.get("check") === "1") {
    // Collision audit: is the camera ever inside a model or below the ground?
    const audit = new PolyEngine(script, { width: w, height: h, pixelRatio: 1 });
    const internals = audit as unknown as Internals;
    const box = new THREE.Box3();
    const m = new THREE.Matrix4();
    const ray = new THREE.Raycaster();
    const dirs = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ].map((d) => new THREE.Vector3(...d));
    const issues: string[] = [];
    let start = 0;
    let samples = 0;
    script.scenes.forEach((s, i) => {
      if (s.kind !== "diorama") {
        start += s.duration;
        return;
      }
      for (let k = 0; k < 16; k++) {
        const t = start + (s.duration * (k + 0.5)) / 16;
        audit.renderAt(t);
        samples++;
        const b = internals.built.get(i)!;
        const cam = b.camera.position;
        const at = `scene ${i} t=${t.toFixed(2)} cam=${cam.toArray().map((v) => v.toFixed(2))}`;
        let terrainY = -Infinity;
        b.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh || !mesh.geometry || !mesh.visible) return;
          const geo = mesh.geometry;
          if (!geo.boundingBox) geo.computeBoundingBox();
          const g = geo.boundingBox!;
          if (g.max.y - g.min.y < 0.3) return;
          const big = g.max.x - g.min.x > 300;
          const std = mesh.material as THREE.MeshStandardMaterial;
          if (big) {
            // The terrain: ray-cast its height under the camera.
            if (std?.isMeshStandardMaterial && std.vertexColors) {
              ray.set(new THREE.Vector3(cam.x, 500, cam.z), new THREE.Vector3(0, -1, 0));
              const hit = ray.intersectObject(mesh, false)[0];
              if (hit) terrainY = Math.max(terrainY, hit.point.y);
            }
            return;
          }
          const im = mesh as THREE.InstancedMesh;
          if (im.isInstancedMesh) {
            // Exact oriented test: the camera in each instance's local space.
            const local = new THREE.Vector3();
            const inner = g.clone().expandByScalar(-0.05);
            for (let n = 0; n < im.count; n++) {
              im.getMatrixAt(n, m);
              m.premultiply(im.matrixWorld);
              local.copy(cam).applyMatrix4(m.clone().invert());
              if (inner.containsPoint(local)) issues.push(`${at} inside instance ${n} of ${im.count}`);
            }
            return;
          }
          box.copy(g).applyMatrix4(mesh.matrixWorld).expandByScalar(-0.05);
          if (!box.containsPoint(cam)) return;
          // Merged meshes span gaps between parts, so test real surfaces:
          // a clip is a surface within 0.15 m; inside is back faces all round.
          const mat = mesh.material as THREE.Material;
          const side = mat.side;
          mat.side = THREE.DoubleSide;
          let near = false,
            backs = 0;
          const nrm = new THREE.Vector3();
          for (const d of dirs) {
            ray.set(cam, d);
            const hit = ray.intersectObject(mesh, false)[0];
            if (!hit) continue;
            if (hit.distance < 0.15) near = true;
            if (hit.face && nrm.copy(hit.face.normal).transformDirection(mesh.matrixWorld).dot(d) > 0) backs++;
          }
          mat.side = side;
          if (near || backs >= 4) issues.push(`${at} inside ${mesh.parent?.type ?? "mesh"}`);
        });
        if (cam.y < terrainY + 0.1) issues.push(`${at} below ground (${terrainY.toFixed(2)})`);
      }
      start += s.duration;
    });
    audit.dispose();
    result.collisionSamples = samples;
    result.collisionIssues = issues.slice(0, 30);
    result.collisionIssueCount = issues.length;
  }

  if (q.get("perf") !== "0") {
    // Steady-state frame cost at export resolution, GPU-synchronised.
    const perf = new PolyEngine(script, { width: portrait ? 720 : 1280, height: portrait ? 1280 : 720, pixelRatio: 1 });
    const fps = 30;
    const full = q.get("full") === "1";
    const frames = full ? Math.floor(script.totalDuration * fps) : 45;
    const first = script.scenes.findIndex((s) => s.kind === "diorama");
    const base = full ? 0 : script.scenes.slice(0, Math.max(0, first)).reduce((a, s) => a + s.duration, 0);
    const t1 = performance.now();
    for (let i = 0; i < frames; i++) {
      perf.renderAt(base + i / fps);
      sync(perf);
    }
    const total = performance.now() - t1;
    perf.dispose();
    result.frames720 = frames;
    result.totalMs720 = Math.round(total);
    result.frameMs720 = Math.round((total / frames) * 10) / 10;
  }
  return result;
}

(q.get("encode") === "1" ? encodeFilm() : q.get("models") ? compareModels() : renderFilm())
  .then((result) => {
    window.__result = result;
    document.getElementById("stats")!.textContent = JSON.stringify(result);
  })
  .catch((e) => {
    window.__result = { error: String(e?.stack || e) };
    document.getElementById("stats")!.textContent = String(e?.stack || e);
  });
