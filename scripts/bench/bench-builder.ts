// Builder model A/B benchmark (live Gemini; costs money, ~2-4 min per prompt).
//
// For each prompt: moderate -> research -> ONE model plan, then build that same
// plan once per builder model. Only the geometry builder differs, so the
// comparison isolates builder quality and latency. With --films, also runs the
// full pipeline (writeScript) once per builder for end-to-end timing and
// renderable films.
//
//   npm run bench:builder -- [--builders=gemini-3.8-flash,gemini-4-argon] [--films] [--prompts=0,2]
//
// Writes tmp/bench/builder-<stamp>/ (git-ignored): results.json, summary.txt,
// plan-<n>.json, models-<n>-<builder>.json and film-<n>-<builder>.json.
// A disposable user is created for the run and fully deleted afterwards.
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { buildModels, moderate, planModels, researchEvent, writeScript } from "../../lib/server/gemini";
import { query } from "../../lib/server/db";
import { deleteAccountData } from "../../lib/server/account";
import { ModelLibrary } from "../../lib/lowpoly/compiler";
import type { ModelDefinition } from "../../lib/schema/model";
import type * as THREE from "three";

const PROMPTS = [
  "How did Tower Bridge in London open in 1894, and how do its bascules lift so tall ships can pass?",
  "How did Gutenberg's printing press work inside his Mainz workshop around 1450?",
  "How did the Wright brothers make the first controlled powered flight at Kitty Hawk in 1903?",
];
const DURATION = 20;

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const builders = (arg("builders") ?? "gemini-3.8-flash,gemini-4-argon").split(",");
const films = process.argv.includes("--films");
const chosen = arg("prompts") ? arg("prompts")!.split(",").map(Number) : PROMPTS.map((_, i) => i);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out = `tmp/bench/builder-${stamp}`;
mkdirSync(out, { recursive: true });

interface Events {
  fastFallback: number;
  validationRetry: number;
  incomplete: number;
}
interface ModelStats {
  id: string;
  category: string;
  parts: number;
  materials: number;
  repeatedParts: number;
  animatedParts: number;
  triangles: number;
  size: number[];
  requested: number[];
  dimensionDrift: number | null;
}
interface Run extends Events {
  seconds: number;
  failed?: string;
}
interface Entry {
  prompt: string;
  researchSeconds: number;
  planSeconds: number;
  builds: Record<string, Run & { models?: ModelStats[] }>;
  films: Record<string, Run & { scenes?: number }>;
}

/** Counts the pipeline's own fallback/retry log lines while a build runs. */
function watchConsole() {
  const events: Events = { fastFallback: 0, validationRetry: 0, incomplete: 0 };
  const warn = console.warn,
    error = console.error;
  console.warn = (msg?: unknown, ...rest: unknown[]) => {
    if (String(msg).includes("retrying this object with fast builder")) events.fastFallback++;
    else if (String(msg).includes("Model validation retry")) events.validationRetry++;
    else warn(msg, ...rest);
  };
  console.error = (msg?: unknown, ...rest: unknown[]) => {
    if (String(msg).includes("Model generation incomplete")) events.incomplete++;
    else error(msg, ...rest);
  };
  return {
    events,
    stop() {
      console.warn = warn;
      console.error = error;
    },
  };
}

/** Geometry statistics and how closely each result honours the plan's dimensions. */
function stats(
  models: ModelDefinition[],
  plan: { models: { id: string; proportions: { dimensions: number[] } }[] },
): ModelStats[] {
  const lib = new ModelLibrary(models);
  const rows = models.map((m) => {
    const inst = lib.instance(m.id);
    let tris = 0;
    inst?.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) tris += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3;
    });
    inst?.dispose();
    const b = lib.bounds(m.id);
    const want = plan.models.find((p) => p.id === m.id)?.proportions.dimensions ?? [];
    // Mean absolute log ratio over [depth, height, width]: 0 = exact, 0.69 = off by 2x.
    const got = [b.size.x, b.size.y, b.size.z];
    const drift =
      want.length === 3
        ? got.reduce((a, g, i) => a + Math.abs(Math.log(Math.max(0.01, g) / Math.max(0.01, want[i]))), 0) / 3
        : null;
    return {
      id: m.id,
      category: m.category,
      parts: m.parts.length,
      materials: m.materials.length,
      repeatedParts: m.parts.filter((p) => p.repeat || p.mirror).length,
      animatedParts: m.parts.filter((p) => p.animation?.length).length,
      triangles: Math.round(tris),
      size: got.map((v) => +v.toFixed(2)),
      requested: want,
      dimensionDrift: drift == null ? null : +drift.toFixed(3),
    };
  });
  lib.dispose();
  return rows;
}

const failure = (e: unknown, fallback: string) => (e instanceof Error ? e.message.slice(0, 160) : fallback);

