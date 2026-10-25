# Deployment and operations

PolyChronicle deploys as one Next.js project. Vercel works out of the box: no separate backend host, no persistent disk, and no background workers.

## Environment variables

Copy `.env.example` to `.env.local` for development. Set the same values in your hosting provider. None of the credentials use the `NEXT_PUBLIC_` prefix.

| Variable                    | Required              | Purpose                                                                                                                                                            |
| --------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GEMINI_API_KEY`            | yes                   | Google Gemini key (Vertex AI Express key by default).                                                                                                              |
| `GEMINI_PROVIDER`           | no                    | `vertex` (default) or `developer` for Google AI Studio keys.                                                                                                       |
| `GEMINI_PROJECT`            | for production models | Google Cloud project id or number of the Vertex key. Without it Vertex Express only reaches `us-central1`. Both models are served from `global`, `us` and `eu`.    |
| `GEMINI_LOCATION`           | no                    | Vertex location used with `GEMINI_PROJECT`. Default `global`.                                                                                                      |
| `GEMINI_FAST_MODEL`         | no                    | Research, moderation, the model plan, and the fallback when a build times out. Default `gemini-3.8-flash`. Thinking is `low`; `minimal` is rejected by this model. |
| `GEMINI_MODEL`              | no                    | Used only when `GEMINI_FAST_MODEL` is unset. Set it to `gemini-3.8-flash`.                                                                                         |
| `GEMINI_CREATIVE_MODEL`     | no                    | Storyboard, and the default for geometry and the draft review. Default `gemini-4-argon`. It does not plan models unless `GEMINI_PLANNER_MODEL` points at it.       |
| `GEMINI_PLANNER_MODEL`      | no                    | Model for the model plan. Defaults to `GEMINI_FAST_MODEL`.                                                                                                         |
| `GEMINI_BUILDER_MODEL`      | no                    | Model that builds each 3D geometry definition. Defaults to `GEMINI_CREATIVE_MODEL`.                                                                                |
| `GEMINI_ARTICULATED_MODEL`  | no                    | Builder for articulated models (people, animals). Defaults to `GEMINI_BUILDER_MODEL`.                                                                              |
| `GEMINI_REVIEW_MODEL`       | no                    | Reviews the rendered draft of each film and decides shot fixes. Defaults to `GEMINI_CREATIVE_MODEL`.                                                               |
| `GEMINI_TTS_MODEL`          | no                    | Reads each caption aloud for the film's narration. Default `gemini-3.8-flash-tts`.                                                                                 |
| `GEMINI_TTS_VOICE`          | no                    | Prebuilt voice for the narration. Default `Charon`.                                                                                                                |
| `GEMINI_REFERENCE_CACHE`    | no                    | `off` sends the director's reference films inline with every storyboard request instead of keeping them in a Gemini context cache.                                 |
| `DATABASE_URL`              | yes                   | PostgreSQL URL for the **runtime** role (DML only). `sslmode` flags are stripped; TLS is configured in code.                                                       |
| `DATABASE_CA_CERT`          | for TigerData         | Pinned CA certificate as one line with literal `\n` separators. Certificate verification stays on.                                                                 |
| `MIGRATION_DATABASE_URL`    | migrations only       | Admin URL used by `npm run db:migrate`. **Never** set this in the production runtime.                                                                              |
| `APP_URL`                   | production            | Canonical `https://` origin. Used for the origin check and metadata.                                                                                               |
| `NEXT_PUBLIC_SITE_URL`      | recommended           | Public canonical URL for metadata, `robots.txt` and the sitemap (falls back to `APP_URL`).                                                                         |
| `NEXT_PUBLIC_CONTACT_EMAIL` | before launch         | Contact address shown in the legal pages.                                                                                                                          |
| `NEXT_PUBLIC_LEGAL_ENTITY`  | before launch         | Operator name shown in the legal pages.                                                                                                                            |

Check the AI configuration with `npm run gemini:check`. It calls the configured fast model (`gemini-3.8-flash` unless overridden) with Google Search grounding and uses billable API calls. Check the database with `npm run db:check`. Neither changes service configuration.

## Deploy to Vercel

1. Import the GitHub repository as a **Next.js** project. Install command: `npm ci`. Build command: `npm run build`. Node 24 (see `.nvmrc`) or any supported LTS ≥ 20.9.
2. Add the environment variables above to the Production (and Preview) environments.
3. Run migrations as an explicit release step against the target database:
   ```bash
   MIGRATION_DATABASE_URL=… DATABASE_CA_CERT=… npm run db:migrate
   ```
   `db/schema.sql` is idempotent and never drops data. Run it before deploying a release that adds columns, such as `ph_videos.narration_asset_id` for narration.
4. Deploy, then verify sign-up, sign-in, one generation, the saved HD video in the library, download, and sign-out on the deployed URL.

