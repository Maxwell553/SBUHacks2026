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
  is one complete sentence, ending on a full stop, that teaches something specific and verifiable: names, dates,
  numbers, causes and consequences. Keep it under 140 characters so the whole sentence stays on screen. No rhetorical
  questions, no addressing the viewer, no hype.
- Structure. Context, then the event unfolding as cause and effect, then its consequences, then why it mattered. Each
  shot advances the story by one development and shows it. Scale can grow from the people involved to the street, the
  city and the wider world (a map shot when geography matters). Return to places already shown so change is visible.
- A clock. Keep a running clock or count on screen (scene.counter) as a documentary readout: the hour, the day, the
  year, a distance, a tally. Carry it through consecutive shots, each continuing from where the last stopped. Time can
  slow down for the decisive minutes and leap ahead across years.
- Pacing. Hold each shot long enough to read its caption at a calm pace (about 3 words per second, plus a beat to look
  at the picture), usually 4 to 7 seconds. The opening, the turning point and the final shot hold longest.
- Cinematography. Vary the coverage the way a documentary does: establishing wides, medium shots of the action, close
  details of a mechanism or a document. The camera travels slowly: a push, a drift, a crane. Do not spin around the
  subject. Give every shot a clear subject that fills a good part of the frame, with ground in front and a horizon,
  skyline or far wall behind it. A person using something stands beside it. Subjects stand apart. Nothing passes
  through anything else. Crowds and buildings have room.
- The picture, taken from the example frames. A real place, packed and aligned: streets, rails, decks and floors run
  straight, and people, vehicles and furniture sit on those surfaces with feet or wheels touching. A person is about
  1.7 metres and buildings dwarf them. Crowds are many copies of one person, in a line or a block that stays aligned.
  A vehicle on a road uses march so it travels the lane; a parked one stays idle. Light is a clear sun with a soft contact
  shadow, and a sky that grades from deeper colour overhead to a pale horizon. Dawn and dusk are warm. Things move:
  a person walks or shifts, water and flags move, the camera does not sit dead. Someone doing a job works the object:
  haulers stand at the rope and travel with the load, a pour tips toward the ground, a lever stays on the stone.
  motion=wave is only a small greeting. Nobody swings a tool at empty air. On screen, a large readable clock or
  count and a short caption in the lower third, with picture around the words.
- Sound. Set music.mood to the underscore this history needs: solemn, mournful, tense, martial, pastoral, hopeful,
  wonder, or urgent. Set tone on a shot (spare, open, dark, bright) when that moment should sit lower, lighter, or
  thinner. The bed stays at one level. Under it, the shot itself is heard: wind, water, a room or a street, and a
  machine, bell, fire or footsteps only when that thing is in the shot. No stingers and no narrator voice.
- Ending. What changed because of this, stated with a concrete fact, in a final line that lands.

Everything shown and said must be supported by the research. If the request is itself hypothetical, present it plainly
as a hypothetical; otherwise the film is about what really happened.
`.trim();