function summary(results: Entry[]) {
  const lines = [`Builder A/B ${stamp}`, `builders: ${builders.join(" vs ")}`, ""];
  for (const r of results) {
    lines.push(r.prompt, `  research ${r.researchSeconds.toFixed(1)}s, plan ${r.planSeconds.toFixed(1)}s`);
    for (const b of builders) {
      const x = r.builds[b];
      if (x?.failed) lines.push(`  ${b}: FAILED after ${x.seconds.toFixed(1)}s (${x.failed})`);
      else if (x?.models) {
        const avg = (f: (m: ModelStats) => number) =>
          (x.models!.reduce((a, m) => a + f(m), 0) / x.models!.length).toFixed(2);
        lines.push(
          `  ${b}: build ${x.seconds.toFixed(1)}s, fallbacks ${x.fastFallback}, retries ${x.validationRetry}, ` +
            `parts ${avg((m) => m.parts)}, materials ${avg((m) => m.materials)}, tris ${avg((m) => m.triangles)}, ` +
            `animated ${avg((m) => m.animatedParts)}, dimension drift ${avg((m) => m.dimensionDrift ?? 0)}`,
        );
      }
      const f = r.films[b];
      if (f) lines.push(`    full film: ${f.failed ? `FAILED (${f.failed}) ` : ""}${f.seconds.toFixed(1)}s`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  // Remove any disposable users left by an interrupted earlier run.
  const { rows: stale } = await query<{ id: string }>(
    "SELECT id FROM ph_users WHERE email LIKE 'builder-bench-%@example.invalid'",
  );
  for (const row of stale) await deleteAccountData(row.id);
  const userId = randomUUID();
  for (const sig of ["SIGINT", "SIGTERM"] as const)
    process.once(sig, () => {
      deleteAccountData(userId).finally(() => process.exit(130));
    });
  await query("INSERT INTO ph_users(id,name,email,password_hash) VALUES($1,$2,$3,$4)", [
    userId,
    "Builder benchmark",
    `builder-bench-${userId}@example.invalid`,
    "disabled",
  ]);
  const results: Entry[] = [];
  try {
    for (const n of chosen) {
      const prompt = PROMPTS[n];
      const videoId = randomUUID();
      await query("INSERT INTO ph_videos(id,user_id,prompt,duration,aspect) VALUES($1,$2,$3,$4,$5)", [
        videoId,
        userId,
        prompt,
        DURATION,
        "landscape",
      ]);
      const audit = { userId, videoId };
      const signal = AbortSignal.timeout(900000);
      await moderate(prompt, false, signal, audit);
      let t = performance.now();
      const research = await researchEvent(prompt, DURATION, signal);
      const researchSeconds = (performance.now() - t) / 1000;
      t = performance.now();
      const plan = await planModels(prompt, research.research, signal);
      const planSeconds = (performance.now() - t) / 1000;
      writeFileSync(`${out}/plan-${n}.json`, JSON.stringify(plan, null, 2));
      const entry: Entry = { prompt, researchSeconds, planSeconds, builds: {}, films: {} };
      for (const builder of builders) {
        process.env.GEMINI_BUILDER_MODEL = builder;
        const watch = watchConsole();
        t = performance.now();
        try {
          const models = await buildModels(userId, research.research, plan, signal);
          writeFileSync(`${out}/models-${n}-${builder}.json`, JSON.stringify(models, null, 2));
          entry.builds[builder] = {
            seconds: (performance.now() - t) / 1000,
            ...watch.events,
            models: stats(models, plan),
          };
        } catch (e) {
          entry.builds[builder] = {
            seconds: (performance.now() - t) / 1000,
            ...watch.events,
            failed: failure(e, "build failed"),
          };
        } finally {
          watch.stop();
        }
        console.log(`prompt ${n} build ${builder}: ${entry.builds[builder].seconds.toFixed(1)}s`);
      }
      if (films)
        for (const builder of builders) {
          process.env.GEMINI_BUILDER_MODEL = builder;
          const watch = watchConsole();
          t = performance.now();
          try {
            const script = await writeScript(
              prompt,
              DURATION,
              research.research,
              userId,
              AbortSignal.timeout(260000),
              audit,
            );
            writeFileSync(`${out}/film-${n}-${builder}.json`, JSON.stringify(script, null, 2));
            entry.films[builder] = {
              seconds: (performance.now() - t) / 1000,
              ...watch.events,
              scenes: script.scenes.length,
            };
          } catch (e) {
            entry.films[builder] = {
              seconds: (performance.now() - t) / 1000,
              ...watch.events,
              failed: failure(e, "film failed"),
            };
          } finally {
            watch.stop();
          }
          console.log(`prompt ${n} film ${builder}: ${entry.films[builder].seconds.toFixed(1)}s`);
        }
      results.push(entry);
      writeFileSync(`${out}/results.json`, JSON.stringify({ builders, films, results }, null, 2));
    }
  } finally {
    await deleteAccountData(userId);
  }
  const text = summary(results);
  writeFileSync(`${out}/summary.txt`, text);
  console.log(text);
  console.log(`Wrote ${out}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Benchmark failed:", failure(e, "unknown error"));
    process.exit(1);
  });
