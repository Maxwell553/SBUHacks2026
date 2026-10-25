import Link from "next/link";
import { FacetText } from "@/components/FacetText";

export default function NotFound() {
  return (
    <div
      className="container"
      style={{ minHeight: "45vh", display: "grid", placeItems: "center", textAlign: "center", padding: "48px 0" }}
    >
      <div className="stack" style={{ gap: 18, justifyItems: "center" }}>
        <div className="error-art" aria-hidden="true">
          ?
        </div>
        <span className="eyebrow">Error 404</span>
        <FacetText text="Lost in time" style={{ fontSize: "clamp(48px, 8vw, 96px)" }} />
        <p className="lead" style={{ margin: "0 auto" }}>
          This page seems to have slipped out of the history books. Let’s get you back on track.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link className="btn" href="/">
            Go home
          </Link>
          <Link className="btn ghost" href="/studio">
            Create a video
          </Link>
        </div>
      </div>
    </div>
  );
}
