import { requireUser } from "@/lib/server/auth";
import { body, sameOrigin, json, failure, ApiError, limit } from "@/lib/server/http";
import { uploadSchema, createUpload } from "@/lib/server/media";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const user = await requireUser();
    await limit("upload:" + user.id, 40, 3600);
    const parsed = uploadSchema.safeParse(await body(request));
    if (!parsed.success) throw new ApiError(400, "Invalid upload metadata. Maximum render size is 32 MiB.");
    return json(await createUpload((await context.params).id, user.id, parsed.data), 201);
  } catch (error) {
    return failure(error);
  }
}