Production runs as separate short requests (plan, build, direct, finish, review), so it fits Vercel's Hobby plan. Every route sets `maxDuration = 300`, the Hobby maximum, but each step stops itself at 200 seconds (`STEP_DEADLINE_MS` in `lib/server/gemini.ts`). Measured steps take about 20–60 s (plan), 30–135 s (a build group, including a retry), 40–110 s (storyboard), 2 s (finish) and 50–70 s (a review round). The example films and stills in `references/` are read at runtime, so `next.config.ts` traces them into the `/api/videos` function; within each set, files that would push the request past a 14 MiB inline budget (measured after base64 encoding) are skipped. The films are third-party reels used as style references; replace them with material you have rights to before a public launch. Media is uploaded in 1 MiB chunks and streamed back from PostgreSQL with HTTP Range support, so nothing relies on the function filesystem.

## Database

- **Roles.** The runtime uses a limited role (`polyhistor_app`: table DML only; the role, advisory-lock keys and connection `application_name` keep the project's earlier name, Polyhistor, so existing databases keep working). Migrations use a separate admin role. Keep the admin URL out of the runtime environment.
- **TLS.** Free-tier TigerData uses a private CA, which is pinned through `DATABASE_CA_CERT`. Rotate it using TigerData's connection guidance before it expires.
- **Pooling.** Each server instance keeps a small `pg` pool (max 3) attached with `@vercel/functions` so connections close cleanly between invocations.

## Storage and retention

| Item                                           | Limit or retention                          |
| ---------------------------------------------- | ------------------------------------------- |
| New videos                                     | 10 per day; one in progress per account     |
| Rendered file                                  | 32 MiB each                                 |
| Media per account                              | 96 MiB                                      |
| Global media reservation                       | 700 MiB (headroom within a 1 GiB database)  |
| Library size                                   | 100 videos per account                      |
| Unfinished uploads                             | Expire after 24 hours                       |
| Videos, prompts, research, scripts, audit rows | Until the user deletes the video or account |

Storing media chunks in PostgreSQL fits the current single-database deployment. Before public scale, move chunks to private object storage, keep the same ownership checks, and raise limits only with a matching storage budget.

## Pre-launch checklist

- [ ] Set `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_EMAIL` and `NEXT_PUBLIC_LEGAL_ENTITY` to verified values. The defaults are placeholders.
- [ ] Review `/terms`, `/privacy` and `/content-policy` with whoever operates the service.
- [ ] Email verification and password reset are **not implemented**. Add an email provider and a recovery flow before promising account recovery.
- [ ] Run `npm run check`, `npm run secrets:check`, and `npm run test:backend -- --live` against a localhost server connected to an isolated staging database. The automated suite refuses remote hosts; perform the deployed smoke test manually.
- [ ] Confirm the database CA expiry date and set up alerting on `/api/health`.

## Operations

| Task                                | Command                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Health                              | `GET /api/health` (`200` when the database and Gemini are configured)                                |
| Inspect users, videos or audit rows | `npm run db:inspect -- users` (or `videos`, `audit`). Read-only; never selects hashes or media bytes |
| Backend integration tests           | `npm run test:backend` (add `-- --live` to include paid Gemini calls)                                |
| Moderation audit tests              | `npm run test:audit` (add `-- --live` for the classifier)                                            |
| Validate a generated script         | `npm run test:film -- path/to/script.json`                                                           |
| Secret scan before pushing          | `npm run secrets:check`                                                                              |

## Troubleshooting

- **Stale pages in `next dev` after many edits.** Turbopack's persistent cache can keep old server modules. Stop the dev server, delete `.next/`, and restart.
- **Verifying a build while `next start` is running.** Build into a separate folder with `NEXT_DIST_DIR=.builds/verify npm run build`, then serve it with `NEXT_DIST_DIR=.builds/verify npx next start -p 3100`.
- **`422` on every generation.** Check the moderation records with `npm run db:inspect -- audit`. The `reason` field explains classifier decisions.
- **`502` during generation.** A provider step failed or hit a deadline. The video is marked `failed` and can be retried. Server logs redact the API key.

## GitHub and release workflow

The repository includes `.github/workflows/ci.yml`: Node 24, locked dependency install, type/lint/format/unit checks, secret scan, production dependency audit and a build. CI needs no database or Gemini secrets and never deploys or migrates. Enable the `verify` job as a required branch check in GitHub when ready.

Run `npm run release:check` with the intended production runtime variables before deployment. It rejects missing contact/operator settings, invalid or conflicting HTTPS origins, public credential variables and migration credentials in the runtime. Local `.env.local` intentionally contains development/migration settings and can fail this check. To check exported target variables without loading local settings, run `node scripts/checks/check-production-config.mjs`. This validates structure, not ownership of the contact address or availability of external services.

Keep the current placeholders during development. Before opening public registration, configure a real support contact, decide how to handle email verification and account recovery, verify the target Gemini models/quotas and hosting function-duration limits, and configure database backups with a tested restore procedure. Media currently has a small shared storage budget; public scale needs private object storage.

For rollback, retain the previous deployment and restore it through the hosting provider. Back up the database before schema changes; rolling back application code does not roll back data. Check `/api/health`, authentication, generation and authenticated downloads after every release. Do not run destructive test suites against the production database.
