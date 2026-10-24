"use client";

// Replaces the root layout when it fails, so it carries its own minimal styling.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#fbf7ef",
          color: "#253b38",
          fontFamily: "Tessera, system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <title>Polyhistor — something went wrong</title>
        <div style={{ maxWidth: 520, display: "grid", gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 32 }}>Polyhistor is having a moment</h1>
          <p style={{ margin: 0, fontSize: 18, lineHeight: 1.6 }}>
            Something went wrong while loading the site. Please try again in a few minutes.
          </p>
          <button
            onClick={() => retry()}
            style={{
              justifySelf: "center",
              padding: "12px 22px",
              borderRadius: 999,
              border: 0,
              background: "#246d62",
              color: "#fffdf8",
              fontSize: 17,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
