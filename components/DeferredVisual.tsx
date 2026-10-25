"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode, type ComponentProps } from "react";
import type { ModelTurntable as Turntable } from "@/components/three/ModelTurntable";
import type { Player as FilmPlayer } from "@/components/Player";

const Hero = dynamic(() => import("@/components/three/HeroScene").then((m) => m.HeroScene), { ssr: false });
const Model = dynamic(() => import("@/components/three/ModelTurntable").then((m) => m.ModelTurntable), { ssr: false });
const Player = dynamic(() => import("@/components/Player").then((m) => m.Player), { ssr: false });

function NearViewport({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: "100%", height: "100%" }}>
      {mounted ? children : <div className="visual-placeholder" aria-hidden="true" />}
    </div>
  );
}
export function HeroScene() {
  const [load, setLoad] = useState(false);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(() => setLoad(true), { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(() => setLoad(true), 400);
    return () => clearTimeout(id);
  }, []);
  return (
    <div
      className="hero-interactive"
      data-ready={ready || undefined}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
    >
      <div className="scene-label">
        <span className="mono">ONE GIANT LEAP</span>
        <span>{ready && (hover || focus) ? "Drag to look around" : "A moment that changed our world"}</span>
      </div>
      {/* A real frame from the diorama keeps first paint light; WebGL loads when the page is idle and fades in over it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/apollo-11-diorama.webp"
        width={900}
        height={900}
        alt="Apollo 11: the gold lunar module Eagle, an astronaut and a flag on the Moon"
        aria-hidden={ready || undefined}
        fetchPriority="high"
      />
      {load ? <Hero onReady={() => setReady(true)} /> : null}
    </div>
  );
}
export function ModelTurntable(props: ComponentProps<typeof Turntable>) {
  return (
    <NearViewport>
      <Model {...props} />
    </NearViewport>
  );
}
export function DeferredPlayer(props: ComponentProps<typeof FilmPlayer>) {
  return (
    <div style={{ aspectRatio: props.aspect === "portrait" ? "9 / 16" : "16 / 9" }}>
      <NearViewport>
        <Player {...props} />
      </NearViewport>
    </div>
  );
}
