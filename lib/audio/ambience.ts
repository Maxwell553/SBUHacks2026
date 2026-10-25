import type { VideoScript } from "@/lib/schema/video";
import { renderSoundtrack } from "@/lib/audio/soundtrack";

let shared: AudioContext | null = null;
const rendered = new WeakMap<VideoScript, AudioBuffer>();

/** One context for the page, created inside a click so later films can play without another gesture. */
export function ambienceContext() {
  if (!shared || shared.state === "closed") shared = new AudioContext();
  return shared;
}

export function primeAmbience() {
  const context = ambienceContext();
  if (context.state === "running") return Promise.resolve(true);
  return context.resume().then(() => context.state === "running");
}

/**
 * Plays the film's own soundtrack in step with the picture.
 * The buffer is the same one baked into a saved movie.
 */
export class Ambience {
  private context = ambienceContext();
  private gain = this.context.createGain();
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private startedAt = 0;
  private offset = 0;

  constructor() {
    this.gain.gain.value = 0;
    this.gain.connect(this.context.destination);
  }

  isRunning() {
    return this.context.state === "running";
  }

  async resume() {
    if (this.context.state === "closed") return false;
    if (this.context.state !== "running") await this.context.resume();
    return this.context.state === "running";
  }

  /** `time` is the film clock in seconds. `active` is false while paused, hidden or muted. */
  sync(script: VideoScript, time: number, active: boolean) {
    if (this.context.state !== "running") return;
    let buffer = rendered.get(script);
    if (!buffer) {
      buffer = renderSoundtrack(script);
      rendered.set(script, buffer);
    }
    if (buffer !== this.buffer) {
      this.buffer = buffer;
      this.stop();
    }
    if (!active || !this.buffer) {
      this.stop();
      return;
    }
    const now = this.context.currentTime;
    const expected = this.source ? this.offset + (now - this.startedAt) : Number.NaN;
    if (!this.source || Math.abs(expected - time) > 0.35) this.playAt(time);
  }

  dispose() {
    this.stop();
    this.gain.disconnect();
  }

  private playAt(time: number) {
    if (!this.buffer) return;
    this.stop();
    const src = this.context.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gain);
    const offset = Math.min(Math.max(0, time), Math.max(0, this.buffer.duration - 0.05));
    const now = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(0, now);
    this.gain.gain.linearRampToValueAtTime(0.95, now + 0.06);
    src.start(now, offset);
    this.source = src;
    this.startedAt = now;
    this.offset = offset;
  }

  private stop() {
    if (!this.source) return;
    try {
      this.source.stop();
    } catch {
      /* already stopped */
    }
    this.source.disconnect();
    this.source = null;
  }
}
