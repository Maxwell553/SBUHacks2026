import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server/auth";
import type { User } from "@/lib/client/api";

/** Signed-in user for server components; never throws (DB outages render signed-out). */
export async function getViewer(): Promise<User | null> {
  try {
    return await currentUser();
  } catch {
    return null;
  }
}

export async function requireViewer(next: string): Promise<User> {
  const user = await getViewer();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}
