import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { query } from "@/lib/server/db";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function failure(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  console.error("API operation failed", error instanceof Error ? error.name : "UnknownError");
  return json({ error: "The request could not be completed. Please try again." }, 500);
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const protocol = process.env.VERCEL ? "https:" : url.protocol;
  const expected = protocol + "//" + (request.headers.get("host") || url.host);
  const configured = process.env.APP_URL?.replace(/\/$/, "");
  if (!origin || ![expected, configured].filter(Boolean).includes(origin))
    throw new ApiError(403, "Request origin is not allowed.");
}
export async function body(request: Request, max = 16384) {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "A JSON body is required.");
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > max) {
      await reader.cancel();
      throw new ApiError(413, "Request is too large.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "Invalid JSON body.");
  }
}
export function requestKey(request: Request) {
  // Only trust Vercel's platform-set IP header in hosted production. Local callers share a budget.
  const ip = process.env.VERCEL
    ? (request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "unknown")
    : "localhost";
  return createHash("sha256").update(ip).digest("hex");
}
export async function limit(
  key: string,
  maximum: number,
  seconds: number,
  message?: (retryInSeconds: number) => string,
) {
  const { rows } = await query(
    `INSERT INTO ph_rate_limits(key,count,reset_at) VALUES($1,1,now()+$2*interval '1 second')
 ON CONFLICT(key) DO UPDATE SET count=CASE WHEN ph_rate_limits.reset_at<=now() THEN 1 ELSE ph_rate_limits.count+1 END,
 reset_at=CASE WHEN ph_rate_limits.reset_at<=now() THEN now()+$2*interval '1 second' ELSE ph_rate_limits.reset_at END
 RETURNING count, ceil(extract(epoch FROM reset_at-now()))::int AS retry`,
    [key, seconds],
  );
  if (rows[0].count > maximum)
    throw new ApiError(429, message ? message(rows[0].retry) : "Too many requests. Please try again later.");
}
