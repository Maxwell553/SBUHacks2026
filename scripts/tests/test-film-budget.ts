import assert from "node:assert/strict";
import { FILM_BUDGET_MS, stageAllowance, worstCaseFilmMs } from "../../lib/server/film-budget";

const worst = worstCaseFilmMs();
assert(worst <= FILM_BUDGET_MS, `A film can take ${worst} ms, over the ${FILM_BUDGET_MS} ms budget`);
const researchAfterFastCheck = stageAllowance("research", 2_000);
assert(researchAfterFastCheck >= 14_000, `A quick safety check should leave research ${researchAfterFastCheck} ms`);
const parallelAfterFastFront = stageAllowance("parallel", 20_000);
const parallelAfterSlowFront = stageAllowance("parallel", pessimisticFront());
assert(
  parallelAfterFastFront >= parallelAfterSlowFront,
  "Time the opening stages do not use is available while the models and storyboard run",
);

function pessimisticFront() {
  let elapsed = 0;
  for (const stage of ["moderate", "research", "plan"] as const) elapsed += stageAllowance(stage, elapsed);
  return elapsed;
}

console.log(`PASS a film's worst case is ${worst} ms; research keeps ${researchAfterFastCheck} ms after a 2s check`);
