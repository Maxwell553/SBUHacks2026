const loaded = new Map<string, Promise<Float32Array | null>>();

/**
 * A film's narration as the mono 48 kHz stem the soundtrack mixes, or null
 * when it is missing or cannot be decoded (the film then plays without it).
 */
export function loadNarration(url: string): Promise<Float32Array | null> {
  let voice = loaded.get(url);
  if (!voice) {
    voice = (async () => {
      try {
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok) return null;
        // decodeAudioData resamples to the context's rate.
        const decoded = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(await response.arrayBuffer());
        return decoded.getChannelData(0).slice();
      } catch {
        return null;
      }
    })();
    voice.then((v) => {
      if (!v) loaded.delete(url);
    });
    loaded.set(url, voice);
  }
  return voice;
}
