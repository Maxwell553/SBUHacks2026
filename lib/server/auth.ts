import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { z } from "zod";
import { query } from "@/lib/server/db";
import { ApiError } from "@/lib/server/http";
const scrypt = promisify(scryptCallback);
const cookieName = "polyhistor_session";
export type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((x) => x.toLowerCase()),
  password: z.string().min(10).max(128),
});
export const signupSchema = loginSchema.extend({
  name: z.string().trim().min(1).max(80),
  acceptTerms: z.literal(true),
  termsVersion: z.literal("2026-10-23").optional(),
});
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function publicUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await query("INSERT INTO ph_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')", [
    hash,
    userId,
  ]);
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86400,
  });
}
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const hash = createHash("sha256").update(token).digest("hex");
  const { rows } = await query(
    "SELECT u.* FROM ph_sessions s JOIN ph_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [hash],
  );
  return rows[0] ? publicUser(rows[0]) : null;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Please sign in to continue.");
  return user;
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token)
    await query("DELETE FROM ph_sessions WHERE token_hash=$1", [createHash("sha256").update(token).digest("hex")]);
  jar.set(cookieName, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
export { randomUUID };
