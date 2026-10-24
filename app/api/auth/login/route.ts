import { loginSchema, verifyPassword, createSession, publicUser } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { createHash } from "node:crypto";
import { body, sameOrigin, limit, requestKey, json, failure, ApiError } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await limit("login:" + requestKey(request), 30, 900);
    const parsed = loginSchema.safeParse(await body(request));
    if (!parsed.success) throw new ApiError(401, "Email or password is incorrect.");
    const { email, password } = parsed.data;
    await limit("login-email:" + createHash("sha256").update(email).digest("hex"), 15, 900);
    const { rows } = await query("SELECT * FROM ph_users WHERE email=$1", [email]);
    const stored = rows[0]?.password_hash ?? "00000000000000000000000000000000:" + "00".repeat(64);
    const valid = await verifyPassword(password, stored);
    if (!rows[0] || !valid) throw new ApiError(401, "Email or password is incorrect.");
    await createSession(rows[0].id);
    return json({ user: publicUser(rows[0]) });
  } catch (error) {
    return failure(error);
  }
}
