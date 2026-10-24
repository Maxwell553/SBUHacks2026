import { signupSchema, hashPassword, createSession, publicUser, randomUUID } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { body, sameOrigin, limit, requestKey, json, failure, ApiError } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await limit("signup:" + requestKey(request), 10, 3600);
    const parsed = signupSchema.safeParse(await body(request));
    if (!parsed.success)
      throw new ApiError(400, "Enter a name, valid email, password of 10–128 characters, and accept the terms.");
    const { name, email, password } = parsed.data;
    const passwordHash = await hashPassword(password);
    const { rows } = await query(
      "INSERT INTO ph_users(id,name,email,password_hash,terms_accepted_at,terms_version) VALUES($1,$2,$3,$4,now(),'2026-10-23') ON CONFLICT(email) DO NOTHING RETURNING *",
      [randomUUID(), name, email, passwordHash],
    );
    if (!rows[0]) throw new ApiError(409, "An account with this email already exists. Please sign in.");
    await createSession(rows[0].id);
    return json({ user: publicUser(rows[0]) }, 201);
  } catch (error) {
    return failure(error);
  }
}
