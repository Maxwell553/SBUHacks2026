import { Modality } from "@google/genai";
import type { VideoScript } from "@/lib/schema/video";
import { decodePcm16, encodeWav, layoutNarration, resample, trimSilence } from "@/lib/audio/voice-track";
import { generateContent, safetySettings } from "@/lib/server/gemini";
import { ApiError } from "@/lib/server/http";
import { ttsModel, ttsVoice } from "@/lib/server/models";

/** The narration is stored at the speech model's own rate. */
const RATE = 24000;
/** Captions recorded at once. */
const CONCURRENCY = 4;

const unavailable = () => new ApiError(502, "The narration could not be recorded. The film plays without it.");

/** One caption, spoken, with the silence around it trimmed. */
async function speak(text: string, signal: AbortSignal): Promise<Float32Array> {
  const response = await generateContent({
    model: ttsModel(),
    contents: [
      {
        role: "user",
        parts: [{ text: `Read this in the calm, measured voice of a documentary narrator, at a steady pace: ${text}` }],
      },
    ],
    config: {
      abortSignal: signal,
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: ttsVoice() } } },
      safetySettings,
    },
  });
  const candidate = response.candidates?.[0];
  const audio = candidate?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
  if ((candidate?.finishReason && candidate.finishReason !== "STOP") || !audio?.data) throw unavailable();
  const declared = Number(/rate=(\d+)/.exec(audio.mimeType ?? "")?.[1]) || RATE;
  const { samples, rate } = decodePcm16(Buffer.from(audio.data, "base64"), declared);
  return trimSilence(rate === RATE ? samples : resample(samples, rate / RATE), RATE);
}

/**
 * Records a film's narration: every caption read aloud by the speech model and
 * laid out on the film's timeline, as a WAV file. The captions are the
 * storyboard's own text, moderated when the film was assembled.
 */
export async function narrateFilm(script: VideoScript, outer: AbortSignal): Promise<Uint8Array> {
  const failed = new AbortController();
  const signal = AbortSignal.any([outer, failed.signal]);
  const lines = script.scenes.map((scene) => scene.caption.trim());
  const clips: (Float32Array | null)[] = lines.map(() => null);
  let next = 0;
  try {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, lines.length) }, async () => {
        while (next < lines.length) {
          const index = next++;
          if (lines[index]) clips[index] = await speak(lines[index], signal);
        }
      }),
    );
  } catch (error) {
    failed.abort();
    if (outer.aborted) throw error;
    // Log only the kind; provider messages can quote the text.
    console.warn("Narration unavailable", { reason: error instanceof Error ? error.name : "error" });
    throw error instanceof ApiError ? error : unavailable();
  }
  const starts: number[] = [];
  let origin = 0;
  for (const scene of script.scenes) {
    starts.push(origin);
    origin += scene.duration;
  }
  return encodeWav(layoutNarration(clips, starts, script.totalDuration, RATE), RATE);
}
