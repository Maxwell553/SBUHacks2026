# Safety, privacy and security

## Content safety

Each request passes several independent checks:

| Layer                    | Where                                     | What it does                                                                                                                                                                                                                                                                                                |
| ------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keyword pre-filter       | `moderate()` in `lib/server/gemini.ts`    | Declines explicit sexual content and graphic gore before any provider call.                                                                                                                                                                                                                                 |
| Input classifier         | `moderate(prompt)`                        | A Gemini 3.8 Flash check that treats the prompt as untrusted data. It allows neutral discussion of wars and tragedies and declines sexual content, gore, hate, extremist glorification, self-harm, dangerous instructions, harassment, private-data requests, prompt injection and non-historical requests. |
| Provider safety settings | Every Gemini call                         | Hate, sexual, dangerous-content and harassment categories are blocked at medium and above.                                                                                                                                                                                                                  |
| Research                 | `researchEvent()`                         | Search is attempted inside a 10-second cap. A short briefing from established knowledge is kept when search returns no citations in time.                                                                                                                                                                   |
| Output classifier        | `moderate(scriptText(script), true)`      | Re-checks every generated title, caption, label and model name before the script is saved, and again after every review round that changes it.                                                                                                                                                              |
| Data-only generation     | `lib/schema/*`, `lib/lowpoly/compiler.ts` | Models and scripts are validated JSON within hard limits. No generated code is ever executed.                                                                                                                                                                                                               |

Declined requests return HTTP 422 with a generic message ("Please choose a non-graphic educational history topic.") and the incomplete video is deleted (the audit verdict remains). The public policy is at `/content-policy`.

## Moderation audit

Every moderation decision is written to `ph_audit` (`event = 'moderation'`) by `recordModeration()` in `lib/server/audit.ts`:

```json
{
  "videoId": "…",
  "stage": "input | output",
  "outcome": "allowed | rejected | error",
  "source": "keyword | classifier | provider",
  "reason": "short neutral reason (≤ 300 chars)",
  "rule": "sexual_content | graphic_gore (keyword hits only)",
  "model": "classifier model (non-keyword decisions)",
  "textSha256": "fingerprint of the checked text",
  "textChars": 123
}
```

- The checked text is **never** stored in the audit row. The prompt lives on the video row, and the fingerprint links the two.
- If an approval can't be recorded, generation stops (it fails closed). A failed write for a decline is logged, and the decline still applies.
- Review decisions with `npm run db:inspect -- audit`. Verify the behaviour with `npm run test:audit -- --live`.

## Accounts and sessions

- Passwords: 10–128 characters, salted **scrypt** hashes, compared in constant time.
- Sessions: a random token in an httpOnly, SameSite=Lax cookie (Secure in production) that expires after 30 days. The database stores only its SHA-256 hash.
- Every mutating request requires a matching `Origin` header.
- Post-login redirects only accept same-site paths (`lib/shared/navigation.ts`). External, protocol-relative, backslash and control-character targets are rejected.
- Rate limits cover sign-up, sign-in (per IP and per email), generation and uploads. IP addresses are stored only as one-way hashes.
- Terms acceptance is stored with its version and timestamp.
- **Not yet implemented:** email verification and password reset.

## Data lifecycle

| Data                                                         | Retention                                   |
| ------------------------------------------------------------ | ------------------------------------------- |
| Account, completed videos, prompts, research, scripts, media | Until the user deletes the video or account |
| Moderation audit rows                                        | While the account exists; deleted with it   |
| Sessions                                                     | 30 days, or until sign-out                  |
| Rate-limit counters                                          | Overwritten when the window resets          |
| Unfinished uploads                                           | 24 hours                                    |

Deleting an account (`DELETE /api/auth/me` → `deleteAccountData()`) removes the user, sessions, videos, media, model cache and audit rows in one transaction. The provider's operational backups may keep deleted data until they roll over. The Privacy Policy (`/privacy`) says so.

## Infrastructure

- Database TLS uses certificate verification with a pinned CA.
- The runtime database role has DML permissions only. Migrations use a separate admin role.
- Security headers (`next.config.ts`): `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` and HSTS.
- Media responses are private (`Cache-Control: private, no-store`) and served only to the owner.
- Provider error logs redact the API key.
- `npm run secrets:check` scans commit candidates for configured secret values without printing them.

Reporting vulnerabilities: see [SECURITY.md](../SECURITY.md).

Incomplete generation rows are temporary: failures are deleted immediately, and the studio discards unfinished work on navigation or render failure. A list request also removes non-rendered rows older than 30 minutes. Input moderation runs while the row is `pending`; only an audited approval changes it to `researching`. Nudity keywords (including normalized Unicode variants) are rejected before any provider research request.
