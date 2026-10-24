import { query } from "@/lib/server/db";
import { json } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET() {
  try {
    await query("SELECT 1 FROM ph_users LIMIT 0");
    if (!process.env.GEMINI_API_KEY) return json({ ok: false }, 503);
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 503);
  }
}
