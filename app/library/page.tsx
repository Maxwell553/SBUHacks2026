import type { Metadata } from "next";
import Link from "next/link";
import { Library } from "@/components/Library";
import { requireViewer } from "@/lib/server/viewer";

export const metadata: Metadata = { title: "Your video library" };

export default async function LibraryPage() {
  const user = await requireViewer("/library");
  return (
    <div className="container" style={{ paddingBottom: 96 }}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Hello, {user.name.split(" ")[0]}</span>
          <h1>Your video library</h1>
          <p className="muted" style={{ marginTop: 10 }}>
            Every video you’ve made, with the question you asked and the sources behind it.
          </p>
        </div>
        <Link className="btn terra" href="/studio">
          Make a new video
        </Link>
      </div>
      <Library />
    </div>
  );
}
