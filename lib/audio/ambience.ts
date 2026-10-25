import type { VideoScript } from "@/lib/schema/video";
import { bufferOf, mixSoundtrack } from "@/lib/audio/soundtrack";

let shared: AudioContext | null = null;

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

/** The voice track to mix, or "loading" while it is still being fetched. */
export type Voice = Float32Array | "loading" | undefined;

type Mixed = { left: Float32Array; right: Float32Array };
type Track = { voice: Float32Array | undefined; buffer: AudioBuffer | null };

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (m: Mixed) => void; reject: (e: Error) => void }>();

function soundtrackWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const w = new Worker(new URL("./soundtrack.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev) => {
      const m = ev.data as Partial<Mixed> & { id: number; error?: string };
      const job = pending.get(m.id);
      if (!job) return;
      pending.delete(m.id);
      if (m.left && m.right) job.resolve({ left: m.left, right: m.right });
      else job.reject(new Error(m.error ?? "The soundtrack could not be mixed."));
    };
    w.onerror = () => {
      for (const job of pending.values()) job.reject(new Error("The soundtrack worker stopped."));
      pending.clear();
      w.terminate();
      worker = null;
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

/** Mixes in a worker so the picture never stalls; without one, on the main thread after this frame. */
function mix(script: VideoScript, voice?: Float32Array): Promise<Mixed> {
  const local = () => new Promise<Mixed>((resolve) => setTimeout(() => resolve(mixSoundtrack(script, voice)), 0));
  const w = soundtrackWorker();
  if (!w) return local();
  const id = nextId++;
  return new Promise<Mixed>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, script, voice });
  }).catch(local);
}

const tracks = new WeakMap<VideoScript, Track>();

/** The film's soundtrack, mixed once per script and voice. `buffer` is null until it is ready. */
function trackOf(script: VideoScript, voice: Float32Array | undefined): Track {
  const known = tracks.get(script);
  if (known && known.voice === voice) return known;
  const track: Track = { voice, buffer: null };
  tracks.set(script, track);
  void mix(script, voice)
    .then(({ left, right }) => {
      track.buffer = bufferOf(left, right);
    })
    .catch(() => {
      /* the film plays silently */
    });
  return track;
}

/**
 * Plays the film's own soundtrack in step with the picture: narration, score
 * and the sounds of the shot. The mix is the one baked into a saved movie.
 */
export class Ambience {
  private context = ambienceContext();
  private gain = this.context.createGain();
  private source: AudioBufferSourceNode | null = null;
  private track: Track | null = null;
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

  /**
   * `time` is the film clock in seconds. `active` is false while paused, hidden
   * or muted. Sound starts once the mix is ready, at the right point in the film.
   */
  sync(script: VideoScript, time: number, active: boolean, voice?: Voice) {
    if (this.context.state !== "running") return;
    // A narrated film waits for its voice rather than starting without it.
    if (voice === "loading") {
      this.stop();
      return;
    }
    const track = trackOf(script, voice);
    if (track !== this.track) {
      this.track = track;
      this.stop();
    }
    if (!active || !track.buffer) {
      this.stop();
      return;
    }
    const now = this.context.currentTime;
    const expected = this.source ? this.offset + (now - this.startedAt) : Number.NaN;
    if (!this.source || Math.abs(expected - time) > 0.35) this.playAt(track.buffer, time);
  }

  dispose() {
    this.stop();
    this.gain.disconnect();
  }

  private playAt(buffer: AudioBuffer, time: number) {
    this.stop();
    const src = this.context.createBufferSource();
    src.buffer = buffer;
    src.connect(this.gain);
    const offset = Math.min(Math.max(0, time), Math.max(0, buffer.duration - 0.05));
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
