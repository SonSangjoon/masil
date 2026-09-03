import { expect, test } from "@playwright/test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildOptimizationTrajectory } from "../../evals/runner/trajectory";

const categories = [
  "provider",
  "interface",
  "calligraphy",
  "janggi",
  "support",
];

function metric(
  passRate: number,
  meanTokensPerRun: number,
  meanWallTimeMs: number,
) {
  return {
    runs: 3,
    passed: Math.round(passRate * 3),
    passRate,
    criticalPassRate: passRate,
    firstPassValidRate: passRate,
    failedToolCalls: 0,
    expectedGuardRejections: 0,
    retries: 0,
    totalTokens: meanTokensPerRun * 3,
    meanTokensPerRun,
    meanWallTimeMs,
    tokensPerSuccessfulOutcome: passRate > 0 ? meanTokensPerRun / passRate : null,
    meanTimeToVisibleSuccessMs: passRate > 0 ? meanWallTimeMs : null,
  };
}

function writeAttempt(
  root: string,
  number: number,
  configuration: "no_webmcp" | "candidate",
  result: ReturnType<typeof metric>,
) {
  const name = `iteration-${String(number).padStart(3, "0")}`;
  const target = join(root, name);
  mkdirSync(target, { recursive: true });
  writeFileSync(
    join(target, "manifest.json"),
    JSON.stringify({
      createdAt: `2026-09-0${number}T00:00:00.000Z`,
      evalSetHash: `sha256:${String(number).repeat(64)}`,
      configuration,
    }),
  );
  writeFileSync(
    join(target, "benchmark.json"),
    JSON.stringify({
      configurations: {
        [configuration]: result,
      },
      categories: Object.fromEntries(
        categories.map((category) => [
          category,
          {
            [configuration]: result,
          },
        ]),
      ),
    }),
  );
}

test("trajectory is absent before the first official iteration", () => {
  const root = mkdtempSync(join(tmpdir(), "masil-empty-trajectory-"));
  try {
    expect(buildOptimizationTrajectory(root)).toBeNull();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("trajectory renders one selected candidate and a full-width no-WebMCP baseline", () => {
  const root = mkdtempSync(join(tmpdir(), "masil-trajectory-"));
  try {
    writeAttempt(root, 1, "no_webmcp", metric(0, 1200, 120000));
    // The earlier candidate is faster while the retained candidate is more
    // accurate and cheaper. Every selected label must still point to one
    // coherent candidate instead of cherry-picking per metric.
    writeAttempt(root, 2, "candidate", metric(0.9, 700, 2500));
    writeAttempt(root, 3, "candidate", metric(0.95, 650, 2700));
    writeAttempt(root, 4, "candidate", metric(0.8, 600, 2200));

    const bundle = buildOptimizationTrajectory(root);
    expect(bundle).not.toBeNull();
    expect(bundle?.svg).toContain("Task success");
    expect(bundle?.svg).toContain("Tokens per try");
    expect(bundle?.svg).toContain("Seconds per try");
    expect(bundle?.svg).toContain("Tries, in order");
    expect(bundle?.svg).toContain("#b65f49");
    expect(bundle?.svg).toContain("#f7f4ed");
    expect(bundle?.svg).toContain("95.0%");
    expect(bundle?.svg).toContain("650 tokens");
    expect(bundle?.svg).toContain("2.7 s");
    expect(bundle?.svg).toContain("Best observed frontier");
    expect(bundle?.svg.match(/data-series="best-observed-frontier"/g)).toHaveLength(3);
    expect(bundle?.svg).toContain("Selected #003");
    expect(bundle?.svg).not.toContain("700 tokens");
    expect(bundle?.svg).not.toContain("2.5 s");
    expect(bundle?.svg.match(/stroke-dasharray="6 7"/g)).toHaveLength(4);
    expect(bundle?.svg).toContain("Focused scale");
    expect(bundle?.svg).not.toContain(">#002</text>");

    const data = JSON.parse(bundle?.json ?? "{}") as {
      attempts: Array<{ order: number; decision: string }>;
    };
    expect(data.attempts.map(({ order }) => order)).toEqual([1, 2, 3, 4]);
    expect(data.attempts.map(({ decision }) => decision)).toEqual([
      "control",
      "accepted",
      "accepted",
      "rejected",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
