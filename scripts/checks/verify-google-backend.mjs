// Live check of the configured fast model and Google Search grounding.
// Run: node --env-file=.env.local scripts/checks/verify-google-backend.mjs
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Missing GEMINI_API_KEY");
  process.exit(1);
}
const developer = process.env.GEMINI_PROVIDER === "developer";
const project = developer ? undefined : process.env.GEMINI_PROJECT;
const model = process.env.GEMINI_FAST_MODEL || process.env.GEMINI_MODEL || "gemini-3.8-flash";
const ai = new GoogleGenAI({
  vertexai: !developer,
  apiKey,
  ...(project ? { project, location: process.env.GEMINI_LOCATION || "global" } : {}),
  httpOptions: { apiVersion: developer ? "v1beta" : "v1", timeout: 45000 },
});
try {
  const response = await ai.models.generateContent({
    model,
    contents: "Use Google Search to verify when Apollo 11 landed on the Moon. Answer in one sentence with sources.",
    config: {
      tools: [{ googleSearch: {} }],
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });
  const candidate = response.candidates?.[0];
  const sources = candidate?.groundingMetadata?.groundingChunks?.filter((chunk) => chunk.web?.uri) ?? [];
  const ok = candidate?.finishReason === "STOP" && !!response.text && sources.length > 0;
  console.log(
    JSON.stringify(
      {
        ok,
        provider: developer ? "developer" : project ? "vertex" : "vertex-express",
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
