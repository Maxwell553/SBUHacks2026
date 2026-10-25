/// <reference lib="webworker" />
import type { VideoScript } from "@/lib/schema/video";
import { mixSoundtrack } from "@/lib/audio/soundtrack";

type InMsg = { id: number; script: VideoScript; voice?: Float32Array };

/** Mixes a film's soundtrack off the main thread, so the live player never stalls. */
self.onmessage = (ev: MessageEvent<InMsg>) => {
  const { id, script, voice } = ev.data;
  try {
    const { left, right } = mixSoundtrack(script, voice);
    (self as unknown as Worker).postMessage({ id, left, right }, [left.buffer, right.buffer]);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
};
