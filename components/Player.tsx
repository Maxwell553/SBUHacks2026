"use client";
import { useEffect, useRef, useState } from "react";
import type { Aspect, VideoScript } from "@/lib/schema/video";
import { Ambience } from "@/lib/audio/ambience";
import type { PolyEngine } from "@/lib/lowpoly/engine";

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export function Player({
  script,
  aspect = "landscape",
  autoPlay = true,
  loop = true,
  maxPixelRatio = 1.5,
  showControls = true,
  className,
}: {
  script: VideoScript;
  aspect?: Aspect;
  autoPlay?: boolean;
  loop?: boolean;
  maxPixelRatio?: number;
  showControls?: boolean;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PolyEngine | null>(null);
  const timeRef = useRef(0);
  const playingRef = useRef(autoPlay);
  const visibleRef = useRef(true);
  const ambienceRef = useRef<Ambience | null>(null);
  const ambientEnabled = useRef(true);
  const [ambient, setAmbient] = useState(true);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(autoPlay);
  const [time, setTime] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shownScript, setShownScript] = useState(script);
  const [shownAspect, setShownAspect] = useState(aspect);
  if (shownScript !== script || shownAspect !== aspect) {
    setShownAspect(aspect);
    setShownScript(script);
    setReady(false);
    setError(null);
    setTime(0);
    setAmbient(true);
  }

  useEffect(() => {
    ambientEnabled.current = true;
    let disposed = false;
    let raf = 0;
    let last = performance.now();
    let uiTick = 0;
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    let ro: ResizeObserver | null = null;
    let io: IntersectionObserver | null = null;

    (async () => {
      try {
        const { PolyEngine } = await import("@/lib/lowpoly/engine");
        await PolyEngine.loadFonts();
        if (disposed) return;
        const w = Math.max(160, wrap.clientWidth);
        const h = Math.round(aspect === "portrait" ? (w * 16) / 9 : (w * 9) / 16);
        const pr = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
        const engine = new PolyEngine(script, { width: w, height: h, pixelRatio: pr, canvas });
        engineRef.current = engine;
        timeRef.current = 0;
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
          playingRef.current = false;
          setPlaying(false);
        }
        engine.renderAt(0);
        setReady(true);
        ro = new ResizeObserver(() => {
          const nw = Math.max(160, wrap.clientWidth);
          const nh = Math.round(aspect === "portrait" ? (nw * 16) / 9 : (nw * 9) / 16);
          engine.setSize(nw, nh, Math.min(window.devicePixelRatio || 1, maxPixelRatio));
          engine.renderAt(timeRef.current);
        });
        ro.observe(wrap);
        io = new IntersectionObserver(
          ([e]) => {
            visibleRef.current = e.isIntersecting;
          },
          { threshold: 0.05 },
        );
        io.observe(wrap);
        const loopFn = (now: number) => {
          raf = requestAnimationFrame(loopFn);
          const dt = Math.min(0.1, (now - last) / 1000);
          last = now;
          const audioScene = engine.sceneAt(timeRef.current).index;
          const active = playingRef.current && visibleRef.current && !document.hidden;
          ambienceRef.current?.update(script.scenes[audioScene], timeRef.current, active && ambientEnabled.current);
          if (!active) return;
          let t = timeRef.current + dt;
          if (t >= engine.duration) {
            if (loop) t = 0;
            else {
              t = engine.duration - 0.001;
              playingRef.current = false;
              setPlaying(false);
            }
          }
          timeRef.current = t;
          const { index, local } = engine.sceneAt(t);
          if (local > script.scenes[index].duration * 0.6) engine.prepare(index + 1);
          engine.renderAt(t);
          if (++uiTick % 6 === 0) setTime(t);
        };
        raf = requestAnimationFrame(loopFn);
      } catch (e) {
        setError(e instanceof Error ? e.message : "This browser could not start WebGL.");
      }
    })();

    // Browsers require a gesture for sound; the preference is on from first load.
    const unlockAudio = () => {
      if (!showControls || !visibleRef.current || !ambientEnabled.current) return;
      try {
        ambienceRef.current ??= new Ambience();
        void ambienceRef.current.resume().catch(() => setAudioError("Tap Ambience to enable sound."));
      } catch {
        setAudioError("Ambient audio is unavailable in this browser.");
      }
    };
    document.addEventListener("pointerdown", unlockAudio);
    document.addEventListener("keydown", unlockAudio);
    const visibility = () => {
      if (document.hidden) ambienceRef.current?.update(script.scenes[0], 0, false);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
      ambienceRef.current?.dispose();
      ambienceRef.current = null;
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [script, aspect, loop, maxPixelRatio, showControls]);

  const toggle = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!playingRef.current && timeRef.current >= engine.duration - 0.01) timeRef.current = 0;
    playingRef.current = !playingRef.current;
    setPlaying(playingRef.current);
  };

  const seek = (t: number) => {
    timeRef.current = t;
    setTime(t);
    engineRef.current?.renderAt(t);
  };

  const toggleAmbience = async () => {
    setAudioError(null);
    try {
      if (!ambienceRef.current) ambienceRef.current = new Ambience();
      await ambienceRef.current.resume();
      ambientEnabled.current = !ambientEnabled.current;
      setAmbient(ambientEnabled.current);
      if (ambientEnabled.current) {
        playingRef.current = true;
        setPlaying(true);
      } else
        ambienceRef.current.update(
          script.scenes[engineRef.current?.sceneAt(timeRef.current).index ?? 0],
          timeRef.current,
          false,
        );
    } catch {
      setAudioError("Ambient audio is unavailable in this browser.");
    }
  };

  return (
    <div className={className}>
      <div
        ref={wrapRef}
        className="player"
        style={{
          aspectRatio: aspect === "portrait" ? "9 / 16" : "16 / 9",
          width: aspect === "portrait" ? "min(100%, 43.875vh)" : "100%",
          margin: aspect === "portrait" ? "0 auto" : undefined,
        }}
      >
        <canvas ref={canvasRef} aria-label={`Animated film: ${script.title}`} onClick={toggle} />
        {!ready && !error ? (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <span className="chip teal">Setting the scene…</span>
          </div>
        ) : null}
        {error ? (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 20 }}>
            <div className="notice error">
              This video needs 3D graphics (WebGL), which this browser couldn’t start. {error}
            </div>
          </div>
        ) : null}
      </div>
      {showControls ? (
        <div className="player-controls">
          <button className="icon-btn" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
            {playing ? "❚❚" : "▶"}
          </button>
          <input
            className="scrub"
            type="range"
            min={0}
            max={script.totalDuration}
            step={0.05}
            value={time}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Seek"
          />
          <span className="mono faint" style={{ fontSize: 12, minWidth: 84, textAlign: "right" }}>
            {fmt(time)} / {fmt(script.totalDuration)}
          </span>
          <button
            className={`chip ${ambient ? "teal" : ""}`}
            role="switch"
            aria-label="Ambience"
            aria-checked={ambient}
            onClick={toggleAmbience}
            title="Environmental sound in the player; saved HD videos also include ambience"
          >
            {ambient ? "Ambience on" : "Ambience off"}
          </button>
        </div>
      ) : null}
      {audioError ? (
        <p className="hint" role="status">
          {audioError}
        </p>
      ) : null}
    </div>
  );
}
