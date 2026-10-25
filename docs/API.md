# HTTP API

Every endpoint lives under `/api`, returns JSON (except media), and is served by the Next.js route handlers in `app/api/`.

## Conventions

- **Auth.** An httpOnly `polychronicle_session` cookie (SameSite=Lax, Secure in production, 30 days). Send requests with `credentials: "same-origin"`.
- **Origin check.** Every mutating request (`POST`, `PUT`, `DELETE`) must send an `Origin` header matching the site (or `APP_URL`). Otherwise the server returns 403.
- **Errors.** `{ "error": "<user-safe message>" }` with status 400, 401, 403, 404, 409, 413, 422, 429, 502 or 503. Safety rejections are **422** with a deliberately generic message.
- **Rate limits** (fixed windows): sign-up 10/hour per IP, sign-in 30 per 15 min per IP and 15 per 15 min per email, generation 10 per account per rolling 24 hours (`SITE.dailyVideos`; the 429 message says roughly when the next one is available), review rounds 4/hour per video, narration 3/hour per video, upload starts 40/hour per account. An account can have one video in progress at a time.

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

| Method   | Path              | Body                                                                      | Success                                                                                                   |
| -------- | ----------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/videos`     | none                                                                      | `200 { videos: Video[] }` (completed films, newest first, max 100; no script)                             |
| `POST`   | `/api/videos`     | `{ prompt (8–2000), duration: 20–60, aspect: "landscape" \| "portrait" }` | `201 { video, models: [{ id, name }] }` once the models are planned (status `scripting`, usually 20–60 s) |
| `GET`    | `/api/videos/:id` | none                                                                      | `200 { video }` including `script` and `assets`                                                           |
| `DELETE` | `/api/videos/:id` | none                                                                      | `200 { ok: true }`                                                                                        |

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
  gifUrl: string | null;                  // legacy: set only when a GIF was uploaded
  posterUrl: string | null;
  gifBytes: number | null;                // legacy, with gifUrl
  mediaUrl: string | null;                // latest non-poster render when status = rendered
  createdAt: string; updatedAt: string;   // ISO 8601
  assets?: { id, mime, totalBytes, sha256, createdAt }[];   // detail view only
}
```

`ready` means the script is temporarily stored and waiting for the browser to render it. `rendered` means a movie or legacy GIF is stored. Only `rendered` films appear in the library.

## Production steps

After `POST /api/videos` plans the models, the browser runs the rest of production as short requests. No function runs anywhere near Vercel's 300-second limit: each step has a 200-second internal deadline.

| Method | Path                     | Body               | Success                                                                                                                                                       |
| ------ | ------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/videos/:id/build`  | `{ models: id[] }` | `200 { built: id[], failed: id[] }`. Builds those planned models in parallel and caches each one. Retry `failed` ids in a new request.                        |
| `POST` | `/api/videos/:id/direct` | none               | `200 { ok: true }`. Writes the storyboard while the models build.                                                                                             |
| `POST` | `/api/videos/:id/finish` | none               | `200 { video }` with status `ready`. Joins the storyboard with the built models, validates and moderates. `409` if a model or the storyboard isn't ready yet. |

The studio sends at most four build requests plus the storyboard request at once, which stays within a browser's six connections per site. It retries a failed group or storyboard once.

## Review (while the film is made)

`POST /api/videos/:id/review` runs one quality-review round on a video whose status is `ready`. The browser sends `{ round, sheet, issues }`, where `round` counts from 1 up to `REVIEW_ROUNDS`:

- `sheet` is a JPEG data URL of the draft contact sheet: two frames per shot, labelled with the shot index.
- `issues` are the shot problems measured by `shotIssues()`.

The body can be up to 6.5 MB.

The server checks every model for loose parts, reviews the sheet with Gemini 4 Argon, applies shot fixes and model repairs, re-moderates, and saves. It responds `200 { video, review: { verdict: "pass" | "revise", summary, shotsChanged, modelsRepaired } }`, where `video.script` is the updated script. It returns **409** when the video isn't waiting to be rendered. A round finishes within 200 seconds: the reviewer call gets 80 seconds, and repairs stop in time to moderate and save. The studio runs one round per film (`REVIEW_ROUNDS`), and renders the film as it stands if a review fails.

## Narration

`POST /api/videos/:id/narrate` (no body) records the narration of a video whose status is `ready`: each caption read aloud by the speech model (`GEMINI_TTS_MODEL`, voice `GEMINI_TTS_VOICE`), laid out on the film's timeline and stored as a WAV asset. It responds `200 { video }` with `video.narrationUrl` set, and returns **409** when the video isn't waiting to be rendered and **502** when the recording fails, in which case the film is made without narration. The studio calls it while the review runs, since the review never changes captions. Recording again replaces the earlier narration.

## Media upload (browser renders)

Uploads use chunks of 1 MiB or less so each request stays under serverless body limits. The client is in `lib/client/upload.ts`.

1. `POST /api/videos/:id/assets/init` with `{ mime: "image/gif" | "image/jpeg" | "video/webm" | "video/mp4", totalBytes, chunkCount }` → `201 { assetId, chunkSize: 1048576 }`.
2. `PUT /api/videos/:id/assets/:assetId/chunks/:index` with a raw `application/octet-stream` body → `200 { ok: true }`. Retrying a chunk is safe. Keep at most 2 in flight. The last chunk must be exactly the remaining bytes.
3. `POST /api/videos/:id/assets/:assetId/complete` → `200 { mediaUrl, sha256 }`. The server checks every chunk and the file signature. A movie (MP4 or WebM, or a GIF from the legacy exporter) marks the video `rendered`; a JPEG sets `posterUrl`.

Limits: 32 MiB per file, 96 MiB per account, and a global reservation that leaves headroom in the database. Unfinished uploads expire after 24 hours.

## Media download

`GET /api/videos/:id/media` streams the latest saved render. `GET /api/videos/:id/media?assetId=<id>` streams a specific asset, such as the poster. Both require the owner's session, support HTTP `Range` requests, and send `Cache-Control: private, no-store`.

## Health

`GET /api/health` returns `200 { ok: true }` when the database answers and Gemini is configured, and `503 { ok: false }` otherwise.

## Incomplete attempts

`GET /api/videos?active=1` includes temporary in-progress rows for the studio's status polling. The default list contains completed films only. Listing also deletes legacy failed/rejected rows and non-rendered rows last updated over 30 minutes ago.

`DELETE /api/videos/:id?incomplete=1` discards a temporary attempt and its uploaded chunks, but preserves a row that has already become `rendered`. The studio uses this on failure, navigation away, and page exit. Abrupt browser termination may prevent immediate cleanup; the stale-record sweep handles that on the next list request.
