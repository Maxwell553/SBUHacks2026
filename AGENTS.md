<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agent guide

PolyChronicle is a Next.js 16 / React 19 app that turns a history question into a 20–60 s low-poly film. Gemini 3.8 Flash (`gemini-3.8-flash`) researches the event with Google Search, moderates it and plans the models. Gemini 4 Argon (`gemini-4-argon`) builds the geometry, writes the storyboard and reviews the draft. The browser renders the film with Three.js and saves it as an HD video. Data lives in TigerData (PostgreSQL). Read `README.md` first, then `docs/ARCHITECTURE.md`. Model ids and overrides are in `.env.example` and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Commands

```bash
npm run dev             # local server (Turbopack)
npm run check           # typecheck + eslint + prettier --check + unit checks (no network)
npm run build           # production build
npm run test:audit      # DB-backed moderation audit checks (add -- --live for Gemini)
npm run test:backend    # HTTP integration suite against a running local server
npm run format          # prettier --write .
npm run visual:build && npm run visual:serve   # renderer visual QA harness (tools/visual-harness)
npm run bench:builder -- --films               # live builder-model A/B (costs Gemini calls)
```

Run `npm run check` before handing work back. Run the DB and live suites when you touch `lib/server/`, `app/api/` or `db/`.

## Layout

| Path                                                          | What lives there                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`                                                        | Routes. `app/api/**` are route handlers (Node runtime).                                                                                                                                                                                                          |
| `components/`, `components/three/`                            | Client UI and React Three Fiber scenes                                                                                                                                                                                                                           |
| `lib/schema/`                                                 | **Isomorphic** zod contracts: `video.ts` (VideoScript, `SCRIPT_AUTHORING_GUIDE`), `model.ts` (ModelDefinition, limits, `MODEL_FORMAT_GUIDE`)                                                                                                                     |
| `lib/server/`                                                 | **Server-only**: auth, db, Gemini pipeline (`gemini.ts`), per-stage model routing (`models.ts`), reference films (`references.ts`) and the film format brief (`film-format.ts`), the draft review (`review.ts`), model planning, moderation audit, media, viewer |
| `lib/client/`                                                 | Browser-only API client, chunked upload, render-and-save                                                                                                                                                                                                         |
| `lib/lowpoly/`, `lib/render/`                                 | Deterministic renderer, HD movie exporter and legacy GIF exporter                                                                                                                                                                                                |
| `lib/audio/`                                                  | Synthesized ambience (live player) and soundtrack (saved films)                                                                                                                                                                                                  |
| `lib/content/`                                                | Site config, topic ideas, example models, sample reel, studio landmark reel                                                                                                                                                                                      |
| `lib/typography/`, `lib/lowpoly/landmask.ts`, `public/fonts/` | Generated assets. Regenerate via `npm run assets:*`; never hand-edit                                                                                                                                                                                             |
| `references/`                                                 | `films/`: example films the director watches for format, pacing and look. `stills/`: frames from them for the planner and builders. Change the target by changing these files; `lib/server/film-format.ts` says what to take from them                           |
| `db/schema.sql`                                               | Idempotent schema (`npm run db:migrate`)                                                                                                                                                                                                                         |
| `docs/`                                                       | Architecture, API, renderer, safety, design, deployment                                                                                                                                                                                                          |
| `scripts/`                                                    | Node CLI scripts grouped by purpose: `assets/`, `bench/`, `checks/`, `db/`, `tests/`, plus shared helpers in `lib/`                                                                                                                                              |
| `tools/visual-harness/`                                       | Browser harness and curated fixtures for renderer visual QA (contact sheets, collision audit, timings)                                                                                                                                                           |
| `types/`                                                      | Ambient declarations for untyped packages (`gifenc`)                                                                                                                                                                                                             |
| `tmp/`                                                        | Git-ignored scratch: QA probes, benchmark runs, contact sheets (see `tmp/README.md`)                                                                                                                                                                             |

## Rules

- **No fixed model catalogue.** Generated films use per-request `ModelDefinition`s. Extend the primitives and `MODEL_FORMAT_GUIDE` in `lib/schema/model.ts`; never add named presets for generated videos. (`lib/content/model-examples.ts` is decorative: the home page, sign-in screen and sample reel. It is never sent to Gemini.)
- **Never execute generated content.** No `eval` or `new Function`. Models and scripts are data validated against `MODEL_LIMITS` and the video schema.
- **Safety is mandatory.** Every prompt and every storyboard goes through `moderate()`, which writes to `ph_audit`. Keep user-facing rejection messages generic. Don't store moderated text in audit rows.
- **Privacy.** Account deletion must remove everything tied to the user (`lib/server/account.ts`). Keep `/privacy` accurate when data handling changes.
- **Secrets.** Never print or commit `.env.local` values. Run `npm run secrets:check` before staging.
- **Determinism.** Renderer frame code must be a pure function of script and time. Use `makeRng` from `lib/lowpoly/core.ts`.
- **Imports.** `@/` alias across folders; relative paths only inside `scripts/`.
- **Design.** Follow `docs/DESIGN.md`. Facet is for short headings only, Tessera for text, plain language in user flows, and reduced motion honoured (including WebGL loops).

## Next.js 16 gotchas

- `params` and `searchParams` are **Promises** in pages and route handlers.
- Error boundaries receive `{ error, retry }` (not `reset`). `global-error.tsx` must render its own `<html>` and `<body>`.
- `next lint` is gone. ESLint runs via `eslint.config.mjs` (flat config, `eslint-config-next`).
- Turbopack's persistent dev cache can serve stale server modules after heavy edits. Stop the server and delete `.next/`.
- To build while another process serves `.next`, build into `.builds/<name>`: `NEXT_DIST_DIR=.builds/verify npm run build`, then serve it on another port with `NEXT_DIST_DIR=.builds/verify npx next start -p 3100`. Keep every side build under `.builds/` (git-ignored); retired ones go in `.builds/archive/` or are deleted.
- `next/og` (`app/opengraph-image.tsx`) has its own font parser. Confirm a production build after changing fonts there.

## Working alongside other agents

- Check `git status` and recent file modification times before broad refactors or mass formatting. Someone else may be mid-edit.
- Don't restart, rebuild into, or delete `.next/` while another agent or the user is serving it. Use a separate `NEXT_DIST_DIR`.
- Keep changes scoped. When you hand off, list changed files and the verification you ran.
