import { currentUser } from "@/lib/server/auth";
import { json, failure } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET() {
  try {
    return json({ user: await currentUser() });
  } catch (error) {
    return failure(error);
  }
}

import { requireUser, logout } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/http";
import { deleteAccountData } from "@/lib/server/account";
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser();
    await deleteAccountData(user.id);
    await logout();
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
