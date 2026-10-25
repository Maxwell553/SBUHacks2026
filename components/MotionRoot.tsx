"use client";

import { MotionConfig } from "motion/react";
import { useSyncExternalStore, type ReactNode } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * Reduced motion is a browser preference, so the server cannot know it.
 * Hydration uses the server snapshot (motion on). The client snapshot
 * applies the real preference, and later changes to the setting update it.
 */
export function useSettledReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

export function MotionRoot({ children }: { children: ReactNode }) {
  const reduce = useSettledReducedMotion();
  return <MotionConfig reducedMotion={reduce ? "always" : "never"}>{children}</MotionConfig>;
}
