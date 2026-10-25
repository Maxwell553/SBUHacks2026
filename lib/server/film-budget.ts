/**
 * Wall clock for one film. Early stages that finish quickly leave their unused
 * time for later stages, and a stage cannot spend what the rest of the film
 * still needs. Encoding is the browser; measured 720p frames are about 4 ms.
 */
export const FILM_BUDGET_MS = 120_000;

export type FilmStage = "moderate" | "research" | "plan" | "parallel" | "finish" | "review" | "encode";

const ORDER: FilmStage[] = ["moderate", "research", "plan", "parallel", "finish", "review", "encode"];

/** Most a stage may run, even when earlier stages were quick. */
const CEILING: Record<FilmStage, number> = {
  moderate: 8_000,
  research: 14_000,
  plan: 12_000,
  parallel: 62_000,
  finish: 10_000,
  review: 3_000,
  encode: 8_000,
};

/** Time kept for this stage so an earlier stage cannot use it up. */
const PROTECT: Record<FilmStage, number> = {
  moderate: 6_000,
  research: 10_000,
  plan: 8_000,
  parallel: 48_000,
  finish: 8_000,
  review: 2_000,
  encode: 6_000,
};

function reserveAfter(stage: FilmStage) {
  const index = ORDER.indexOf(stage);
  return ORDER.slice(index + 1).reduce((sum, later) => sum + PROTECT[later], 0);
}

/** How long this stage may run, given how much of the film is already gone. */
export function stageAllowance(stage: FilmStage, elapsedMs: number) {
  const remaining = FILM_BUDGET_MS - Math.max(0, elapsedMs);
  return Math.max(0, Math.min(CEILING[stage], remaining - reserveAfter(stage)));
}

/** Elapsed time if every earlier stage used its full allowance. */
export function pessimisticElapsed(stage: FilmStage) {
  let elapsed = 0;
  for (const earlier of ORDER) {
    if (earlier === stage) break;
    elapsed += stageAllowance(earlier, elapsed);
  }
  return elapsed;
}

export const MODERATE_BUDGET_MS = stageAllowance("moderate", 0);
export const RESEARCH_BUDGET_MS = stageAllowance("research", pessimisticElapsed("research"));
export const PLAN_BUDGET_MS = stageAllowance("plan", pessimisticElapsed("plan"));
export const BUILD_ATTEMPTS = 1;
export const BUILD_ATTEMPT_MS = CEILING.parallel;
export const DIRECT_BUDGET_MS = stageAllowance("parallel", pessimisticElapsed("parallel"));
export const FINISH_BUDGET_MS = stageAllowance("finish", pessimisticElapsed("finish"));
export const REVIEW_BUDGET_MS = stageAllowance("review", pessimisticElapsed("review"));
export const ENCODE_BUDGET_MS = stageAllowance("encode", pessimisticElapsed("encode"));

/** Every stage takes its full allowance. Later stages inherit nothing. */
export function worstCaseFilmMs() {
  let elapsed = 0;
  for (const stage of ORDER) elapsed += stageAllowance(stage, elapsed);
  return elapsed;
}
