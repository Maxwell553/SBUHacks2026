import { safeNextPath } from "@/lib/shared/navigation";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";
import { getViewer } from "@/lib/server/viewer";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safe = safeNextPath(next);
  if (await getViewer()) redirect(safe ?? "/studio");
  return (
    <AuthShell
      quote={
        <>
          “Those who cannot remember the past are condemned to repeat it.”
          <br />
          <span className="faint">— George Santayana, The Life of Reason (1905)</span>
        </>
      }
    >
      <AuthForm mode="login" next={safe} />
    </AuthShell>
  );
}
