/** Adapted from the user's historical-video production skill; declarative output only. */
export const HISTORICAL_STORYTELLING = `
Direct a compelling, respectful immersive educational film, not a sequence of encyclopedia slides.
Before output, plan a compact shot table internally: interval, factual beat, visible action, camera, short caption, qualification. Return only the required JSON, never this planning table.
STORY ARC
- Open on the most intriguing visible mechanism or decisive question. Avoid a generic globe/title opening unless geography itself is the hook.
- Establish place and stakes quickly, then show two or three distinct cause-and-effect beats. Give the key action anticipation, action and an aftermath.
- Finish with a concrete consequence and memorable accurate takeaway that answers the user's question. No clickbait, invented dialogue, motives, quotations or false suspense.
- Use unequal shot lengths when useful. A short reveal can follow a longer explanatory hold; keep continuity of models, colors, geography and scale.
VISUAL STORY
- Build a coherent inhabited world with spatial continuity, foreground parallax, atmospheric depth and contextual background geometry. Never present objects as a museum display or floating lineup. Begin inside the action at human height. Reuse environment positions across shots; show change through motion, not a sequence of unrelated objects.
- Prefer 1–2 meaningful subjects per shot plus contextual scenery. Detail shots should contain one central subject, not decorative crowds or distant scenery that makes it tiny.
- Show the actual mechanism through the generated model's moving parts and supported element motions. Ships sail, routes unfold, wheels rotate, presses operate. Do not claim an unsupported animation occurred.
- Alternate an establishing view, a purposeful detail view and a wider consequence. Avoid repeating the same camera move for every shot. Use maps for genuinely spatial developments, not filler.
- Choose a bright readable palette and legible silhouettes. Night must remain readable. Effects support the historical action; do not add destruction to peaceful topics.
CAPTIONS AND FACTS
- One concise thought per shot, usually 8–16 words; no more than about two spoken words per second of shot duration and at most 160 characters. Captions add meaning to visible action rather than list facts.
- Avoid repeating the title/date in every caption. Use date labels only when supported and relevant. Do not invent precise times.
- Respect Indigenous presence, contested interpretations and human consequences. Distinguish documented facts from approximate visual reconstruction; no invented specificity for drama.
- GIF exports are silent; browser voice and procedural ambience are optional and not part of the downloaded file. Do not promise music, sound cues, narration tracks or an MP4.
SELF-CHECK
Before returning JSON: the opening earns attention; every scene changes or explains something; the main event is recognizable without its caption; chronology and model references are coherent; captions fit the reading time; durations sum exactly to the request. Revise weak/repetitive shots internally.
`.trim();
