# Scripts, models and the renderer

A PolyChronicle film is described entirely by data. Two zod schemas define it, and both are used on the server and in the browser:

| Contract          | Source of truth       | Produced by                                          |
| ----------------- | --------------------- | ---------------------------------------------------- |
| `VideoScript`     | `lib/schema/video.ts` | Gemini storyboard step → `normalizeVideoScript()`    |
| `ModelDefinition` | `lib/schema/model.ts` | Gemini model builders → `normalizeModelDefinition()` |

Read the schema files for the exact field lists and limits. This page explains how the pieces fit together.

## VideoScript

- **Top level:** title, subtitle, date label, location, coordinates, palette, optional factions, a `seed`, `totalDuration` (20–60 s), the `models` used by the film, and 3–12 `scenes`.
- **Scenes:** `kind` (`diorama` or `map`), duration (2.5–10 s), kicker and caption text, plus the environment (setting, time of day, weather) and a camera move. Optional direction fields are `layout` (`open`, `street`, `interior`), `shotSize` (`wide`, `medium`, `close`), `settlement`, `waterWidth`, `banks` and `structureState` (`intact` or `ruined`). [CINEMATIC_RENDERER.md](CINEMATIC_RENDERER.md) explains how each one is read.
- **Elements:** each diorama scene places up to 16 elements. An element references a model **by id** and adds a count, formation, position, motion, optional facing, colour (tint), scale and label. Immersive films can also give an element a `role` (`subject`, `background`, `foreground`) and an absolute `offset` in metres.
- **Map scenes:** these carry `lat`, `lon`, a label, a zoom level and an optional route, which is drawn as a great-circle arc on the faceted globe.

`normalizeVideoScript()` is lenient by design. It maps aliases, clamps ranges, resolves model references by id or name, scales element counts to the per-scene budget, prunes unused models, limits text to glyphs the custom fonts contain (`sanitizeText`), and rescales scene durations so they sum exactly to the requested length. After repair it validates strictly.

## ModelDefinition

There is **no fixed catalogue** of models. For every request Gemini designs new low-poly models as declarative data:

- **Materials:** colour and finish (`matte`, `satin`, `metal`, `glass`, `emissive`, `cloth`), with optional `tint` (recoloured per element), colour `variants`, and `nightGlow`.
- **Parts:** a flat list linked by `parent` ids. Shapes are `box`, `wedge`, `cylinder`, `cone`, `sphere`, `dome`, `ico`, `capsule`, `torus`, `hull`, `extrusion`, `lathe`, `truss` (an open lattice frame) and `group` (a pivot), plus the effect primitives `flag`, `fire`, `smoke` and `explosion`.
- **Transforms:** `position`, `rotation` and `anchor`, with `mirror` and `repeat` (linear or radial) for symmetric or repeated detail. `geometryRotation` orients only the primitive, not its children, and `attachTo` snaps a part onto a face of its parent.
- **Animation channels:** a deterministic wave (`sine`, `spin`, `pulse`, `bounce`) on rotation, position or scale. Up to eight `keyframes` in normalized scene time override the wave for one-way actions, with `linear`, `smooth` or `hold` interpolation. A channel can play `always`, only when the element is `moving`, or only when `idle`. `animationAnchor` (a face name) or `animationPivot` (a point) sets the hinge.
- **Instance policy:** `unique` models (a named landmark or vessel) appear at most once per shot; `repeatable` ones can fill a street or a forest.

Conventions: units are metres, +y is up, +x is the model's front, and the origin sits on the ground (or the waterline) at the centre of the footprint. `MODEL_LIMITS` sets hard caps on parts, expanded nodes, triangles, rig depth, channels and JSON size. `analyzeModel()` enforces them, and `normalizeModelDefinition()` trims trailing parts until a model fits.

The builder prompt documents the format (`MODEL_FORMAT_GUIDE` in `lib/schema/model.ts`) and attaches the example films in `references/`; it gives no construction rules. `lib/content/model-examples.ts` holds a few hand-written definitions for the home page, the sign-in screen and the sample reel. They are never sent to Gemini.

## Compiler

`lib/lowpoly/compiler.ts` is the only code path from a definition to geometry:

1. Expand the part tree, including mirror and repeat copies. Mirrored subtrees are conjugated by the reflection so their transforms stay proper.
2. Build each primitive (non-indexed, flat-shaded, anchored) and cache it by shape parameters.
3. Bake every static subtree into **one vertex-coloured mesh per finish**. Only animated nodes and effects become separate pivots.
4. Cache compiled templates per model, tint, colour variant and night mode. Instances share buffers and only allocate pivots and effects.
5. Evaluate animation channels as pure functions of time, then apply them in the pivot's local frame.

## Engine

`PolyEngine` (`lib/lowpoly/engine.ts`) renders a script:

- **Scene building.** Scenes are built lazily, at most two at a time. Each one combines a procedural environment (`environment.ts`) with element instances laid out in formations.
- **Placement.** Ground models follow the terrain height, water models float at the waterline (water is added when needed), and air models fly above the subject. `layout.ts` keeps placed footprints apart and stops moving units short of anything in their path.
- **Camera.** Framing comes from the real bounds of the placed models. Distance, clipping planes, spacing, speeds and effect sizes scale with the subject, so a printing press and an army both fill the frame.
- **Output.** `renderAt(t)` renders the WebGL frame and composites the 2D overlay (`overlay.ts`) onto an output canvas. The live `Player` component and the exporter share the same engine.

## Export

`lib/render/movie.ts` renders each frame at a fixed timestep: 30 fps at 1280×720 (landscape) or 720×1280 (portrait). Frames and the synthesized soundtrack (`lib/audio/soundtrack.ts`) are encoded with WebCodecs through Mediabunny: H.264/AAC MP4 where the browser supports it, otherwise VP9/Opus WebM. A browser without WebCodecs gets a clear message instead of a broken file. A movie over 32 MiB is rejected. A 960×540 (or 540×960) JPEG poster is captured by `renderPoster()` in `lib/render/export.ts`.

`lib/client/save.ts` uploads the movie, then the poster (a failed poster upload doesn't stop the save), then refreshes the video.

The older GIF exporter (`exportVideo()` in `lib/render/export.ts`, with `gif.worker.ts`) is kept for the development-only `/dev/export` harness, and stored GIFs from earlier films still play.

## Fonts in the canvas

`overlay.ts` loads Facet, Tessera and Tessera Mono through the FontFace API before the first frame. Generated text is limited to the glyph set in `lib/typography/charset.json`: Latin-1 and common Central European accents. Other scripts are transliterated at authoring time or stripped during normalization.

## Immersive scenes and audio

New films use `presentation: immersive`: continuous seeded terrain, eye-level/tracking camera options, subject-based framing, background/foreground roles and bounded x/z offsets. Older scripts remain supported. Model parts name their materials explicitly.

There is no voiceover. `lib/audio/ambience.ts` synthesizes environmental sound for the live player, behind an Ambience switch. It starts only after user interaction and stops when the film is paused or the tab is hidden. Saved HD films carry a deterministic stereo soundtrack rendered by `lib/audio/soundtrack.ts`.
