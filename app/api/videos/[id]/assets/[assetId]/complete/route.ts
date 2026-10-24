import { requireUser } from "@/lib/server/auth";
import { sameOrigin, json, failure } from "@/lib/server/http";
import { completeUpload } from "@/lib/server/media";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string; assetId: string }> }) {
  try {
    sameOrigin(request);
    const user = await requireUser();
    const p = await context.params;
    return json(await completeUpload(p.id, p.assetId, user.id));
  } catch (error) {
    return failure(error);
  }
}
