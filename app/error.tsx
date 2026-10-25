"use client";
import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";

  return (
    <div
      className="container"
      style={{ minHeight: "45vh", display: "grid", placeItems: "center", textAlign: "center", padding: "48px 0" }}
    >
      <div className="stack" style={{ gap: 18, justifyItems: "center", maxWidth: 560 }}>
        <div className="error-art" aria-hidden="true">
          !
        </div>
        <span className="eyebrow">A pause in the story</span>
        <h1 style={{ fontSize: "clamp(32px, 4vw, 44px)" }}>This page didn’t load properly</h1>
        <p className="lead" style={{ margin: "0 auto" }}>
          It’s not something you did. Please try again — and if it keeps happening, come back in a few minutes.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn" onClick={() => retry()}>
            Try again
          </button>
          <Link className="btn ghost" href="/">
            Go home
          </Link>
        </div>
        {digest ? <p className="hint">Reference: {digest}</p> : null}
      </div>
    </div>
  );
}
