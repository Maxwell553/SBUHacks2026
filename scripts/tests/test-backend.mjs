// Local integration tests against the real TigerData database. Creates and removes only its own test accounts.
// Add --live to exercise paid Gemini/Google Search research and scene generation once.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import pg from "pg";
import { databaseConfig } from "../lib/database-config.mjs";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Tests are restricted to localhost");
const client = new pg.Client(databaseConfig());
await client.connect();
const accounts = [];
let checks = 0;
async function call(path, { method = "GET", data, cookie, origin = base, raw } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(method !== "GET" ? { Origin: origin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(raw ? { "Content-Type": "application/octet-stream" } : {}),
    },
    body: raw ?? (data ? JSON.stringify(data) : undefined),
    signal: AbortSignal.timeout(280000),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return {
    response,
    body,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
function check(condition, label) {
  assert(condition, label);
  checks++;
  console.log("PASS", label);
}
async function signup() {
  const email = `polychronicle-test-${randomUUID()}@example.com`,
    password = randomBytes(24).toString("base64url");
  const result = await call("/api/auth/signup", {
    method: "POST",
    data: {
      name: "Integration Test",
      email,
      password,
      acceptTerms: true,
      termsVersion: "2026-10-23",
    },
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  const account = {
    ...result.body.user,
    email,
    password,
    cookie: result.cookie,
  };
  accounts.push(account);
  return account;
}
try {
  let r = await call("/api/videos");
  check(r.response.status === 401, "private library rejects anonymous access");
  r = await call("/api/auth/signup", {
    method: "POST",
    origin: "https://untrusted.example",
    data: {},
  });
  check(r.response.status === 403, "cross-origin mutation rejected");
  const a = await signup(),
    b = await signup();
  check(a.cookie && b.cookie, "signup creates authenticated sessions");
  r = await call("/api/auth/me", { cookie: a.cookie });
  check(r.body.user?.id === a.id, "session resolves correct user");
  const {
    rows: [stored],
  } = await client.query("SELECT password_hash,terms_version,terms_accepted_at FROM ph_users WHERE id=$1", [a.id]);
  check(stored.password_hash !== a.password && stored.password_hash.includes(":"), "password stored as salted hash");
  check(stored.terms_version === "2026-10-23" && stored.terms_accepted_at, "terms acceptance recorded");
  r = await call("/api/auth/login", {
    method: "POST",
    data: { email: a.email, password: "incorrect-password" },
  });
  check(r.response.status === 401, "wrong password rejected");
  r = await call("/api/auth/login", {
    method: "POST",
    data: { email: a.email, password: a.password },
  });
  check(r.response.status === 200 && r.cookie, "correct password creates session");
  const newCookie = r.cookie;
  const sessionHeader = r.response.headers.get("set-cookie") || "";
  check(
    /httponly/i.test(sessionHeader) && /samesite=lax/i.test(sessionHeader),
    "session has HttpOnly and SameSite protections",
  );
  let videoId;
  if (process.argv.includes("--live")) {
    console.log("Running live Gemini research and storyboard generation...");
    r = await call("/api/videos", {
      method: "POST",
      cookie: a.cookie,
      data: {
        prompt:
          "Explain how Gutenberg used his screw printing press and movable metal type in Mainz around 1450 for a history class. Show the mechanism.",
        duration: 20,
        aspect: "landscape",
      },
    });
    check(
      r.response.status === 201 && r.body.models?.length > 0 && r.body.video.script === null,
      `live planning returns a model plan (${JSON.stringify(r.body).slice(0, 220)})`,
    );
    videoId = r.body.video.id;
    // Production runs as separate short requests, the way the studio drives it.
    const [build, direct] = await Promise.all([
      call(`/api/videos/${videoId}/build`, {
        method: "POST",
        cookie: a.cookie,
        data: { models: r.body.models.map((m) => m.id) },
      }),
      call(`/api/videos/${videoId}/direct`, { method: "POST", cookie: a.cookie }),
    ]);
    check(build.response.status === 200 && build.body.failed.length === 0, "every planned model builds");
    check(direct.response.status === 200, "storyboard written while models build");
    r = await call(`/api/videos/${videoId}/finish`, { method: "POST", cookie: a.cookie });
    check(r.response.status === 200, `finished film is ready (${JSON.stringify(r.body).slice(0, 220)})`);
    const generated = r.body.video.script;
    check(
      generated.models?.length > 0 && generated.models.every((m) => m.parts?.length > 0),
      "novel models contain generated geometry",
    );
    const ids = new Set(generated.models.map((m) => m.id));
    check(
      generated.scenes.every((s) => s.elements.every((e) => ids.has(e.model))),
      "all scene references resolve to embedded model definitions",
    );
    check(
      generated.models.some((m) => /press/i.test(m.name + " " + m.id)),
      "historical printing press generated without a named-model catalog",
    );
    check(
      r.body.video.status === "ready" && r.body.video.sources.length > 0 && r.body.video.script.scenes.length >= 3,
      "grounded script persisted with sources",
    );
    check(Math.abs(r.body.video.script.totalDuration - 20) < 0.51, "scene duration matches request");
  } else {
    videoId = randomUUID();
    await client.query(
      "INSERT INTO ph_videos(id,user_id,prompt,duration,status) VALUES($1,$2,'Disposable integration fixture',20,'ready')",
      [videoId, a.id],
    );
  }
  r = await call(`/api/videos/${videoId}`, { cookie: b.cookie });
  check(r.response.status === 404, "other user cannot read video");
  r = await call(`/api/videos/${videoId}`, {
    method: "DELETE",
    cookie: b.cookie,
  });
  check(r.response.status === 404, "other user cannot delete video");
  r = await call(`/api/videos/${videoId}/assets/init`, {
    method: "POST",
    cookie: b.cookie,
    data: { mime: "image/gif", totalBytes: 6, chunkCount: 1 },
  });
  check(r.response.status === 404, "other user cannot upload to video");
  const media = Buffer.alloc(1048576 + 43);
  Buffer.from("GIF89a").copy(media);
  r = await call(`/api/videos/${videoId}/assets/init`, {
    method: "POST",
    cookie: a.cookie,
    data: { mime: "image/gif", totalBytes: media.length, chunkCount: 2 },
  });
  check(r.response.status === 201, "multipart upload initialized");
  const assetId = r.body.assetId;
  const upload = `/api/videos/${videoId}/assets/${assetId}`;
  r = await call(upload + "/complete", { method: "POST", cookie: a.cookie });
  check(r.response.status === 409, "incomplete upload cannot finalize");
  for (let i = 0; i < 2; i++) {
    r = await call(upload + `/chunks/${i}`, {
      method: "PUT",
      cookie: a.cookie,
      raw: media.subarray(i * 1048576, (i + 1) * 1048576),
    });
    check(r.response.status === 200, `chunk ${i} persists`);
  }
  r = await call(upload + "/chunks/0", {
    method: "PUT",
    cookie: a.cookie,
    raw: media.subarray(0, 1048576),
  });
  check(r.response.status === 200, "chunk retry is idempotent");
  r = await call(upload + "/complete", { method: "POST", cookie: a.cookie });
  check(
    r.response.status === 200 && r.body.sha256 === createHash("sha256").update(media).digest("hex"),
    "completed media checksum matches",
  );
  const mediaPath = r.body.mediaUrl;
  let download = await fetch(base + mediaPath, {
    headers: { Cookie: a.cookie },
  });
  const actual = Buffer.from(await download.arrayBuffer());
  check(actual.equals(media), "streamed download matches all uploaded bytes");
  download = await fetch(base + mediaPath, {
    headers: { Cookie: a.cookie, Range: "bytes=1048570-1048580" },
  });
  check(
    download.status === 206 && Buffer.from(await download.arrayBuffer()).equals(media.subarray(1048570, 1048581)),
    "range request crosses chunk boundary correctly",
  );
  r = await call(mediaPath, { cookie: b.cookie });
  check(r.response.status === 404, "other user cannot download media");
  r = await call(`/api/videos/${videoId}`, { cookie: a.cookie });
  check(r.body.video.status === "rendered" && r.body.video.gifUrl, "saved render updates video library fields");
  // Exercise the new HD path with an actual browser export when supplied.
  // The tiny default only tests container routing/storage, not decoder validity.
  const movie = process.env.TEST_MOVIE_PATH
    ? readFileSync(process.env.TEST_MOVIE_PATH)
    : Buffer.from("000000186674797069736f6d0000020069736f6d69736f32", "hex");
  const movieChunks = Math.ceil(movie.length / 1048576);
  r = await call(`/api/videos/${videoId}/assets/init`, {
    method: "POST",
    cookie: a.cookie,
    data: { mime: "video/mp4", totalBytes: movie.length, chunkCount: movieChunks },
  });
  check(r.response.status === 201, "HD movie upload initialized");
  const movieAssetId = r.body.assetId;
  const movieUpload = `/api/videos/${videoId}/assets/${movieAssetId}`;
  for (let i = 0; i < movieChunks; i++) {
    r = await call(movieUpload + `/chunks/${i}`, {
      method: "PUT",
      cookie: a.cookie,
      raw: movie.subarray(i * 1048576, (i + 1) * 1048576),
    });
    assert.equal(r.response.status, 200);
  }
  r = await call(movieUpload + "/complete", { method: "POST", cookie: a.cookie });
  check(
    r.response.status === 200 && r.body.sha256 === createHash("sha256").update(movie).digest("hex"),
    "HD movie checksum matches",
  );
  r = await call(`/api/videos/${videoId}`, { cookie: a.cookie });
  check(
    r.body.video.movieMime === "video/mp4" && r.body.video.movieUrl?.includes(movieAssetId),
    "detail selects saved HD movie alongside legacy GIF",
  );
  const moviePath = r.body.video.movieUrl;
  download = await fetch(base + moviePath, { headers: { Cookie: a.cookie } });
  check(
    download.headers.get("content-type") === "video/mp4" && Buffer.from(await download.arrayBuffer()).equals(movie),
    "HD movie downloads with exact bytes and MIME",
  );
  r = await call(moviePath, { cookie: b.cookie });
  check(r.response.status === 404, "other user cannot download HD movie");
  r = await call("/api/videos", {
    method: "POST",
    cookie: a.cookie,
    data: { prompt: "Generate graphic gore for entertainment", duration: 20 },
  });
  check(r.response.status === 422, "unsafe prompt rejected before generation");
  // The first step is a real gate, and declined attempts never become drafts.
  r = await call("/api/videos", {
    method: "POST",
    cookie: a.cookie,
    data: { prompt: "nude avatars", duration: 20 },
  });
  check(r.response.status === 422, "nudity rejected by the input gate");
  const blocked = await client.query("SELECT id FROM ph_videos WHERE user_id=$1 AND prompt=$2", [a.id, "nude avatars"]);
  check(blocked.rowCount === 0, "declined attempt is deleted, not saved as a draft");
  const audit = await client.query("SELECT details FROM ph_audit WHERE user_id=$1 AND details->>'rule'='nudity'", [
    a.id,
  ]);
  check(
    audit.rows.some(({ details }) => details.stage === "input" && details.source === "keyword"),
    "nudity rejection audited before research",
  );
  const unfinished = randomUUID(),
    stale = randomUUID();
  await client.query(
    "INSERT INTO ph_videos(id,user_id,prompt,duration,status,updated_at) VALUES($1,$3,'unfinished fixture',20,'ready',now()),($2,$3,'stale fixture',20,'ready',now()-interval '31 minutes')",
    [unfinished, stale, a.id],
  );
  r = await call("/api/videos", { cookie: a.cookie });
  check(
    r.body.videos.every((v) => v.status === "rendered"),
    "library only lists completed films",
  );
  check(
    (await client.query("SELECT id FROM ph_videos WHERE id=$1", [stale])).rowCount === 0,
    "abandoned attempts cleaned up",
  );
  r = await call(`/api/videos/${unfinished}?incomplete=1`, { method: "DELETE", cookie: a.cookie });
  check(
    r.response.status === 200 &&
      (await client.query("SELECT id FROM ph_videos WHERE id=$1", [unfinished])).rowCount === 0,
    "cancel discards incomplete film",
  );
  await call(`/api/videos/${videoId}?incomplete=1`, { method: "DELETE", cookie: a.cookie });
  check(
    (await client.query("SELECT id FROM ph_videos WHERE id=$1", [videoId])).rowCount === 1,
    "late cancellation preserves a completed film",
  );
  r = await call("/api/auth/logout", { method: "POST", cookie: newCookie });
  check(r.response.status === 200, "logout succeeds");
  r = await call("/api/auth/me", { cookie: newCookie });
  check(r.body.user === null, "logout revokes session server-side");
  r = await call("/api/auth/me", { method: "DELETE", cookie: a.cookie });
  check(r.response.status === 200, "account deletion works");
  const {
    rows: [count],
  } = await client.query("SELECT count(*)::int AS count FROM ph_videos WHERE user_id=$1", [a.id]);
  check(count.count === 0, "account deletion removes owned videos and media");
  console.log(`ALL ${checks} BACKEND CHECKS PASSED`);
} finally {
  for (const account of accounts)
    await client.query("DELETE FROM ph_users WHERE id=$1 AND email=$2", [account.id, account.email]);
  const localKey = createHash("sha256").update("localhost").digest("hex");
  await client.query("UPDATE ph_rate_limits SET count=GREATEST(0,count-$2) WHERE key=$1", [
    "signup:" + localKey,
    accounts.length,
  ]);
  await client.end();
}
