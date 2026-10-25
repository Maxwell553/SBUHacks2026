import type { Scene } from "@/lib/schema/video";

/** Quiet, synthesized environmental beds: no downloads, licenses or API latency. */
export class Ambience {
  private context = new AudioContext();
  private source: AudioBufferSourceNode;
  private filter = this.context.createBiquadFilter();
  private gain = this.context.createGain();
  private level = 0;
  constructor() {
    const buffer = this.context.createBuffer(1, this.context.sampleRate * 4, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    let seed = 431;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const white = (seed / 4294967296) * 2 - 1;
      brown = (brown + 0.02 * white) / 1.02;
      data[i] = brown * 2.5 + white * 0.09;
    }
    this.source = this.context.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    this.filter.type = "lowpass";
    this.gain.gain.value = 0;
    this.source.connect(this.filter).connect(this.gain).connect(this.context.destination);
    this.source.start();
  }
  async resume() {
    await this.context.resume();
  }
  update(scene: Scene, time: number, active: boolean) {
    if (this.context.state === "closed") return;
    const interior = scene.layout === "interior";
    const space = !interior && (scene.setting === "orbit" || scene.setting === "lunar");
    const water = !interior && ["ocean", "coast", "river"].includes(scene.setting);
    const rain = !interior && ["rain", "storm"].includes(scene.weather);
    const fire = scene.elements.some((e) => e.motion === "burn");
    const level =
      active && !space
        ? (interior ? 0.04 : rain ? 0.22 : water ? 0.18 : fire ? 0.12 : 0.08) *
          (0.85 + 0.15 * Math.sin(time * (water ? 0.65 : 0.23)))
        : 0;
    this.filter.frequency.setTargetAtTime(
      interior ? 350 : rain ? 4600 : fire ? 2200 : water ? 1200 : 550,
      this.context.currentTime,
      0.5,
    );
    if (Math.abs(level - this.level) > 0.002) {
      this.gain.gain.setTargetAtTime(level, this.context.currentTime, 0.12);
      this.level = level;
    }
  }
  dispose() {
    this.source.stop();
    this.source.disconnect();
    this.filter.disconnect();
    this.gain.disconnect();
    void this.context.close();
  }
}
