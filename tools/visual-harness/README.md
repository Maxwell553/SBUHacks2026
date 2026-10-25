# Visual harness

A browser page that renders stored films with the real `PolyEngine` (the same code the player and exporter use) so renderer changes can be judged by eye, audited for camera collisions and timed. It needs no database or API keys.

```bash
npm run visual:build   # bundle main.ts -> tools/visual-harness/dist/bundle.js (git-ignored)
npm run visual:serve   # read-only server on http://127.0.0.1:4601
```

Then open, for example:

- `http://127.0.0.1:4601/tools/visual-harness/?f=tower-bridge-waterfront`, a landscape contact sheet with one frame per scene.
- `…?f=london-1666-street&p=1&check=1`, the same in portrait with the collision audit.
- `…?file=tmp/bench/builder-<stamp>/film-0-gemini-3.8-flash.json`, any saved film or export. The filename includes the builder model id.
- `…?models=tmp/bench/builder-<stamp>/models-0-gemini-3.8-flash.json&vs=tmp/bench/builder-<stamp>/models-0-gemini-4-argon.json`, a builder A/B. Each model is shown from both builders, from the same two views. The default benchmark compares Gemini 3.8 Flash with Gemini 4 Argon.

Rebuild after changing renderer code. The page cache-busts the bundle on every load.

## URL parameters

| Parameter          | Effect                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `f=<name>`         | Fixture from `fixtures/` (or `tmp/fixtures/`). Default: the built-in showcase script.         |
| `file=<path>`      | Any repo-relative JSON: a script, `{script}` or a saved `{video:{script}}`.                   |
| `p=1`, `big=1`     | Portrait 9:16 and larger frames.                                                              |
| `scene=<i>`        | Render only scene `i`. `at=0.55` sets where in each scene the frame is sampled.               |
| `check=1`          | Collision audit (16 samples per scene).                                                       |
| `perf=0`, `full=1` | Skip timing, or time every frame of the film at 720p and 30 fps.                              |
| `debug=<i>`        | Camera and object report for scene `i`; add `deep=<k>` to list the meshes of scene child `k`. |
| `set=field:value`  | Override a field on every scene, e.g. `set=settlement:town`. Repeatable, for A/B checks.      |
| `models`, `vs`     | Builder comparison mode (see above).                                                          |

## Collision audit

For each sample frame the audit tests the camera in three ways:

- **Instanced set dressing.** The camera is tested inside each instance's own oriented geometry box.
- **Merged meshes,** such as room shells or model finishes. Their boxes span the empty space between parts, so the audit tests real surfaces with six rays: a surface within 0.15 m counts as a clip, and back faces in every direction count as being inside a solid.
- **Terrain.** The camera must stay at least 0.1 m above the ray-cast terrain height.

## Results

`window.__result` holds the JSON results: build and first-frame times, the collision audit, timings and the debug report. `window.__sheet` holds the contact sheet as a JPEG data URL.

To save the sheet from a browser-automation response file:

```bash
node tools/visual-harness/save-sheet.mjs <response.json> tmp/shots/<name>.jpg
```

## Fixtures

`fixtures/` holds curated generated films used as regression cases. [`fixtures/README.md`](fixtures/README.md) says what each one exercises. Keep them small, and never add personal data.
