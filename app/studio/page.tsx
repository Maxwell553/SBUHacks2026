import type { Metadata } from "next";
import { Studio } from "@/components/Studio";
import { requireViewer } from "@/lib/server/viewer";

export const metadata: Metadata = { title: "Create a video" };

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  await requireViewer(q ? `/studio?q=${encodeURIComponent(q)}` : "/studio");
  return (
    <div className="container">
      <Studio initialPrompt={typeof q === "string" ? q.slice(0, 2000) : ""} />
    </div>
  );
}
