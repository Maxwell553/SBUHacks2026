"use client";
import { useEffect, useRef, useState } from "react";
import type { Aspect, VideoScript } from "@/lib/schema/video";
import { Ambience, primeAmbience, type Voice } from "@/lib/audio/ambience";
import { loadNarration } from "@/lib/audio/narration";
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
  narrationUrl,
}: {
  script: VideoScript;
  aspect?: Aspect;
  autoPlay?: boolean;
  loop?: boolean;
  maxPixelRatio?: number;
  showControls?: boolean;
  className?: string;
  /** The film's recorded narration, mixed into its soundtrack. */
  narrationUrl?: string | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PolyEngine | null>(null);
  const timeRef = useRef(0);
  const playingRef = useRef(autoPlay);
  const visibleRef = useRef(true);
  const ambienceRef = useRef<Ambience | null>(null);
  const voiceRef = useRef<Voice>(narrationUrl ? "loading" : undefined);
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
    if (!narrationUrl) {
      voiceRef.current = undefined;
      return;
    }
    let current = true;
    voiceRef.current = "loading";
    void loadNarration(narrationUrl).then((voice) => {
      if (current) voiceRef.current = voice ?? undefined;
    });
    return () => {
      current = false;
    };
  }, [narrationUrl]);

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

    // The switch defaults to on. Browsers still block audio until a gesture, and a click
    // anywhere on the page counts — the player does not have to be on screen yet.
    const startAmbience = () => {
      if (!showControls || !ambientEnabled.current) return;
      try {
        void primeAmbience();
        ambienceRef.current ??= new Ambience();
        void ambienceRef.current.resume().then((running) => {
          if (!running || !ambienceRef.current || !engineRef.current) return;
          ambienceRef.current.sync(
            script,
            timeRef.current,
            playingRef.current && visibleRef.current && !document.hidden,
            voiceRef.current,
          );
        });
      } catch {
        setAudioError("Sound is unavailable in this browser.");
      }
    };

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
        startAmbience();
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
          const active = playingRef.current && visibleRef.current && !document.hidden;
          ambienceRef.current?.sync(script, timeRef.current, active && ambientEnabled.current, voiceRef.current);
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

    document.addEventListener("pointerdown", startAmbience, true);
    document.addEventListener("keydown", startAmbience, true);
    const visibility = () => {
      if (document.hidden) ambienceRef.current?.sync(script, timeRef.current, false, voiceRef.current);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("pointerdown", startAmbience, true);
      document.removeEventListener("keydown", startAmbience, true);
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
      ambienceRef.current ??= new Ambience();
      const wasRunning = ambienceRef.current.isRunning();
      const running = await primeAmbience();
      const audible = visibleRef.current && !document.hidden;
      // The control already says on before the browser has allowed sound. That click
      // should start it, not flip the preference off.
      if (ambientEnabled.current && !wasRunning) {
        if (!running) {
          setAudioError("Tap Sound to turn it on.");
          return;
        }
        playingRef.current = true;
        setPlaying(true);
        ambienceRef.current.sync(script, timeRef.current, audible, voiceRef.current);
        return;
      }
      ambientEnabled.current = !ambientEnabled.current;
      setAmbient(ambientEnabled.current);
      if (ambientEnabled.current) {
        playingRef.current = true;
        setPlaying(true);
      }
      ambienceRef.current.sync(script, timeRef.current, ambientEnabled.current && audible, voiceRef.current);
    } catch {
      setAudioError("Sound is unavailable in this browser.");
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
            aria-label="Sound"
            aria-checked={ambient}
            onClick={toggleAmbience}
            title="Narration, music and the sounds of the shot. Saved films include the same track"
          >
            {ambient ? "Sound on" : "Sound off"}
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
