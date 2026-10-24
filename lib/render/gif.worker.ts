/// <reference lib="webworker" />
import { GIFEncoder, applyPalette, quantize, type Palette } from "gifenc";

type InMsg =
  | { type: "init"; width: number; height: number; fps: number; colors: number }
  | { type: "frame"; index: number; data: ArrayBuffer; refresh: boolean }
  | { type: "finish" };

let enc: ReturnType<typeof GIFEncoder> | null = null;
let cfg = { width: 0, height: 0, fps: 10, colors: 128 };
let palette: Palette | null = null;

self.onmessage = (ev: MessageEvent<InMsg>) => {
  try {
    const m = ev.data;
    if (m.type === "init") {
      cfg = { width: m.width, height: m.height, fps: m.fps, colors: m.colors };
      enc = GIFEncoder();
      palette = null;
      return;
    }
    if (!enc) throw new Error("encoder not initialised");
    if (m.type === "frame") {
      const rgba = new Uint8ClampedArray(m.data);
      if (!palette || m.refresh) {
        // Fit the palette to a uniform sample rather than sorting every pixel.
        // Full-resolution pixels are still indexed/encoded below.
        const pixels = rgba.length / 4;
        const samples = Math.min(pixels, 16384);
        const sample = new Uint8ClampedArray(samples * 4);
        for (let i = 0; i < samples; i++) {
          const p = Math.floor((i * pixels) / samples) * 4;
          sample.set(rgba.subarray(p, p + 4), i * 4);
        }
        palette = quantize(sample, cfg.colors, { format: "rgb565" });
      }
      const index = applyPalette(rgba, palette, "rgb565");
      enc.writeFrame(index, cfg.width, cfg.height, { palette, delay: Math.round(1000 / cfg.fps), repeat: 0 });
      (self as unknown as Worker).postMessage({ type: "ack", index: m.index });
      return;
    }
    if (m.type === "finish") {
      enc.finish();
      const bytes = enc.bytes();
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      (self as unknown as Worker).postMessage({ type: "done", bytes: buf }, [buf]);
      enc = null;
    }
  } catch (e) {
    (self as unknown as Worker).postMessage({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
