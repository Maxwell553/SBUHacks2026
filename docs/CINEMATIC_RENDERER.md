# Cinematic renderer

How `PolyEngine` turns an immersive script into connected, street-level shots instead of isolated models on empty terrain. This document covers the diorama path (`kind: "diorama"`); map scenes and the 2D overlay are unchanged. See [RENDERER.md](RENDERER.md) for the engine basics and the model definition format.

The public API is unchanged: `new PolyEngine(script, opts)`, `loadFonts`, `canvas`, `duration`, `boundaries`, `sceneAt`, `setSize`, `prepare`, `renderAt` and `dispose`. Everything below is a deterministic function of the script and time. There is still no named-model catalogue: every building, street, tree and prop the viewer sees is a model the script itself defined, or generic ground detail (grass, stones, shrubs, generic trees).

## Modules

| File                         | Role                                                                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/lowpoly/engine.ts`      | Lays out the shot, builds the corridor, places units, wires dressing, scatter, contact shadows, lights and the camera rig.                                     |
| `lib/lowpoly/layout.ts`      | Pure ground-plane layout: separates overlapping rest footprints, then keeps straight-line movers clear with a lane shift first and clipped travel second.      |
| `lib/lowpoly/environment.ts` | Graded terrain with an exact height lookup, world-scale ground texture, street or path ribbon, sky glow, ridges, haze, weather.                                |
| `lib/lowpoly/world.ts`       | Set dressing: street frontage, second row, closing facade and skyline built from the script's own architecture (instanced).                                    |
| `lib/lowpoly/camera.ts`      | Shot rig: eye-height moves, lens and size variation, side alternation, hand-held drift and collision.                                                          |
| `lib/lowpoly/scatter.ts`     | Instanced biome detail (tufts, stones, shrubs, generic trees) with vertex-shader wind sway.                                                                    |
| `lib/lowpoly/textures.ts`    | Procedural canvas textures: tileable ground (grass, dirt, sand, snow, rock, paving, cobble, mud, regolith), contact shadow, glow.                              |
| `lib/lowpoly/compiler.ts`    | Adds `ModelLibrary.instancedSet()`, `ModelLibrary.interior()` (room-shell measurement), `ModelBounds.size` and a ground-contact/surface-variation shader term. |

## Layouts

`scene.layout` is optional. Scripts without it keep the inferred behaviour described below.

| Layout     | Behaviour                                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| absent     | Inferred: a street corridor with frontage when the film has repeatable architecture (or `city`), otherwise open land with natural scenery.                |
| `street`   | Corridor with a paved or tracked roadway, even without buildings.                                                                                         |
| `open`     | No roadway. Repeated background buildings form loose settlement clusters (or line a waterway); structures, props and `settlement: wild` stay as authored. |
| `interior` | Room shot (see below). No frontage, skyline, scatter or weather particles.                                                                                |

**Interior shots.**

- **Room detection.** The room is the largest architecture element that `ModelLibrary.interior()` recognises: the biggest floor slab clipped to the inner faces of thin, tall walls, with walls on at least two sides. The measurement comes from the model's actual parts, including repeats and mirrors, not its bounding box.
- **Placement.** The room stands at its `offset` (or the origin). It is turned so an open side faces the camera: local +x by the planning contract, otherwise whichever side has no wall. An explicit `facing` is honoured.
- **Actors.** Every other element is kept inside the measured walls and stands on the floor slab.
- **Ceiling and light.**
  - A ceiling at wall height, visible from below only, shades the room. Sunlight enters through the open side and windows; overhead moves can still see in.
  - A warm bounce light fills the room, and haze is nearly off.
  - The shadow box covers the whole room.
- **Camera.** The lens is 8° wider, and the camera stays within the walls and below the ceiling.

## Settlement and waterfronts

Three optional scene fields describe the place independently of `layout`: `settlement` (`wild | village | town | city`), `waterWidth` (4–300 m) and `banks` (`natural | embankment`). When they're absent, the renderer infers them from the shot's own models. No event or landmark names are used.

- **Settlement.**
  - It is `city` when the setting is `city`, or when the shot uses six or more instances of repeatable buildings (footprint at least 2 m) that are at least 7 m tall.
  - It is `town` from two such instances, `village` from one, and `wild` otherwise.
  - Its effects:
    - Frontage density: a village is one sparse row; a city adds a taller second row and a denser skyline.
    - Ground: a paved blend around the action in towns and cities.
    - Scatter density, with no generic trees in towns and cities.
- **Waterway.**
  - **When it applies.** On `setting: river`, or any non-coastal shot with water-placed models, the channel runs along the view axis when the film has a water-placed span (bridge, weir, lock), the settlement is town or city, or `waterWidth`/`banks` are set. Otherwise the legacy natural river across the view is kept.
  - **Width.** `max(12, 0.62 × longest span, 1.6 × longest vessel)` metres, fixed for the whole film so consecutive shots match.
  - **Embankments** (the default for cities) add stone river walls with coping, a 6 m paved quay and bollards. Natural banks slope and meander gently.
  - **Water units.** Spans lie across the flow and stand still; vessels sail along it.
  - **Placement and camera.** Quay buildings line both banks behind the quay. The camera keeps eye height when it steps onto a quay or bank.
- **Coast.** The sea normally lies behind the action. When the shot's subject is a vessel, it lies toward the camera instead, with the shoreline behind the subject (half the hull's length plus 6 m, at least 10 m). Seen across land, a hull reads as beached. Vessels are placed so the whole hull is afloat, not just its centre.
- **Open-land settlements.** Buildings form a few loose clusters behind and beside the action. Their fronts turn roughly toward it, they never stand on the camera's side, and they're spaced by real footprint.

The renderer-side contract and its inference rules are recorded in `tmp/cinematic/notes/cursor-world-contract.txt`.

## Per-scene pipeline (immersive)

1. **Layout pre-pass.**
   - Each element gets an anchor from its `offset` (absolute metres) or its `position`.
   - The focus is the mean of the subject anchors.
   - Mis-scaled figures are normalised: a `figure` outside 1.0–2.4 m tall is rescaled to 1.72 m, and `scale` still applies on top.
2. **Frontage absorption.**
   - A `background` element with `count ≥ 2` whose model is eligible scenery becomes street frontage instead of loose props.
   - Eligible scenery means architecture or vegetation that the film uses as a multi-instance background, or buildings used in multiples. Landmark-sized models (over 30 m) are excluded.
   - One-off landmarks (a single fountain, a temple) and props such as rubble are never cloned. They stay placed exactly where the director put them.
3. **Corridor (the street).**
   - **Axis and centre.** The street runs along z through the actors (people, vehicles, props). With no actors, it runs between architecture placed on opposite sides.
   - **Width.**
     - It clears the actors.
     - Lateral frontage offsets act as a hint.
     - Director offsets are not size-aware, so side-placed architecture subjects are pushed outward just enough to clear the roadway, keeping their side.
     - The resulting half-width is clamped to 2.6–28 m.
   - **Closing facade.** A frontage element centred behind the subject (|Δx| < 2.5 m, z behind the action) becomes a camera-facing facade that closes the street.
4. **Environment.**
   - **Terrain.** A 160 × 160 graded grid centred on the focus, about 0.7 m cells near the action and about 11 m at the edge. The ground under the street, the action and both frontages is flattened, and hills rise beyond. `heightAt` interpolates the exact rendered triangles, so contact is exact; water is preserved.
   - **Ground surfaces.**
     - World-scale procedural texture on the terrain, one tile per 4 m.
     - A street ribbon along the corridor: cobbles with kerbs in `city`, a dirt, sand, snow or mud track elsewhere. It skips water.
     - Open land (no buildings, or `layout: open`) gets no ribbon, and only the ground around the action is levelled.
   - **Light and atmosphere.**
     - Sun azimuth is side-on by day and low back-light at dawn and dusk.
     - The sky dome has a sun glow, plus a halo sprite.
     - Two rings of distant ridge silhouettes, with baked aerial perspective.
     - Exponential haze per weather.
5. **Units.**
   - Units are placed as before, except that architecture formations are spaced by real footprint rather than diagonal radius.
   - **Separation.** `layout.ts` pushes overlapping footprints apart, then checks each straight-line mover's swept path. A mover that would run into a standing unit or another mover shifts sideways into a clear lane, or stops short if no lane is free.
   - **Ground contact.** Units sit on the highest of five footprint samples so wide models do not sink into sloped terrain. The model's lowest point is dropped to the ground, with a small sink.
   - **Aircraft.**
     - An air-placed model rests on the ground unless its motion is `fly` (animals excepted).
     - `launch` on an air-placed model is a take-off: an accelerating ground roll from behind the rest position, then a climb-out with slight pitch, its contact shadow shrinking as it climbs. Rockets and other ground launches keep the vertical rise.
     - Flight altitude is relative to the terrain below. Immersive cruise altitude scales with the aircraft's own size (at least 3 m), and airborne movers may cover more ground per shot so the motion reads.
6. **Set dressing (`world.ts`).**
   - **Street rows.**
     - Two frontage rows per side face the street, spaced by real footprint.
     - Rows have setbacks, occasional alleys, ±10% scale and 0.92–1.2 roofline height variation.
     - They avoid units, water and each other.
   - **Beyond the street.** A hazy skyline band beyond the end of the street, plus occasional greenery when the script defines vegetation.
   - **Instancing.** Everything is GPU-instanced: one draw call per (model, variant, finish). Animated pivots are frozen at rest.
   - **Fire and blasts on frontage.** Frontage with `motion: burn` or `explode` keeps its consequence: fire and smoke (or blasts) on the nearest facades on that side of the street.
   - **Natural scenery** (no architecture in the pool) is never lined up.
     - Upright growth such as trees and rocks forms irregular, noise-thinned clusters with random yaw.
     - Low, wide landforms such as dunes and hills are pushed far out (22–210 m) and scaled up with distance.
     - The view between the camera and the subject stays open.
7. **Scatter.** Biome tufts, stones and shrubs, plus generic trees only when the script brings no `nature` model. They are kept off the street, units and dressing.
8. **Contact shadows and ambient occlusion.**
   - Instanced soft blobs under every grounded unit (updated as units move) and under nearby set pieces.
   - The finish materials darken surfaces just above the ground plane and add blocky object-space brightness variation that breaks up flat faces.
9. **Camera (`camera.ts`).**
   - **Shot size.** Framed on real subject bounds. A lone or clearly dominant subject is framed on 1.2–1.25 × its own radius, not the box diagonal of everything around it.
   - **Broadside view.** When the main subject is much deeper along the view axis than it is wide (a side-on wingspan, a bow-first hull), the camera swings about 50° to a three-quarter view.
   - **Airborne subjects.** The camera stays at ground eye height. Its aim rises with the subject's live, size-weighted altitude, and it backs off enough to keep the look-up angle comfortable.
   - **Building subjects.** A row of subject buildings is framed on its camera-nearest buildings, seen from the street, and allowed to recede.
   - **Collision.**
     - Below roof height the camera stays inside a paved street (open land has no such clamp), or inside an interior's walls and below its ceiling.
     - It is pulled toward the subject when it would enter set dressing.
     - It is pushed radially out of any acting model (live footprints).
     - It stays at least 0.14 m above the ground.
10. **Light rig.**
    - **Key.** The sun is the key light. Its shadow box rides ahead of the camera every frame, snapped to whole shadow texels in light space so edges never shimmer. It uses a 2048 map, or 4096 when the box exceeds 40 m.
    - **Fill and rim.** A soft camera fill, plus a rim light from behind: warm at dawn and dusk, cool at night.
    - **Night streets.** Four lamp pools along the street.
    - **Haze cap.** Density is capped so at most ~30% fog (about 55% in `fog` weather) reaches the subject distance.

Classic presentation keeps its elevated diorama framing (with the tighter framing values from the last engine tuning). It still benefits from the new terrain, textures, scatter, ridges and haze. It has no corridor and no frontage.

## How director fields are read

| Field                              | Immersive interpretation                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `role: subject`                    | Frames the shot; never cloned unless the same model is also eligible scenery (then at half weight).        |
| `role: background`, count ≥ 2      | Street frontage for eligible architecture/vegetation; otherwise placed as units (e.g. a background crowd). |
| `role: foreground`                 | Placed as units near the camera; the camera never enters them.                                             |
| `offset {x, z}`                    | Absolute metres. Lateral frontage offsets hint street width; centred far-back frontage closes the street.  |
| `camera`                           | See the shot table below.                                                                                  |
| `motion: burn/explode` on frontage | Fire and smoke, or blasts, on the nearest facades on that side.                                            |

| Move                                             | Shot                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `eye_level`                                      | Eye-height (0.35–1.65 m) slow dolly-in, slight three-quarter angle.     |
| `tracking`                                       | Lateral eye-height slide inside the street, following moving subjects.  |
| `push_in` / `pull_out`                           | Dolly in at eye height, or pull back while rising to reveal the street. |
| `orbit`                                          | Eye-height arc of about ±30°.                                           |
| `pan_left` / `pan_right`                         | Fixed eye-height camera sweeping its aim across the scene.              |
| `low_angle`                                      | Camera 0.16–0.42 m off the ground, looking up, slow drift.              |
| `crane_up` / `crane_down`, `flyover`, `top_down` | Elevated moves (rooftop reveals, overheads).                            |
| `static`                                         | Eye level with gentle hand-held drift.                                  |

Shots alternate sides between consecutive scenes. Lens (about 44–66° vertical) and size vary by move and scene index, so cuts read as coverage rather than repeats. Shots are composed for the current orientation; flipping between portrait and landscape in `setSize` rebuilds them.

## Verification

All of this ran in the visual harness (`tools/visual-harness/`, run with `npm run visual:build && npm run visual:serve`). It renders a contact sheet per fixture in landscape and portrait, an automated collision audit, and GPU-synchronised timings. The curated fixtures and what each one exercises are listed in `tools/visual-harness/fixtures/README.md`.

Fixtures:

- London 1666 (`24bbc42c…`, 8 scenes)
- Pompeii 60 s (`8059e316…`, 7 scenes) and the earlier poor Pompeii first-HD (`4e225e63…`)
- First flight, legacy (`final20`) and fresh (`flight20-v8`)
- Printing house as a street (`9f05909a…`) and as an interior (`8ec460ab…`, `layout: interior`)
- Jamestown and Columbus (classic)

- **Collision audit.**
  - The audit samples 16 frames per scene.
  - **Instanced dressing.** The camera is tested against each instance's box.
  - **Other meshes.** Whenever a mesh's box contains the camera, real surfaces are tested: six rays detect a surface within 0.15 m or back-face hits that mean the camera is inside a solid. Merged room walls therefore don't false-alarm.
  - **Terrain.** The camera is tested against the raycast terrain height.
- **Results.** 0 issues in every run:
  - London: 112 samples, landscape and portrait.
  - Pompeii 60 s: 112.
  - Interior: 96.
  - First flight, legacy and fresh: 64 each.
  - Old Pompeii: 64.
  - Jamestown and Columbus: 80 each.
- **Performance.** Scene build plus first frame takes 30–130 ms after the first shader compile (about 0.4–1.4 s once per engine). A full 60 s London film renders at 1280 × 720, 30 fps (1800 frames, scene builds and overlay included, no encoding) in 3.3 s, about 1.8 ms per frame.
- **Tests.** `npx tsc --noEmit`, `npx eslint lib/lowpoly`, `npx prettier --check lib/lowpoly` and `npm run test:unit` pass. `scripts/tests/test-generated-film.ts` passes on the London, Pompeii, flight, street printing-house and interior fixtures.

## Limitations

- **Few outdoor archetypes.** Outdoor scenes are either a straight corridor along z or open land. There are no intersections, curved streets, plazas, harbour quays or bridges. Squares and waterfronts are approximated by wider corridors and closing facades.
- **Interior requirements.**
  - The room must be one generated shell with a floor slab and thin walls (at least 2 m tall, at most 0.8 m thick) on two or more sides; anything else falls back to an outdoor layout.
  - The renderer adds only a ceiling plane and lights, never walls, so interior quality depends on the shell.
  - Props are clamped inside the walls but not de-overlapped with furniture modelled into the shell.
  - The ceiling uses the shell's darkest material colour.
- **Inferred street geometry.** Street width and centre are inferred from approximate, not size-aware, director offsets. Side-placed architecture subjects may be moved outward from their authored x to clear the roadway.
- **Repetition.** Frontage repeats the film's few eligible models. Variation is limited to material variants, tint jitter, uniform scale and vertical stretch (which also stretches windows). A film whose only building is a small booth produces a street of booths.
- **Static dressing.** Instanced set pieces have their animated pivots frozen and their effects (flags, fire parts) dropped. Only `burn` and `explode` on frontage get added effects; `collapse` on frontage is not shown.
- **Ocean and orbit scenes** get no corridor and no dressing.
- **Generic trees.** Without a script `nature` model, scatter trees are biome-generic, not period or region specific.
- **Approximate collision.** The camera tests circles and heights, not meshes. A very irregular model (long overhangs, arches) could still be grazed.
- **Aircraft heuristics.**
  - "Not flying means parked" applies to every air-placed non-animal, so a tethered balloon or a hovering craft with an `idle` motion sits on the ground.
  - The take-off path follows the authored heading. A take-off authored toward the camera approaches it, and the rig follows rather than cutting away.
- **Single shadow map.** The sun shadow covers about 1.4 × the box size ahead of the camera. Beyond that, long views keep only contact shadows and ground darkening. The 4096 map used for wide shots costs about 64 MB of GPU memory while a scene is live, and two scenes can be live at once.
- **Single ground level.** Ground-contact darkening uses one ground level per scene, so on steep terrain models well below that level read darker.
- **Figures.** Only gross height errors are normalised. Limb proportions, buried doors and windows, and dark base slabs come from the generated geometry and are not corrected by the renderer.
- **No post-processing.** There is no depth of field, bloom or vignette, which keeps frame cost low. The overlay is unchanged by this work.
- **Lighting choices.** Night lamp pools are four fixed point lights along the street. Sun side and time-of-day colour come from the seed and scene, not from the script.

## Authored shot coverage

The optional `scene.shotSize` field accepts `wide`, `medium`, or `close`. It scales the immersive camera distance to establish the location, frame the main action, or crop into the subject for detail. Collision and room boundaries still apply. When omitted, existing films retain their previous framing.

## Proposed minimal schema additions (not implemented)

These are optional fields the director could set to replace inference. Each degrades to today's behaviour when absent. `scene.layout` (`open | street | interior`) has since been added by the schema owner and is supported above.

- More `scene.layout` values, `square` and `waterfront`, would add a ring of frontage around a plaza and a single frontage plus quay.
- `scene.streetWidth?: number` (3–30 m) would give an explicit roadway width instead of inferring it from offsets.
- `element.role: "frontage"` would give an explicit "line the street with this model" intent, distinct from a background crowd or one-off landmark, instead of the current `background` + `count ≥ 2` + eligibility rule.

- `scene.keyLight?: "left" | "right" | "back"` would set the sun side for continuity across consecutive shots; today it comes from the seed.

### Structural aftermath

`scene.structureState: "ruined"` compiles building and structure models into deterministic broken wall stumps and settled upper-floor debris. It transforms the actual generated geometry, including repeated scenery, without a named ruin catalog or additional model-provider calls. Figures, animals and other categories remain unchanged. The original stored definitions are immutable; omitted or `intact` preserves existing films. This is an illustrative aftermath state, not a physics simulation of collapse.

### Physical animation pivots

A generated part can set `animationPivot` in its local coordinates. Rotation and scaling then preserve that physical joint while the rest geometry remains unchanged; position animation still translates the part. This lets motion repair articulate an existing centered limb without rebuilding its mesh. Articulated models must have at least two rotational joints (or a mirrored/repeated pair). Root bobbing and scale flicker alone do not satisfy the motion requirement.

Ground contact uses the full compiled vertical bounds, including geometry below the model origin. Both negative and positive origins are aligned to the floor with a small contact overlap; camera height uses the complete grounded extent. This prevents generated feet and wheels below an arbitrary origin from being buried.

Camera fitting uses a geometry-centred footprint, separate from conservative origin-relative collision bounds. The live follow point rotates the model’s horizontal bounds centre with the actor, so an offset origin does not widen the shot or move its target into empty space.

Generated parts can use `attachTo` to connect their geometry to a face of their parent primitive. The optional `position` slides along that face; its perpendicular component is ignored. The opposite child bound, after rest rotation, is aligned to the parent face to guarantee contact. For example, a neck with `attachTo: "top"`, `anchor: "bottom"` and zero position connects directly to the torso top. Bounds include the parent’s own anchor and actual primitive geometry; parent rotation and animation carry the attachment normally. Groups have no geometric face, so use explicit positions for group parents. Existing models without `attachTo` keep their original coordinate semantics.

Model planning distinguishes `instancePolicy: "unique"` from `"repeatable"`. Unique models represent complete singular objects, retain at most one instance per shot, and are excluded from automatic scenery repetition. Ordinary architecture and vegetation remain reusable. The policy is event-specific metadata, not a named landmark catalog.

The `truss` primitive constructs an open rectangular frame from four corner posts, horizontal rings and X braces. `size` sets base width, height and depth; `taper` sets the top/base ratio; `segments` selects 3–8 vertical bays; optional `beamWidth` controls member thickness. Rotating a frame supports bridge spans and crane booms. Triangle budgeting counts every beam, and the geometry follows normal anchors, attachments and transforms. It contains no landmark-specific presets.

### Preserve complete generated objects

When a model exceeds the triangle budget, normalization reduces primitive tessellation before considering part removal. Live builders require complete normalization: if a depth, node or triangle limit would delete a part, construction retries with a simpler complete model rather than saving a partial silhouette. This is especially important for repeated open lattice frames. The triangle and expanded-node caps remain unchanged. Rig depth is bounded at 12 levels, allowing articulated limbs and held tools without deleting their distal parts.

### Primitive orientation and rig orientation

`geometryRotation` orients only a primitive before its anchor is aligned. Its children keep their local coordinate frame. `rotation` still rotates the whole hierarchy. Generated parts explicitly choose both their anchor/attachment mode and primitive orientation; this lets a horizontal torso or chassis retain upright child joints without a named rig template.

### Architectural coverage and historical continuity

Repeated architectural subjects in street layouts form facing rows outside the roadway. Scenery is selected from the current scene, or carried forward from the last established setting for detail shots; later rebuilding assets no longer appear in earlier scenes. Architectural cameras aim at facades and retain whole-building coverage. When street collision constrains lateral camera position, the camera preserves its fitted distance along the street instead of becoming an unintended close-up. Wide views of low, spread-out subjects use a raised viewpoint to show the ground and aftermath.

## General geometry and motion tools

Generated films use per-request declarative models, never a named model or animation catalog. The compiler provides primitives, parent transforms, face attachments, mirror/repeat expansion, local animation channels, and named hinge points. The director chooses the event-specific geometry, action, timing and composition.

`animationAnchor` selects a hinge from the primitive's actual bounds after `geometryRotation` and `anchor` are applied. It accepts the same face names as `anchor`, including `center`, and takes precedence over `animationPivot`. Numeric pivots remain available for joints that are not at a face center. Neither field changes the rest pose. Alternating animation phases propagate through mirrored parent joints, so a mirrored assembly does not require separately authored left/right animation data.

A successful schema check is not a visual-quality guarantee. Named hinges preserve their selected contact during rotation, but do not repair incorrectly positioned rest geometry or ensure that a generated mechanism is historically correct. Validate rendered output as well as the model contract.

Channels also accept up to eight `keyframes` with normalized scene times (`at`, 0–1) and amplitude multipliers (`value`, -1–1). Keys override the periodic wave and hold their first/last values outside the keyed interval. `interpolation` can be `linear`, `smooth` (default), or `hold`. This is a general one-shot transform tool, not an action preset. Existing periodic channels remain compatible. A reused model's keys run relative to each scene in which it appears; the director must account for that when planning continuity.
