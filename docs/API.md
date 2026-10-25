# HTTP API

Every endpoint lives under `/api`, returns JSON (except media), and is served by the Next.js route handlers in `app/api/`.

## Conventions

- **Auth.** An httpOnly `polyhistor_session` cookie (SameSite=Lax, Secure in production, 30 days). Send requests with `credentials: "same-origin"`.
- **Origin check.** Every mutating request (`POST`, `PUT`, `DELETE`) must send an `Origin` header matching the site (or `APP_URL`). Otherwise the server returns 403.
- **Errors.** `{ "error": "<user-safe message>" }` with status 400, 401, 403, 404, 409, 413, 422, 429, 502 or 503. Safety rejections are **422** with a deliberately generic message.
- **Rate limits** (fixed windows): sign-up 10/hour per IP, sign-in 30 per 15 min per IP and 15 per 15 min per email, generation 10/day per account, upload starts 40/hour per account.

## Auth

| Method   | Path               | Body                                                                   | Success                                              |
| -------- | ------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------- |
| `POST`   | `/api/auth/signup` | `{ name, email, password (10–128), acceptTerms: true, termsVersion? }` | `201 { user }`, sets the session cookie              |
| `POST`   | `/api/auth/login`  | `{ email, password }`                                                  | `200 { user }`, sets the session cookie              |
| `POST`   | `/api/auth/logout` | none                                                                   | `200 { ok: true }`, clears the cookie                |
| `GET`    | `/api/auth/me`     | none                                                                   | `200 { user }` or `{ user: null }` when signed out   |
| `DELETE` | `/api/auth/me`     | none                                                                   | `200 { ok: true }`: deletes the account and all data |

`user` is `{ id, name, email, createdAt }`.

## Videos

| Method   | Path              | Body                                                                      | Success                                                                       |
| -------- | ----------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `GET`    | `/api/videos`     | none                                                                      | `200 { videos: Video[] }` (completed films, newest first, max 100; no script) |
| `POST`   | `/api/videos`     | `{ prompt (8–2000), duration: 20–60, aspect: "landscape" \| "portrait" }` | `201 { video }` once the script is ready (synchronous, up to ~260 s)          |
| `GET`    | `/api/videos/:id` | none                                                                      | `200 { video }` including `script` and `assets`                               |
| `DELETE` | `/api/videos/:id` | none                                                                      | `200 { ok: true }`                                                            |

`POST /api/videos` returns **409** when another video is still being researched or the library is full (100), **422** when the request is declined by moderation, and **502** when a provider step fails. Failed and declined attempts are deleted; the moderation audit is retained. New attempts remain `pending` until input moderation approves them, then become `researching`.

### Video object

```ts
{
  id: string;
  prompt: string;
  title: string | null;
  duration: number;                       // requested seconds
  aspect: "landscape" | "portrait";
  status: "pending" | "researching" | "scripting" | "ready" | "rendered" | "failed" | "rejected";
  script: VideoScript | null;             // lib/schema/video.ts (also returned as `plan`)
  research: string | null;
  sources: { title: string; url: string }[];
  error: string | null;
  gifUrl: string | null;                  // set once a GIF upload completes
  posterUrl: string | null;
  gifBytes: number | null;
  mediaUrl: string | null;                // latest non-poster render when status = rendered
  createdAt: string; updatedAt: string;   // ISO 8601
  assets?: { id, mime, totalBytes, sha256, createdAt }[];   // detail view only
}
```

`ready` means the script is temporarily stored and waiting for the browser to render it. `rendered` means a movie or legacy GIF is stored. Only `rendered` films appear in the library.

## Media upload (browser renders)

Uploads use chunks of 1 MiB or less so each request stays under serverless body limits. The client is in `lib/client/upload.ts`.

1. `POST /api/videos/:id/assets/init` with `{ mime: "image/gif" | "image/jpeg" | "video/webm" | "video/mp4", totalBytes, chunkCount }` → `201 { assetId, chunkSize: 1048576 }`.
2. `PUT /api/videos/:id/assets/:assetId/chunks/:index` with a raw `application/octet-stream` body → `200 { ok: true }`. Retrying a chunk is safe. Keep at most 2 in flight. The last chunk must be exactly the remaining bytes.
3. `POST /api/videos/:id/assets/:assetId/complete` → `200 { mediaUrl, sha256 }`. The server checks every chunk and the file signature. A GIF marks the video `rendered`; a JPEG sets `posterUrl`.

Limits: 32 MiB per file, 96 MiB per account, and a global reservation that leaves headroom in the database. Unfinished uploads expire after 24 hours.

## Media download

`GET /api/videos/:id/media` streams the latest saved render. `GET /api/videos/:id/media?assetId=<id>` streams a specific asset, such as the poster. Both require the owner's session, support HTTP `Range` requests, and send `Cache-Control: private, no-store`.

## Health

`GET /api/health` returns `200 { ok: true }` when the database answers and Gemini is configured, and `503 { ok: false }` otherwise.

## Incomplete attempts

`GET /api/videos?active=1` includes temporary in-progress rows for the studio's status polling. The default list contains completed films only. Listing also deletes legacy failed/rejected rows and non-rendered rows last updated over 30 minutes ago.

`DELETE /api/videos/:id?incomplete=1` discards a temporary attempt and its uploaded chunks, but preserves a row that has already become `rendered`. The studio uses this on failure, navigation away, and page exit. Abrupt browser termination may prevent immediate cleanup; the stale-record sweep handles that on the next list request.
