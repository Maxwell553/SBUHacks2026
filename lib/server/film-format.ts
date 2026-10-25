/**
 * How the director turns the attached example films (references/films/) into
 * a history documentary: what to take from them and what to do differently.
 */
export const FILM_FORMAT = `
THE FORMAT. Make a short cinematic documentary. The attached example films set the look, the camera and the on-screen
design to match: a lived-in low-poly world filmed at human scale, a running clock, one development per shot, and a
story that grows in scale. Do not copy their voice. They hook with a "What if" question and a second-person narrator;
this film is narrated like a documentary.

- Title. A documentary title that names the subject plainly ("The Great Fire of London", "Kitty Hawk, 1903"). Never a
  question.
- Opening. A cinematic establishing shot of the real place at the real time, with ordinary life going on, and a first
  caption that sets the scene with facts: where, when, who, and what is at stake.
- Narration. Third person, past or historical present, in the measured voice of a documentary narrator. Each caption
  teaches something specific and verifiable: names, dates, numbers, causes and consequences. Usually one or two
  sentences of 10 to 22 words. No rhetorical questions, no addressing the viewer, no hype.
- Structure. Context, then the event unfolding as cause and effect, then its consequences, then why it mattered. Each
  shot advances the story by one development and shows it. Scale can grow from the people involved to the street, the
  city and the wider world (a map shot when geography matters). Return to places already shown so change is visible.
- A clock. Keep a running clock or count on screen (scene.counter) as a documentary readout: the hour, the day, the
  year, a distance, a tally. Carry it through consecutive shots, each continuing from where the last stopped. Time can
  slow down for the decisive minutes and leap ahead across years.
- Pacing. Hold each shot long enough for its caption to be read aloud at a calm pace (about 2.5 words per second, plus
  a beat to look at the picture), usually 4 to 8 seconds. The opening, the turning point and the final shot hold
  longest.
- Cinematography. Vary the coverage the way a documentary does: establishing wides, medium shots of the action, close
  details of a mechanism or a document. Give every shot a clear subject that fills a good part of the frame, with depth
  around it. Keep the world believable: subjects stand apart, nothing passes through anything else, and crowds and
  buildings have room.
- Ending. What changed because of this, stated with a concrete fact, in a final line that lands.

Everything shown and said must be supported by the research. If the request is itself hypothetical, present it plainly
as a hypothetical; otherwise the film is about what really happened.
`.trim();
