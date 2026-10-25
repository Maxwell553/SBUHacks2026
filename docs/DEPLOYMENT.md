# Deployment and operations

Polyhistor deploys as one Next.js project. Vercel works out of the box: no separate backend host, no persistent disk, and no background workers.

## Environment variables

Copy `.env.example` to `.env.local` for development. Set the same values in your hosting provider. None of the credentials use the `NEXT_PUBLIC_` prefix.

| Variable                    | Required        | Purpose                                                                                                      |
| --------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| `GEMINI_API_KEY`            | yes             | Google Gemini key (Vertex AI Express key by default).                                                        |
| `GEMINI_PROVIDER`           | no              | `vertex` (default) or `developer` for Google AI Studio keys.                                                 |
| `GEMINI_CREATIVE_MODEL`     | no              | Model for model planning, geometry and storyboards. Default `gemini-3.1-pro-preview`.                        |
| `GEMINI_FAST_MODEL`         | no              | Model for research, moderation and caption repairs. Default `gemini-3.8-flash`.                              |
| `GEMINI_PLANNER_MODEL`      | no              | Model for the model plan. Defaults to `GEMINI_CREATIVE_MODEL`.                                               |
| `GEMINI_BUILDER_MODEL`      | no              | Model that builds each 3D geometry definition. See [the builder benchmark](BUILDER_BENCHMARK.md).            |
| `GEMINI_MODEL`              | no              | Fallback for either of the above when unset.                                                                 |
| `DATABASE_URL`              | yes             | PostgreSQL URL for the **runtime** role (DML only). `sslmode` flags are stripped; TLS is configured in code. |
| `DATABASE_CA_CERT`          | for TigerData   | Pinned CA certificate as one line with literal `\n` separators. Certificate verification stays on.           |
| `MIGRATION_DATABASE_URL`    | migrations only | Admin URL used by `npm run db:migrate`. **Never** set this in the production runtime.                        |
| `APP_URL`                   | production      | Canonical `https://` origin. Used for the origin check and metadata.                                         |
| `NEXT_PUBLIC_SITE_URL`      | recommended     | Public canonical URL for metadata, `robots.txt` and the sitemap (falls back to `APP_URL`).                   |
| `NEXT_PUBLIC_CONTACT_EMAIL` | before launch   | Contact address shown in the legal pages.                                                                    |
| `NEXT_PUBLIC_LEGAL_ENTITY`  | before launch   | Operator name shown in the legal pages.                                                                      |

Check the AI configuration with `npm run gemini:check` (uses billable API calls). Check the database with `npm run db:check`. Neither changes service configuration.

## Deploy to Vercel

1. Import the GitHub repository as a **Next.js** project. Install command: `npm ci`. Build command: `npm run build`. Node 24 (see `.nvmrc`) or any supported LTS ≥ 20.9.
2. Add the environment variables above to the Production (and Preview) environments.
3. Run migrations as an explicit release step against the target database:
   ```bash
   MIGRATION_DATABASE_URL=… DATABASE_CA_CERT=… npm run db:migrate
   ```
   `db/schema.sql` is idempotent and never drops data.
4. Deploy, then verify sign-up, sign-in, one generation, the saved GIF in the library, download, and sign-out on the deployed URL.

The generation route allows up to 300 seconds (`maxDuration`), and the provider pipeline is bounded at 260 seconds. Media is uploaded in 1 MiB chunks and streamed back from PostgreSQL with HTTP Range support, so nothing relies on the function filesystem.

## Database

- **Roles.** The runtime uses a limited role (`polyhistor_app`: table DML only). Migrations use a separate admin role. Keep the admin URL out of the runtime environment.
- **TLS.** Free-tier TigerData uses a private CA, which is pinned through `DATABASE_CA_CERT`. Rotate it using TigerData's connection guidance before it expires.
- **Pooling.** Each server instance keeps a small `pg` pool (max 3) attached with `@vercel/functions` so connections close cleanly between invocations.

## Storage and retention

| Item                                           | Limit or retention                          |
| ---------------------------------------------- | ------------------------------------------- |
| Rendered file                                  | 32 MiB each                                 |
| Media per account                              | 96 MiB                                      |
| Global media reservation                       | 700 MiB (headroom within a 1 GiB database)  |
| Library size                                   | 100 videos per account                      |
| Unfinished uploads                             | Expire after 24 hours                       |
| Videos, prompts, research, scripts, audit rows | Until the user deletes the video or account |

Storing media chunks in PostgreSQL suits a demo or hackathon. Before public scale, move chunks to private object storage, keep the same ownership checks, and raise limits only with a matching storage budget.

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

Run `npm run release:check` with the intended production runtime variables before deployment. It rejects missing contact/operator settings, invalid or conflicting HTTPS origins, public credential variables and migration credentials in the runtime. Local `.env.local` intentionally contains development/migration settings and can fail this check. To check exported target variables without loading local settings, run `node scripts/check-production-config.mjs`. This validates structure, not ownership of the contact address or availability of external services.

Keep the current placeholders during development. Before opening public registration, configure a real support contact, decide how to handle email verification and account recovery, verify the target Gemini models/quotas and hosting function-duration limits, and configure database backups with a tested restore procedure. Media currently has a small shared storage budget; public scale needs private object storage.

For rollback, retain the previous deployment and restore it through the hosting provider. Back up the database before schema changes; rolling back application code does not roll back data. Check `/api/health`, authentication, generation and authenticated downloads after every release. Do not run destructive test suites against the production database.
