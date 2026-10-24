import { logout } from "@/lib/server/auth";
import { sameOrigin, json, failure } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await logout();
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
