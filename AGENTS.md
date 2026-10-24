<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agent guide

Polyhistor is a Next.js 16 / React 19 app that turns a history question into a 20–60 s low-poly film. Gemini (with Google Search grounding) researches the event and writes a declarative script plus bespoke 3D model definitions. The browser renders the film with Three.js and saves a GIF. Data lives in TigerData (PostgreSQL). Read `README.md` first, then `docs/ARCHITECTURE.md`.

## Commands

```bash
npm run dev             # local server (Turbopack)
npm run check           # typecheck + eslint + prettier --check + unit checks (no network)
npm run build           # production build
npm run test:audit      # DB-backed moderation audit checks (add -- --live for Gemini)
npm run test:backend    # HTTP integration suite against a running local server
npm run format          # prettier --write .
```

Run `npm run check` before handing work back. Run the DB and live suites when you touch `lib/server/`, `app/api/` or `db/`.

## Layout

| Path                                                          | What lives there                                                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `app/`                                                        | Routes. `app/api/**` are route handlers (Node runtime).                                                        |
| `components/`, `components/three/`                            | Client UI and React Three Fiber scenes                                                                         |
| `lib/schema/`                                                 | **Isomorphic** zod contracts: `video.ts` (VideoScript), `model.ts` (ModelDefinition, limits, modelling skills) |
| `lib/server/`                                                 | **Server-only**: auth, db, Gemini pipeline, moderation audit, media, viewer                                    |
| `lib/client/`                                                 | Browser-only API client, chunked upload, render-and-save                                                       |
| `lib/lowpoly/`, `lib/render/`                                 | Deterministic renderer and GIF exporter                                                                        |
| `lib/content/`                                                | Site config, topic ideas, example models, sample reel                                                          |
| `lib/typography/`, `lib/lowpoly/landmask.ts`, `public/fonts/` | Generated assets. Regenerate via `npm run assets:*`; never hand-edit                                           |
| `db/schema.sql`                                               | Idempotent schema (`npm run db:migrate`)                                                                       |
| `docs/`                                                       | Architecture, API, renderer, safety, design, deployment                                                        |

## Rules

- **No fixed model catalogue.** Generated films use per-request `ModelDefinition`s. Extend primitives or modelling skills; never add named presets for generated videos. (`lib/content/model-examples.ts` is decorative and few-shot only.)
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
- To build while another process serves `.next`, use `NEXT_DIST_DIR=.next-verify npm run build`, and serve it on another port with `NEXT_DIST_DIR=.next-verify npx next start -p 3100`.
- `next/og` (`app/opengraph-image.tsx`) has its own font parser. Confirm a production build after changing fonts there.

## Working alongside other agents

- Check `git status` and recent file modification times before broad refactors or mass formatting. Someone else may be mid-edit.
- Don't restart, rebuild into, or delete `.next/` while another agent or the user is serving it. Use a separate `NEXT_DIST_DIR`.
- Keep changes scoped. When you hand off, list changed files and the verification you ran.
