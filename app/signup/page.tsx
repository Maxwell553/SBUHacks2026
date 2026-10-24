import { safeNextPath } from "@/lib/shared/navigation";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";
import { getViewer } from "@/lib/server/viewer";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string; q?: string }> }) {
  const { next, q } = await searchParams;
  let safe = safeNextPath(next);
  if (!safe && typeof q === "string" && q.trim()) safe = `/studio?q=${encodeURIComponent(q.slice(0, 2000))}`;
  if (await getViewer()) redirect(safe ?? "/studio");
  return (
    <AuthShell
      quote={
        <>
          Every video you make is saved with your question and the sources behind it, so you can come back and keep
          learning.
        </>
      }
    >
      <AuthForm mode="signup" next={safe} />
    </AuthShell>
  );
}
