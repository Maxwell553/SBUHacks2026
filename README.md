# Polyhistor

**A little curiosity. A window into history.**

Polyhistor turns a question about the past into a 20–60 second low-poly animated film. Each film is researched from public sources with Gemini and Google Search, cast with 3D models designed for that event, animated entirely in code, and saved to your library as a GIF together with every source it used.

## Features

- **Grounded research.** Gemini researches each event with Google Search grounding and keeps the source list with the video.
- **A new cast every time.** There's no fixed model library. Gemini designs declarative `ModelDefinition`s (primitives, materials, rigs and animation channels) for the people, buildings and machines of each event.
- **Code-rendered film.** A deterministic Three.js engine draws every frame: procedural terrain, water and weather, a faceted globe with real coastlines, camera moves, captions and transitions. There's no generative video, and generated code never runs.
- **In-browser export.** Frames are rendered offscreen, encoded to GIF in a Web Worker, and uploaded in 1 MiB chunks. A JPEG poster is saved alongside.
- **Safety by design.** Prompts and generated storyboards pass keyword and classifier checks. Every decision goes to an audit log that's deleted with the account.
- **Accounts.** Email and password sign-up with hashed sessions, a private library, GIF downloads, and full account deletion.
- **Optional audio.** Independent voice and procedural ambience controls in the interactive player. GIF downloads are silent.
- **Original typefaces.** Facet, Tessera and Tessera Mono are generated in this repository from hand-designed glyph skeletons.
- **Accessible, friendly UI.** A warm educational theme, motion.dev animations, React Three Fiber scenes, and support for reduced motion throughout.

## How it works

```text
question → safety check → grounded research → model plan → parallel geometry + storyboard
        → safety check → saved script → browser render → GIF + poster upload → library
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full lifecycle.

## Tech stack

| Area          | Choice                                                                      |
| ------------- | --------------------------------------------------------------------------- |
| Framework     | Next.js 16 (App Router), React 19, TypeScript                               |
| 3D and motion | Three.js, React Three Fiber, motion.dev                                     |
| AI            | Google Gemini (Vertex AI) with Google Search grounding, via `@google/genai` |
| Database      | TigerData (managed PostgreSQL) via `pg`                                     |
| Media         | `gifenc` in a Web Worker; chunked storage in PostgreSQL                     |
| Validation    | zod 4 (shared schemas for scripts and models)                               |
| Hosting       | Vercel or any Node.js host                                                  |

## Getting started

**Requirements:** Node.js 24 (see `.nvmrc`; ≥ 20.9 works), a PostgreSQL database (TigerData recommended), and a Gemini API key.

```bash
npm ci
cp .env.example .env.local    # fill in GEMINI_API_KEY, DATABASE_URL, DATABASE_CA_CERT…
npm run db:migrate            # creates or updates tables (idempotent)
npm run dev                   # http://localhost:3000
```

Environment variables are documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#environment-variables).

## Scripts

| Command                                          | What it does                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`                | Next.js development server, production build, production server     |
| `npm run check`                                  | Type check, lint, format check and unit checks: run before every PR |
| `npm run lint` / `format`                        | ESLint (Next.js config) / Prettier                                  |
| `npm run test:unit`                              | Schema, example-model and redirect-safety checks (no network)       |
| `npm run test:audit [-- --live]`                 | Moderation audit and account-deletion checks against the database   |
| `npm run test:backend [-- --live]`               | HTTP integration suite against a local server                       |
| `npm run test:film -- script.json`               | Validates a generated script and checks its models animate          |
| `npm run db:migrate` / `db:check` / `db:inspect` | Apply schema / connectivity check / read-only operator views        |
| `npm run gemini:check`                           | Live check of the Gemini key, model and Search grounding            |
| `npm run secrets:check`                          | Scans commit candidates for configured secrets                      |
| `npm run assets:fonts` / `assets:landmask`       | Regenerate the typefaces / the globe land mask                      |

## Project structure

```text
app/            Pages, API routes, metadata (robots, sitemap, Open Graph image)
components/     UI components; components/three/ holds the 3D scenes
lib/
  client/       Browser API client, chunked upload, render-and-save
  content/      Site config, topic ideas, example models, sample reel
  lowpoly/      Renderer: model compiler, engine, environments, globe, overlay
  render/       GIF export and worker
  schema/       Shared contracts: VideoScript and ModelDefinition
  server/       Auth, database, Gemini pipeline, moderation audit, media
  shared/       Isomorphic helpers
  typography/   Generated glyph data
db/             Database schema
docs/           Project documentation
public/fonts/   The Facet, Tessera and Tessera Mono typefaces
scripts/        Asset builders, migrations, checks and tests
```

## Documentation

| Document                                                                                    | Contents                                                      |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [Architecture](docs/ARCHITECTURE.md)                                                        | System overview, request lifecycle, data model, code layout   |
| [HTTP API](docs/API.md)                                                                     | Endpoints, payloads, errors and rate limits                   |
| [Renderer](docs/RENDERER.md)                                                                | Script and model formats, compiler, engine, export            |
| [Safety, privacy and security](docs/SAFETY.md)                                              | Moderation layers, audit log, sessions, data lifecycle        |
| [Design system](docs/DESIGN.md)                                                             | Theme, typefaces, components, motion                          |
| [Deployment and operations](docs/DEPLOYMENT.md)                                             | Environment, Vercel, database, limits, checklist              |
| [Historical video skill](docs/historical-video-skill.md)                                    | The storytelling guidance the storyboard step is adapted from |
| [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md) · [Agent guide](AGENTS.md) | Workflow, conventions and reporting                           |

## Status and known limitations

- Email verification and password reset aren't implemented yet.
- Rendered media is stored in PostgreSQL, which suits demo scale. Move it to object storage before public scale.
- Legal pages use placeholder contact and operator details until `NEXT_PUBLIC_CONTACT_EMAIL` and `NEXT_PUBLIC_LEGAL_ENTITY` are set.
- Videos are AI-assisted interpretations and can contain mistakes. Every film lists its sources.

## Release checks

GitHub Actions runs a clean install, code checks, secret scan, production dependency audit and build without production credentials. Before deployment, run `npm run release:check` against the target runtime environment; see [the deployment guide](docs/DEPLOYMENT.md). Nothing automatically migrates or deploys the application.

## License

No license has been chosen yet. Until one is added, all rights are reserved by the authors.
