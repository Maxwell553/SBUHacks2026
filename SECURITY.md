# Security policy

## Reporting a vulnerability

Please report security issues privately to the project maintainers. Use the contact address configured for the deployment (`NEXT_PUBLIC_CONTACT_EMAIL`, shown on `/privacy`) or a private message to the repository owners. Don't open a public issue.

Include:

- A description of the issue and its impact.
- Steps to reproduce, or a proof of concept.
- Affected routes, files or versions.

We aim to acknowledge reports within a few days and will keep you informed while we work on a fix.

## Scope

In scope: the Polyhistor web application, its API routes, authentication and session handling, media storage, the AI pipeline (including prompt injection that bypasses moderation), and the renderer's handling of generated data.

Out of scope: denial-of-service volume testing, social engineering, and vulnerabilities in third-party services (Google Cloud, TigerData, Vercel). Report those to the vendor.

## Handling secrets

- Credentials live only in `.env.local` locally, or in the hosting provider's environment. Neither is ever committed.
- Run `npm run secrets:check` before pushing.
- If a credential is exposed, rotate it immediately (Gemini key, database passwords, CA certificate if applicable) and redeploy.

An overview of the security controls is in [docs/SAFETY.md](docs/SAFETY.md).
