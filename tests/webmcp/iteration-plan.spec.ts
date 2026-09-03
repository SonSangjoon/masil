import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { configurationForOfficialIteration } from "../../evals/runner/iteration-plan";

const plan = {
  firstOfficialIteration: "no_webmcp",
  candidateStartsAt: 2,
} as const;

test("the first official iteration is no WebMCP and every later iteration is a candidate", () => {
  expect(configurationForOfficialIteration(1, plan)).toBe("no_webmcp");
  expect(configurationForOfficialIteration(2, plan)).toBe("candidate");
  expect(configurationForOfficialIteration(8, plan)).toBe("candidate");
});

test("invalid iteration plans cannot silently change the experiment order", () => {
  expect(() =>
    configurationForOfficialIteration(0, plan),
  ).toThrow("OFFICIAL_ITERATION_NUMBER_INVALID");
  expect(() =>
    configurationForOfficialIteration(1, {
      firstOfficialIteration: "no_webmcp",
      candidateStartsAt: 3,
    }),
  ).toThrow("OFFICIAL_ITERATION_PLAN_INVALID");
});

test("the locked suite stays small enough for fast repeated optimization", () => {
  const definition = JSON.parse(
    readFileSync(resolve(process.cwd(), "evals/evals.json"), "utf8"),
  ) as {
    caseTimeoutMs: number;
    officialRepetitions: number;
    cases: Array<{ followups?: unknown[] }>;
  };

  expect(definition.cases).toHaveLength(15);
  expect(definition.officialRepetitions).toBe(2);
  expect(definition.caseTimeoutMs).toBe(120_000);
  expect(definition.cases.every(({ followups }) => (followups?.length ?? 0) <= 1)).toBe(true);
  expect(definition.cases.length * definition.officialRepetitions).toBe(30);
});
