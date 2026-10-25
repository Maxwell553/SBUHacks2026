# Contributing

Thanks for helping improve PolyChronicle. This guide covers the local workflow and the conventions the codebase follows.

## Setup

```bash
nvm use            # Node 24 (see .nvmrc)
npm ci
cp .env.example .env.local
npm run db:migrate
npm run dev
```

You need a PostgreSQL database and a Gemini API key. The example environment uses Gemini 3.8 Flash for research, moderation and planning, and Gemini 4 Argon for geometry, the storyboard and review. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#environment-variables).

## Before you open a pull request

```bash
npm run check          # typecheck + lint + format check + unit checks
npm run build          # production build
npm run secrets:check  # never commit credentials
```

If you change the pipeline, the database or the safety code, also run `npm run test:audit` and `npm run test:backend` against a local server. Add `-- --live` when the change affects Gemini calls. These make real, billable requests.

## Conventions

- **TypeScript everywhere.** Strict mode. Validate untrusted input with zod at boundaries.
- **Imports.** Use the `@/` alias for anything outside the current folder. Scripts in `scripts/` use relative paths because they run outside the Next.js bundle.
- **Formatting.** Prettier (120 columns, double quotes, trailing commas) and ESLint with `eslint-config-next`. Run `npm run format` rather than formatting by hand.
- **Where code goes:**
  - `lib/schema/` holds isomorphic zod contracts. Keep them free of DOM, three.js and Node APIs.
  - `lib/server/` is server-only. It's never imported from client components.
  - `lib/client/` is browser-only helpers.
  - `lib/lowpoly/` and `lib/render/` are the renderer. Keep them deterministic: no `Math.random()` or wall-clock time in frame code; use the seeded RNG in `lib/lowpoly/core.ts`.
  - `lib/content/` holds copy and static demo content.
  - `references/films/` holds the example films the director watches, and `references/stills/` holds frames from them for the planner and builders. Generated films take their format, pacing and look from these files; `lib/server/film-format.ts` is the only written description of that format. Keep the films small (they are sent inline with every film request) and use material you're allowed to use.
  - `scripts/` holds Node CLI scripts, grouped as `assets/` (generators), `bench/`, `checks/`, `db/` and `tests/`. Add a new unit check to `scripts/tests/` and to the `test:unit` script in `package.json`.
- **No hard-coded model catalogue.** Generated videos must use per-request `ModelDefinition`s. To add a capability, extend the primitive vocabulary and `MODEL_FORMAT_GUIDE` in `lib/schema/model.ts`, not a named model.
- **Never execute generated content.** Models and scripts are data, validated against hard limits.
- **User-facing copy** follows [docs/DESIGN.md](docs/DESIGN.md): friendly, plain language, no provider or implementation jargon in the main flows, and honest about uncertainty.
- **Accessibility.** Visible labels, keyboard focus states, sufficient contrast, and reduced-motion support for every animation, including WebGL loops.
- **Comments.** Explain constraints the code can't show. Don't narrate what the next line does.

## Generated assets

| Asset                                         | Source                                                                | Regenerate with           |
| --------------------------------------------- | --------------------------------------------------------------------- | ------------------------- |
| `public/fonts/*.otf`, `lib/typography/*.json` | `scripts/assets/build-fonts.mjs`                                      | `npm run assets:fonts`    |
| `lib/lowpoly/landmask.ts`                     | `scripts/assets/build-landmask.mjs` (Natural Earth via `world-atlas`) | `npm run assets:landmask` |

Commit regenerated files together with the script change that produced them.

## Database changes

Edit `db/schema.sql` using only idempotent statements (`CREATE … IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`). Never drop or rewrite existing data in a migration. Grant new tables to the runtime role if it needs them.

## Commit messages

Use short imperative subjects ("Add poster fallback to library cards") with a body that explains _why_ when it isn't obvious.
