import { requireUser } from "@/lib/server/auth";
import { sameOrigin, json, failure } from "@/lib/server/http";
import { writeChunk } from "@/lib/server/media";
export const runtime = "nodejs";
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; assetId: string; index: string }> },
) {
  try {
    sameOrigin(request);
    const user = await requireUser();
    const p = await context.params;
    await writeChunk(request, p.id, p.assetId, Number(p.index), user.id);
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
