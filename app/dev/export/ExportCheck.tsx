"use client";
import { useState } from "react";
import { exportVideo, type ExportProgress } from "@/lib/render/export";
import { SHOWCASE_SCRIPT } from "@/lib/content/showcase";
import type { Aspect } from "@/lib/schema/video";

/** Development-only harness: exports the showcase script and reports size/timing. */
export function ExportCheck() {
  const [aspect, setAspect] = useState<Aspect>("landscape");
  const [p, setP] = useState<ExportProgress | null>(null);
  const [out, setOut] = useState<{
    gif: string;
    poster: string;
    bytes: number;
    frames: number;
    fps: number;
    ms: number;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setErr(null);
    setOut(null);
    const t0 = performance.now();
    try {
      const r = await exportVideo(SHOWCASE_SCRIPT, { aspect, onProgress: setP });
      setOut({
        gif: URL.createObjectURL(r.gif),
        poster: URL.createObjectURL(r.poster),
        bytes: r.gif.size,
        frames: r.frames,
        fps: r.fps,
        ms: Math.round(performance.now() - t0),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <h1 style={{ fontSize: 32 }}>Export check (development only)</h1>
      <div className="row">
        <div className="seg">
          <button aria-pressed={aspect === "landscape"} onClick={() => setAspect("landscape")}>
            Widescreen
          </button>
          <button aria-pressed={aspect === "portrait"} onClick={() => setAspect("portrait")}>
            Vertical
          </button>
        </div>
        <button className="btn small" id="run-export" onClick={run}>
          Export showcase GIF
        </button>
      </div>
      {p ? (
        <p className="mono" id="export-progress">
          {p.phase} {Math.round(p.fraction * 100)}% {p.frame ? `frame ${p.frame}/${p.frames}` : ""}
        </p>
      ) : null}
      {err ? (
        <div className="notice error" id="export-error">
          {err}
        </div>
      ) : null}
      {out ? (
        <div className="stack" id="export-result">
          <p className="mono">
            {out.frames} frames @ {out.fps} fps · {(out.bytes / 1024 / 1024).toFixed(2)} MB ·{" "}
            {(out.ms / 1000).toFixed(1)} s
          </p>
          <div className="split">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={out.gif} alt="Exported GIF" style={{ width: "100%", borderRadius: 16 }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={out.poster} alt="Poster" style={{ width: "100%", borderRadius: 16 }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
