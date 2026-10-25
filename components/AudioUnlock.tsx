"use client";
import { useEffect } from "react";
import { primeAmbience } from "@/lib/audio/ambience";

/** Browsers block sound until a gesture. Remember the first click so the film can start already set to on. */
export function AudioUnlock() {
  useEffect(() => {
    const arm = () => {
      void primeAmbience();
    };
    document.addEventListener("pointerdown", arm, true);
    document.addEventListener("keydown", arm, true);
    return () => {
      document.removeEventListener("pointerdown", arm, true);
      document.removeEventListener("keydown", arm, true);
    };
  }, []);
  return null;
}
