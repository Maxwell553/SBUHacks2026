"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useInView } from "@/components/three/useInView";
import { LANDMARKS, type Landmark } from "@/lib/content/landmarks";

const HOLD_MS = 5200;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

type Vars = CSSProperties & Record<`--${string}`, string | number>;
type SceneState = "active" | "leaving";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function Backdrop({ landmark, state }: { landmark: Landmark; state: SceneState }) {
  const [x, y] = landmark.sunAt;
  return (
    <div className="reel-scene" data-state={state}>
      <div className="reel-glow" style={{ "--sky": landmark.sky } as Vars} />
      <div className="reel-sun" style={{ left: `${x}%`, top: `${y}%`, background: landmark.sun }} />
    </div>
  );
}

function Foreground({ landmark, state }: { landmark: Landmark; state: SceneState }) {
  return (
    <div className="reel-scene" data-state={state}>
      <svg className="reel-land" viewBox="0 0 100 40" preserveAspectRatio="none">
        {landmark.land.map(([fill, points], i) => (
          <polygon key={i} fill={fill} points={points} />
        ))}
        {landmark.glints?.map(([x, y, length], i) => (
          <line key={i} className="reel-glint" x1={x} x2={x + length} y1={y} y2={y} style={{ "--n": i } as Vars} />
        ))}
      </svg>
      <svg className="reel-art" viewBox="-20 0 300 200" preserveAspectRatio="xMidYMax meet">
        {landmark.art.map((f, i) => (
          <polygon key={i} fill={f.fill} points={f.points} style={{ "--rise": f.rise } as Vars} />
        ))}
      </svg>
    </div>
  );
}

function Sky() {
  return (
    <div className="reel-sky">
      <div className="reel-drift cloud-one">
        <svg className="reel-cloud" viewBox="0 0 60 22">
          <polygon fill="#fffdf8" points="4,20 10,12 18,10 24,4 34,3 42,8 50,9 56,16 58,20" />
          <polygon fill="#efe8db" points="4,20 58,20 50,16 30,15 12,17" />
        </svg>
      </div>
      <div className="reel-drift cloud-two">
        <svg className="reel-cloud" viewBox="0 0 60 22">
          <polygon fill="#fffdf8" points="2,20 8,14 16,13 22,7 30,8 36,12 44,10 52,15 56,20" />
          <polygon fill="#efe8db" points="2,20 56,20 46,16 26,16 10,18" />
        </svg>
      </div>
      <div className="reel-drift birds">
        <svg className="reel-birds" viewBox="0 0 40 16">
          <path d="M1 6l4 3 4-3" />
          <path d="M14 2l3 2.4 3-2.4" />
          <path d="M25 9l3.5 2.6L32 9" />
        </svg>
      </div>
    </div>
  );
}

/** Low-poly landmarks from around the world that build themselves, one after another. */
export function LandmarkReel() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduce = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
  const [reel, setReel] = useState({ step: 0, prev: -1 });
  const playing = inView && !reduce;
  const index = reel.step % LANDMARKS.length;
  const landmark = LANDMARKS[index];
  const scenes = LANDMARKS.flatMap((l, i): [Landmark, SceneState][] =>
    i === index ? [[l, "active"]] : i === reel.prev ? [[l, "leaving"]] : [],
  );

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(
      () => setReel(({ step }) => ({ step: step + 1, prev: step % LANDMARKS.length })),
      HOLD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playing, reel.step]);

  return (
    <div
      ref={ref}
      className="landmark-reel"
      data-playing={playing ? "" : undefined}
      style={{ "--turn": `${reel.step * 32}deg` } as Vars}
    >
      <div className="preview-scene" aria-hidden="true">
        <div className="reel-layer">
          {scenes.map(([l, state]) => (
            <Backdrop key={l.name} landmark={l} state={state} />
          ))}
        </div>
        <div className="preview-orbit orbit-one" />
        <div className="preview-orbit orbit-two" />
        <Sky />
        <div className="reel-layer">
          {scenes.map(([l, state]) => (
            <Foreground key={l.name} landmark={l} state={state} />
          ))}
        </div>
      </div>
      <div className="reel-caption">
        <p key={index}>
          <strong>{landmark.name}</strong>
          <span>
            {landmark.place} · {landmark.era}
          </span>
        </p>
      </div>
    </div>
  );
}
