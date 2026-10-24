import type { Metadata } from "next";
import { VideoView } from "@/components/VideoView";
import { requireViewer } from "@/lib/server/viewer";

export const metadata: Metadata = { title: "Video" };

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireViewer(`/videos/${id}`);
  return (
    <div className="container">
      <VideoView id={id} />
    </div>
  );
}
