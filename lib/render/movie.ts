"use client";
import {
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
  BufferTarget,
  CanvasSource,
  AudioBufferSource,
  Quality,
  canEncodeVideo,
  canEncodeAudio,
} from "mediabunny";
import { PolyEngine } from "@/lib/lowpoly/engine";
import type { Aspect, VideoScript } from "@/lib/schema/video";
import { renderSoundtrack } from "@/lib/audio/soundtrack";
import { renderPoster, type ExportProgress } from "@/lib/render/export";

/** Offline timestamps let hardware encoding run faster than playback, with full color and sound. */
export async function exportMovie(
  script: VideoScript,
  options: {
    aspect: Aspect;
    signal?: AbortSignal;
    onProgress?: (p: ExportProgress) => void;
    /** The film's narration stem (mono, 48 kHz), mixed into the soundtrack. */
    voice?: Float32Array;
  },
) {
  const [width, height] = options.aspect === "portrait" ? [720, 1280] : [1280, 720];
  const fps = 30;
  const videoOptions = { width, height, frameRate: fps, bitrate: 3_500_000 };
  const mp4 =
    (await canEncodeVideo("avc", videoOptions)) &&
    (await canEncodeAudio("aac", { sampleRate: 48000, numberOfChannels: 2 }));
  if (
    !mp4 &&
    !(
      (await canEncodeVideo("vp9", videoOptions)) &&
      (await canEncodeAudio("opus", { sampleRate: 48000, numberOfChannels: 2 }))
    )
  )
    throw new Error(
      "HD movie export needs a browser with WebCodecs video and audio encoding, such as current Chrome or Edge.",
    );
  options.signal?.throwIfAborted();
  options.onProgress?.({ phase: "prepare", fraction: 0 });
  await PolyEngine.loadFonts();
  const engine = new PolyEngine(script, { width, height, pixelRatio: 1, shadows: true });
  const target = new BufferTarget();
  const output = new Output({
    target,
    format: mp4 ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
  });
  const video = new CanvasSource(engine.canvas, {
    codec: mp4 ? "avc" : "vp9",
    quality: new Quality({ bitrate: 3_500_000 }),
    // An offline encode: favour quality over per-frame latency.
    latencyMode: "quality",
    keyFrameInterval: 2,
  });
  const audio = new AudioBufferSource({ codec: mp4 ? "aac" : "opus", quality: new Quality({ bitrate: 96000 }) });
  output.addVideoTrack(video, { frameRate: fps });
  output.addAudioTrack(audio);
  const frames = Math.round(script.totalDuration * fps);
  try {
    await output.start();
    await audio.add(renderSoundtrack(script, options.voice));
    audio.close();
    for (let frame = 0; frame < frames; frame++) {
      options.signal?.throwIfAborted();
      engine.renderAt(frame / fps);
      await video.add(frame / fps, 1 / fps);
      if (frame % 12 === 0) {
        options.onProgress?.({ phase: "render", fraction: 0.05 + (0.85 * frame) / frames, frame, frames, fps });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    video.close();
    options.onProgress?.({ phase: "encode", fraction: 0.92 });
    await output.finalize();
    if (!target.buffer) throw new Error("Movie encoding produced no data.");
    const mime = mp4 ? ("video/mp4" as const) : ("video/webm" as const);
    const movie = new Blob([target.buffer], { type: mime });
    if (movie.size > 32 * 1024 * 1024)
      throw new Error("Movie exceeds the upload limit. Please try a shorter duration.");
    const poster = await renderPoster(script, options.aspect);
    options.onProgress?.({ phase: "poster", fraction: 1 });
    return { movie, poster, mime, width, height, fps, frames };
  } catch (error) {
    if (output.state !== "finalized" && output.state !== "canceled") await output.cancel().catch(() => {});
    throw error;
  } finally {
    engine.dispose();
  }
}
