// Minimal live verification of Vertex Express + Google Search grounding.
// Run: node --env-file=.env.local scripts/verify-google-backend.mjs
import { GoogleGenAI } from "@google/genai";
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Missing GEMINI_API_KEY");
  process.exit(1);
}
const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const ai = new GoogleGenAI({
  vertexai: true,
  apiKey,
  httpOptions: { apiVersion: "v1", timeout: 45000 },
});
try {
  const response = await ai.models.generateContent({
    model,
    contents: "Use Google Search to verify when Apollo 11 landed on the Moon. Answer in one sentence with sources.",
    config: { tools: [{ googleSearch: {} }], maxOutputTokens: 4096 },
  });
  const candidate = response.candidates?.[0];
  const sources = candidate?.groundingMetadata?.groundingChunks?.filter((chunk) => chunk.web?.uri) ?? [];
  const ok = candidate?.finishReason === "STOP" && !!response.text && sources.length > 0;
  console.log(
    JSON.stringify(
      {
        ok,
        provider: "vertex-express",
        model,
        sourceCount: sources.length,
        finishReason: candidate?.finishReason,
        answer: response.text,
      },
      null,
      2,
    ),
  );
  if (!ok) process.exitCode = 1;
} catch (error) {
  console.error(String(error.message).replaceAll(apiKey, "[REDACTED]"));
  process.exitCode = 1;
}
