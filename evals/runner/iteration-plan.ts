export type EvaluationConfiguration = "no_webmcp" | "candidate";

export type IterationPlan = {
  firstOfficialIteration: "no_webmcp";
  candidateStartsAt: number;
};

/** Resolve the single evaluated state for an official numbered iteration. */
export function configurationForOfficialIteration(
  iterationNumber: number,
  plan: IterationPlan,
): EvaluationConfiguration {
  if (!Number.isInteger(iterationNumber) || iterationNumber < 1) {
    throw new Error("OFFICIAL_ITERATION_NUMBER_INVALID");
  }
  if (
    plan.firstOfficialIteration !== "no_webmcp" ||
    plan.candidateStartsAt !== 2
  ) {
    throw new Error("OFFICIAL_ITERATION_PLAN_INVALID");
  }
  return iterationNumber < plan.candidateStartsAt
    ? plan.firstOfficialIteration
    : "candidate";
}

