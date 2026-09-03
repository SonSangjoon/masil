import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import {
  configurationForOfficialIteration,
  type IterationPlan,
} from "./iteration-plan";
import {
  buildOptimizationTrajectory,
  readOptimizationTrajectory,
} from "./trajectory";

type CoverageAssertion = {
  id: string;
  layer: string;
  severity: "critical" | "major";
  expected: string;
  evidence: string[];
  visibleOutcome?: string;
  expectedInitialText?: string;
  expectedText?: string;
  requiresInteractionEvidence?: boolean;
  requiresRejectedAttempt?: boolean;
  mustNot?: string[];
  personAction?: {
    id: string;
    when: string;
    action: string;
    expectedEffect: string;
  };
  externalFixture?: {
    id: "calligraphy-reference-generator";
    firstResult: "valid" | "opaque" | "wrong-ratio";
    correctedResult?: "valid";
  };
};

type EvalDefinition = {
  schemaVersion: string;
  suite: string;
  model: string;
  reasoningEffort: string;
  caseTimeoutMs: number;
  officialRepetitions: number;
  iterationPlan: IterationPlan;
  evaluationPrinciple: string;
  optimizationVariables: string[];
  cases: Array<{
    id: string;
    category: string;
    kind: string;
    prompt: string;
    prompt_eng: string;
    followups?: Array<{
      prompt: string;
      prompt_eng: string;
    }>;
    expected_output: string;
    files: string[];
    assertions: CoverageAssertion[];
  }>;
};

type ConfigurationBenchmark = {
  runs: number;
  passed: number;
  passRate: number;
  criticalPassRate: number;
  firstPassValidRate: number;
  failedToolCalls: number;
  expectedGuardRejections: number;
  retries: number;
  totalTokens: number;
  meanTokensPerRun: number;
  meanWallTimeMs: number;
  tokensPerSuccessfulOutcome: number | null;
  meanTimeToVisibleSuccessMs: number | null;
};

type Benchmark = {
  generatedAt: string;
  configurations: Record<string, ConfigurationBenchmark>;
  categories: Record<string, Record<string, ConfigurationBenchmark>>;
};

type OptimizationDecision = "control" | "accepted" | "rejected";

type Manifest = {
  mode: "official";
  immutable: true;
  configuration: "no_webmcp" | "candidate";
  artifact: { path: "artifact" } | null;
  model: string;
  reasoningEffort: string;
  caseTimeoutMs: number;
  caseCount: number;
  totalSessions: number;
  repetitions: number;
  executionConcurrency: number;
  navigationConcurrency: number;
  evaluationConcurrency: number;
  phaseTiming: {
    executionWallTimeMs: number;
    evaluationWallTimeMs: number;
    totalWallTimeMs: number;
  };
  registeredToolCount: number;
  evalSetHash: string;
  fixtureHash: string;
  rawArtifactHashes: Record<string, string>;
};

const ROOT = resolve(import.meta.dirname, "../..");
const EVALS_ROOT = join(ROOT, "evals");
const ITERATIONS_ROOT = join(EVALS_ROOT, "iterations");
const EVALS_PATH = join(EVALS_ROOT, "evals.json");
const ITERATION_TEMPLATE_ROOT = join(EVALS_ROOT, "templates/iteration");
const OPTIMIZATION_ROOT = join(EVALS_ROOT, "optimization");
const TRAJECTORY_JSON_PATH = join(OPTIMIZATION_ROOT, "trajectory.json");
const TRAJECTORY_SVG_PATH = join(OPTIMIZATION_ROOT, "trajectory.svg");
const EVALUATION_PATH = join(ROOT, "docs/EVALUATION.md");
const START_MARKER = "<!-- accepted-benchmark:start -->";
const END_MARKER = "<!-- accepted-benchmark:end -->";
const REQUIRED_ARTIFACT_FILES = [
  "adapter.ts",
  "contract.ts",
  "provider.ts",
  "types.ts",
  "use-masil-webmcp-provider.ts",
] as const;
const RETAINED_CASE_FILES = [
  "timing.json",
  "grading.json",
  "outputs/final-response.txt",
] as const;
const PRIVATE_CASE_FILES = [
  "execution.json",
  "tool-trace.json",
  "outputs/transcript.json",
  "outputs/screenshot.png",
] as const;
const OMITTED_ITERATION_FILES = ["feedback.json", "results.json"] as const;
const REQUIRED_CASE_KINDS = [
  "recovery",
  "consent-withheld",
  "human-in-loop",
] as const;
const CONVERSATION_QUALITY_ASSERTION_ID = "CONVERSATION-QUALITY-001";
const CONVERSATION_QUALITY_DIMENSIONS = [
  "adultRespect",
  "clarity",
  "warmth",
  "agency",
  "contextFit",
] as const;

const VISIBLE_OUTCOME_LABELS: Record<string, string> = {
  "calligraphy-choice-visible": "The calligraphy space visibly asks what the person wants to write.",
  "calligraphy-choice-then-reference": "A visible choice precedes the person's selected calligraphy reference.",
  "calligraphy-reference-visible": "The requested 1-4 character reference is accepted and visible on one canvas.",
  "calligraphy-reference-corrected": "The person's first reference is visible before their correction replaces it.",
  "calligraphy-air-writing-ready": "The requested reference is visible and the person-controlled browser camera boundary has started.",
  "calligraphy-direct-drawing-ready": "The requested reference is visible for direct drawing without a camera request.",
  "calligraphy-camera-stopped": "The requested camera lifecycle ends in fallback mode with the work preserved.",
  "calligraphy-reference-preserved": "The reference remains visible and unrequested destructive changes do not occur.",
  "calligraphy-work-preserved": "The generated reference and the person's stroke both remain under person control.",
  "english-janggi-visible": "The visible experience is English and the shared Janggi board is open.",
  "activity-switched-to-janggi": "One ongoing Agent conversation visibly switches from calligraphy to Janggi.",
  "activity-switched-to-janggi-with-reference": "A completed calligraphy reference visibly precedes the switch to Janggi.",
  "home-returned": "The person explicitly ends the activity and the visible experience returns home.",
  "webmcp-tools-visible": "The visible WebMCP side panel is open on the available-tools tab.",
  "webmcp-history-visible": "The Agent visibly switches the open WebMCP side panel from tools to execution history.",
  "english-janggi-history-visible": "The same untouched Janggi board remains open while English and visible history are applied.",
  "janggi-board-visible": "The shared Janggi board is visibly open without hidden support intake.",
  "janggi-person-move-visible": "The confirmed legal Cho move completes visibly and hands the turn to the Agent.",
  "janggi-preview-visible": "A legal route is previewed without changing the board or turn.",
  "janggi-preview-then-person-move": "A legal preview leaves the board unchanged until the person's follow-up commits that move.",
  "janggi-person-gesture-visible": "One direct person gesture resolves the bounded wait after animation.",
  "janggi-agent-reply-visible": "The Agent reads the new board and completes one legal Han reply.",
  "janggi-illegal-preserved": "An illegal requested move is rejected and the visible board remains unchanged.",
  "janggi-illegal-then-legal-move": "An illegal move is rejected before the person's corrected legal move completes.",
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function hashFile(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function hashFiles(paths: string[]) {
  const hash = createHash("sha256");
  for (const path of paths) {
    hash.update(path.replace(`${ROOT}/`, ""));
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function assertionValid(assertion: CoverageAssertion) {
  return (
    Boolean(assertion.id) &&
    Boolean(assertion.layer) &&
    Boolean(assertion.severity) &&
    Boolean(assertion.expected) &&
    assertion.evidence.length > 0
  );
}

function validateDefinition() {
  const definition = readJson<EvalDefinition>(EVALS_PATH);
  if (definition.schemaVersion !== "1.0.0") {
    throw new Error("Product-first evals.json must use schemaVersion 1.0.0.");
  }
  if (
    !definition.evaluationPrinciple ||
    !definition.optimizationVariables?.includes("tool names") ||
    !definition.optimizationVariables?.includes("tool composition")
  ) {
    throw new Error(
      "evals.json must state that the WebMCP contract is an optimization variable.",
    );
  }
  const serializedDefinition = JSON.stringify(definition);
  if (
    serializedDefinition.includes('"requiredTools"') ||
    serializedDefinition.includes('"toolCoverage"') ||
    serializedDefinition.includes('"setup"') ||
    serializedDefinition.includes('"humanFixture"') ||
    serializedDefinition.includes("masil_")
  ) {
    throw new Error(
      "evals.json must not encode the current WebMCP tool names, paths, or coverage.",
    );
  }

  if (definition.caseTimeoutMs !== 120_000) {
    throw new Error("Official evaluation must lock the 120-second case timeout.");
  }
  if (definition.officialRepetitions !== 2) {
    throw new Error("Official evaluation must lock two independent repetitions.");
  }
  if (
    definition.iterationPlan?.firstOfficialIteration !== "no_webmcp" ||
    definition.iterationPlan?.candidateStartsAt !== 2
  ) {
    throw new Error(
      "The official sequence must use iteration-001 as no WebMCP and begin candidates at iteration-002.",
    );
  }
  if (!existsSync(join(ITERATION_TEMPLATE_ROOT, "cases", ".gitkeep"))) {
    throw new Error("The tracked empty iteration workspace template is missing.");
  }
  if (definition.cases.length !== 15) {
    throw new Error("The focused eval set must contain exactly 15 distinct cases.");
  }
  if (definition.cases.some(({ category }) => category === "support")) {
    throw new Error(
      "The focused MASIL eval set must keep support workflows out of scored cases.",
    );
  }

  const caseIds = definition.cases.map(({ id }) => id);
  if (new Set(caseIds).size !== caseIds.length) {
    throw new Error("Evaluation case IDs must be unique.");
  }

  for (const evalCase of definition.cases) {
    if (
      !evalCase.id ||
      !evalCase.category ||
      !evalCase.kind ||
      !evalCase.prompt ||
      !evalCase.prompt_eng ||
      !evalCase.expected_output ||
      !Array.isArray(evalCase.files) ||
      evalCase.assertions.length === 0
    ) {
      throw new Error(
        `Case ${evalCase.id || "<missing-id>"} is missing reviewable execution fields.`,
      );
    }
    const userUtterances = [
      evalCase.prompt,
      ...(evalCase.followups ?? []).map(({ prompt }) => prompt),
    ];
    if (
      userUtterances.some((utterance) =>
        /eval:\/\/|webmcp|\btool\b|schema|assertion|fixture|revision|3:2|alpha|알파|로컬 데모/i.test(
          utterance,
        ),
      )
    ) {
      throw new Error(
        `Case ${evalCase.id} must read like a person's request, not an evaluation or WebMCP instruction.`,
      );
    }
    if (
      evalCase.followups?.some(
        ({ prompt, prompt_eng }) => !prompt || !prompt_eng,
      )
    ) {
      throw new Error(
        `Every follow-up in ${evalCase.id} needs a natural prompt and its English translation.`,
      );
    }
    if ((evalCase.followups?.length ?? 0) > 1) {
      throw new Error(
        `Case ${evalCase.id} is too long: keep each journey to one follow-up at most.`,
      );
    }
    for (const file of evalCase.files) {
      if (
        !file.startsWith("evals/files/") ||
        !existsSync(join(ROOT, file))
      ) {
        throw new Error(
          `Case ${evalCase.id} references a missing or out-of-scope input file: ${file}`,
        );
      }
    }
    if (evalCase.assertions.some((assertion) => !assertionValid(assertion))) {
      throw new Error(
        `Every assertion in ${evalCase.id} needs id, layer, severity, expected, and evidence.`,
      );
    }
    for (const assertion of evalCase.assertions) {
      if (
        assertion.personAction &&
        (!assertion.personAction.id ||
          !assertion.personAction.when ||
          !assertion.personAction.action ||
          !assertion.personAction.expectedEffect)
      ) {
        throw new Error(
          `Person action in ${evalCase.id}/${assertion.id} must be fully reviewable.`,
        );
      }
      if (
        assertion.externalFixture &&
        (assertion.externalFixture.id !== "calligraphy-reference-generator" ||
          !assertion.externalFixture.firstResult ||
          (assertion.requiresRejectedAttempt === true &&
            assertion.externalFixture.correctedResult !== "valid"))
      ) {
        throw new Error(
          `External fixture in ${evalCase.id}/${assertion.id} is incomplete.`,
        );
      }
    }
    const assertionIds = evalCase.assertions.map(({ id }) => id);
    if (new Set(assertionIds).size !== assertionIds.length) {
      throw new Error(`Case ${evalCase.id} has duplicate assertion IDs.`);
    }
    const conversationAssertions = evalCase.assertions.filter(
      ({ id }) => id === CONVERSATION_QUALITY_ASSERTION_ID,
    );
    if (
      conversationAssertions.length !== 1 ||
      conversationAssertions[0].layer !== "person-facing-conversation" ||
      conversationAssertions[0].severity !== "major" ||
      !conversationAssertions[0].evidence.includes("transcript") ||
      !conversationAssertions[0].evidence.includes("llm-judge")
    ) {
      throw new Error(
        `Case ${evalCase.id} must keep one transcript-based conversation-quality assertion inside assertions.`,
      );
    }
    const outcomeAssertions = evalCase.assertions.filter(
      ({ visibleOutcome }) => visibleOutcome,
    );
    if (outcomeAssertions.length !== 1) {
      throw new Error(
        `Case ${evalCase.id} must define exactly one visible outcome inside its assertions.`,
      );
    }
    const [outcomeAssertion] = outcomeAssertions;
    if (!VISIBLE_OUTCOME_LABELS[outcomeAssertion.visibleOutcome as string]) {
      throw new Error(
        `Case ${evalCase.id} has no human-readable visible outcome mapping.`,
      );
    }
    if (outcomeAssertion.requiresInteractionEvidence !== true) {
      throw new Error(
        `Case ${evalCase.id} must require grounded interaction evidence without prescribing a tool.`,
      );
    }
    if (
      outcomeAssertion.visibleOutcome?.startsWith("calligraphy-") &&
      outcomeAssertion.visibleOutcome !== "calligraphy-choice-visible" &&
      !outcomeAssertion.externalFixture
    ) {
      throw new Error(
        `Calligraphy outcome ${evalCase.id} needs the shared external generator fixture inside its assertion.`,
      );
    }
    if (
      evalCase.kind === "recovery" &&
      !evalCase.assertions.some(({ requiresRejectedAttempt }) =>
        Boolean(requiresRejectedAttempt),
      )
    ) {
      throw new Error(`Recovery case ${evalCase.id} needs a rejected first attempt.`);
    }
    if (
      evalCase.kind === "human-in-loop" &&
      !evalCase.assertions.some(({ personAction }) => Boolean(personAction))
    ) {
      throw new Error(
        `Human-in-loop case ${evalCase.id} needs a bounded person action inside its assertion.`,
      );
    }
  }
  for (const kind of REQUIRED_CASE_KINDS) {
    if (!definition.cases.some((evalCase) => evalCase.kind === kind)) {
      throw new Error(`Evaluation set requires at least one ${kind} case.`);
    }
  }

  return definition;
}

function officialIterationNames() {
  return readdirSync(ITERATIONS_ROOT)
    .filter((name) => /^iteration-\d{3}$/.test(name))
    .sort();
}

function validateSanitizedArtifacts(iterationRoot: string) {
  const queue = [iterationRoot];
  while (queue.length) {
    const current = queue.pop();
    if (!current) continue;
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        queue.push(path);
        continue;
      }
      if (!/\.(json|txt)$/.test(name)) continue;
      const content = readFileSync(path, "utf8");
      if (/data:image\//i.test(content) || /sk-[A-Za-z0-9_-]{16,}/.test(content)) {
        throw new Error(`Sensitive or binary content found in ${path}.`);
      }
    }
  }
}

function curatePublishedIteration(
  iterationRoot: string,
  definition: EvalDefinition,
) {
  for (const name of OMITTED_ITERATION_FILES) {
    rmSync(join(iterationRoot, name), { force: true });
  }
  for (const evalCase of definition.cases) {
    for (
      let repetition = 1;
      repetition <= definition.officialRepetitions;
      repetition += 1
    ) {
      const caseRoot = join(
        iterationRoot,
        "cases",
        evalCase.id,
        String(repetition),
      );
      for (const relativePath of PRIVATE_CASE_FILES) {
        rmSync(join(caseRoot, relativePath), { force: true });
      }
    }
  }
}

function validateIteration(name: string, definition: EvalDefinition) {
  const root = join(ITERATIONS_ROOT, name);
  const iterationNumber = Number(name.replace("iteration-", ""));
  const expectedConfiguration = configurationForOfficialIteration(
    iterationNumber,
    definition.iterationPlan,
  );
  const manifest = readJson<Manifest>(join(root, "manifest.json"));
  const benchmark = readJson<Benchmark>(join(root, "benchmark.json"));

  for (const omitted of OMITTED_ITERATION_FILES) {
    if (existsSync(join(root, omitted))) {
      throw new Error(
        `${name} contains excluded publication output: ${omitted}. Run npm run eval:webmcp:publish.`,
      );
    }
  }

  if (!manifest.immutable || manifest.mode !== "official") {
    throw new Error(`${name} is not an immutable official iteration.`);
  }
  if (manifest.configuration !== expectedConfiguration) {
    throw new Error(
      `${name} must evaluate ${expectedConfiguration}, not ${manifest.configuration}.`,
    );
  }
  if (manifest.configuration === "no_webmcp") {
    if (manifest.artifact !== null || existsSync(join(root, "artifact"))) {
      throw new Error(`${name} must not contain a WebMCP artifact.`);
    }
    if (manifest.registeredToolCount !== 0) {
      throw new Error(`${name} must expose zero WebMCP tools.`);
    }
  } else {
    if (manifest.artifact?.path !== "artifact") {
      throw new Error(`${name} does not declare the evaluated WebMCP code.`);
    }
    for (const file of REQUIRED_ARTIFACT_FILES) {
      if (!existsSync(join(root, "artifact", file))) {
        throw new Error(`${name} is missing WebMCP artifact code: ${file}`);
      }
    }
    if (
      !Number.isInteger(manifest.registeredToolCount) ||
      manifest.registeredToolCount < 1
    ) {
      throw new Error(`${name} exposed no candidate WebMCP tools.`);
    }
  }
  if (manifest.model !== "gpt-5.6-luna" || manifest.reasoningEffort !== "low") {
    throw new Error(`${name} silently changed the locked model configuration.`);
  }
  if (manifest.caseTimeoutMs !== 120_000) {
    throw new Error(`${name} must use the shared 120-second case timeout.`);
  }
  if (manifest.repetitions !== 2) {
    throw new Error(`${name} must contain two independent repetitions.`);
  }
  if (manifest.executionConcurrency !== 15) {
    throw new Error(`${name} must use the locked fifteen-session concurrency.`);
  }
  if (manifest.navigationConcurrency !== 4) {
    throw new Error(`${name} must use the locked four-navigation concurrency.`);
  }
  if (
    !Number.isInteger(manifest.evaluationConcurrency) ||
    manifest.evaluationConcurrency < 1 ||
    manifest.evaluationConcurrency > 16
  ) {
    throw new Error(`${name} has invalid judge concurrency.`);
  }
  if (
    manifest.phaseTiming.executionWallTimeMs < 0 ||
    manifest.phaseTiming.evaluationWallTimeMs < 0 ||
    manifest.phaseTiming.totalWallTimeMs < 0
  ) {
    throw new Error(`${name} has invalid phase timing evidence.`);
  }
  if (
    manifest.caseCount !== definition.cases.length ||
    manifest.totalSessions !==
      definition.cases.length * definition.officialRepetitions
  ) {
    throw new Error(`${name} session matrix does not match the eval definition.`);
  }
  for (const [label, hash] of [
    ["eval-set", manifest.evalSetHash],
    ["fixture", manifest.fixtureHash],
  ] as const) {
    if (!/^sha256:[a-f0-9]{64}$/.test(hash)) {
      throw new Error(`${name} has an invalid ${label} hash.`);
    }
  }
  for (const hash of Object.values(manifest.rawArtifactHashes)) {
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error(`${name} has an invalid raw artifact SHA-256.`);
    }
  }
  if (Object.keys(manifest.rawArtifactHashes).length !== manifest.totalSessions) {
    throw new Error(`${name} must hash one private raw artifact per session.`);
  }
  const benchmarkConfigurations = Object.keys(benchmark.configurations);
  if (
    benchmarkConfigurations.length !== 1 ||
    benchmarkConfigurations[0] !== manifest.configuration
  ) {
    throw new Error(`${name} benchmark must contain only its evaluated configuration.`);
  }
  const expectedRunsPerConfiguration =
    definition.cases.length * definition.officialRepetitions;
  const result = benchmark.configurations[manifest.configuration];
  if (!result || result.runs !== expectedRunsPerConfiguration) {
    throw new Error(
      `${name} must contain ${expectedRunsPerConfiguration} runs.`,
    );
  }
  if (
    result.expectedGuardRejections < 0 ||
    result.failedToolCalls < 0 ||
    result.retries < 0 ||
    !Number.isFinite(result.meanTokensPerRun) ||
    result.meanTokensPerRun < 0 ||
    !Number.isFinite(result.meanWallTimeMs) ||
    result.meanWallTimeMs < 0
  ) {
    throw new Error(`${name} contains an invalid negative benchmark count.`);
  }
  const expectedCategories = [
    ...new Set(definition.cases.map(({ category }) => category)),
  ].sort();
  if (
    JSON.stringify(Object.keys(benchmark.categories).sort()) !==
    JSON.stringify(expectedCategories)
  ) {
    throw new Error(`${name} category benchmark does not match the eval set.`);
  }
  for (const category of expectedCategories) {
    const expectedCategoryRuns =
      definition.cases.filter((evalCase) => evalCase.category === category)
        .length * definition.officialRepetitions;
    if (
      benchmark.categories[category]?.[manifest.configuration]?.runs !==
      expectedCategoryRuns ||
      Object.keys(benchmark.categories[category] ?? {}).length !== 1
    ) {
      throw new Error(
        `${name} ${category} must contain ${expectedCategoryRuns} runs for its single configuration.`,
      );
    }
  }
  for (const evalCase of definition.cases) {
    for (let repetition = 1; repetition <= definition.officialRepetitions; repetition += 1) {
      const caseRoot = join(root, "cases", evalCase.id, String(repetition));
      for (const relativePath of RETAINED_CASE_FILES) {
        const path = join(caseRoot, relativePath);
        if (!existsSync(path)) {
          throw new Error(`${name} is missing run evidence: ${path}`);
        }
      }
      for (const relativePath of PRIVATE_CASE_FILES) {
        const path = join(caseRoot, relativePath);
        if (existsSync(path)) {
          throw new Error(
            `${name} contains private or redundant run output: ${path}. Run npm run eval:webmcp:publish.`,
          );
        }
      }
      const grading = readJson<{
        assertionResults?: Array<{
          id: string;
          passed: boolean;
          details?: {
            method?: string;
            scores?: Record<string, number>;
            evidence?: unknown[];
          };
        }>;
      }>(join(caseRoot, "grading.json"));
      const conversationQuality = grading.assertionResults?.find(
        ({ id }) => id === CONVERSATION_QUALITY_ASSERTION_ID,
      );
      if (
        !conversationQuality ||
        conversationQuality.details?.method !== "llm-transcript-judge" ||
        !CONVERSATION_QUALITY_DIMENSIONS.every((dimension) =>
          Number.isInteger(conversationQuality.details?.scores?.[dimension]),
        ) ||
        !conversationQuality.details?.evidence?.length
      ) {
        throw new Error(
          `${name}/${evalCase.id}/${repetition} is missing conversation-quality evidence inside its assertion result.`,
        );
      }
    }
  }
  validateSanitizedArtifacts(root);
  return { name, root, manifest, benchmark };
}

function ratio(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function numberOrDash(value: number | null, suffix = "") {
  return value === null ? "—" : `${Math.round(value).toLocaleString("en-US")}${suffix}`;
}

function decimalOrDash(value: number | null, digits: number, suffix = "") {
  return value === null
    ? "—"
    : `${value.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}${suffix}`;
}

function iterationEvidenceRows(
  iterations: Array<ReturnType<typeof validateIteration>>,
  accepted: ReturnType<typeof validateIteration> | undefined,
  decisions: ReadonlyMap<string, OptimizationDecision>,
) {
  return iterations.map((iteration) => {
    const metric =
      iteration.benchmark.configurations[iteration.manifest.configuration];
    const number = iteration.name.replace("iteration-", "");
    const toolCount =
      iteration.manifest.configuration === "no_webmcp"
        ? "—"
        : String(iteration.manifest.registeredToolCount);
    const decision =
      iteration.manifest.configuration === "no_webmcp"
        ? "Control"
        : iteration.name === accepted?.name
          ? "**Best accepted**"
          : decisions.get(iteration.name) === "accepted"
            ? "Accepted"
            : "Rejected";

    return `| [#${number}](../evals/iterations/${iteration.name}/) | ${toolCount} | ${decision} | ${metric.passed}/${metric.runs} (${ratio(metric.passRate)}) | ${numberOrDash(metric.meanTokensPerRun)} | ${decimalOrDash(metric.meanWallTimeMs / 1000, 1, " s")} |`;
  });
}

function acceptedBlock(
  accepted:
    | ReturnType<typeof validateIteration>
    | undefined,
  control:
    | ReturnType<typeof validateIteration>
    | undefined,
  iterations: Array<ReturnType<typeof validateIteration>>,
  decisions: ReadonlyMap<string, OptimizationDecision>,
) {
  const firstNumber = iterations.at(0)?.name.replace("iteration-", "") ?? "—";
  const lastNumber = iterations.at(-1)?.name.replace("iteration-", "") ?? "—";
  const evidenceTable = [
    `### Official iteration record (${firstNumber}–${lastNumber})`,
    "",
    "Each try links to its immutable manifest, benchmark, retained case grades, timing, final responses, and candidate code snapshot when WebMCP is present.",
    "",
    "| Try | WebMCP tools | Decision | Task success | Tokens / try | Seconds / try |",
    "| --- | ---: | --- | ---: | ---: | ---: |",
    ...iterationEvidenceRows(iterations, accepted, decisions),
  ];

  if (!accepted) {
    return [
      START_MARKER,
      "Latest accepted candidate iteration: **none**.",
      "",
      ...evidenceTable,
      END_MARKER,
    ].join("\n");
  }
  if (!control) {
    throw new Error("An accepted candidate requires iteration-001 control evidence.");
  }
  const candidate = accepted.benchmark.configurations.candidate;
  const noWebMcp = control.benchmark.configurations.no_webmcp;
  return [
    START_MARKER,
    `Latest accepted candidate iteration: **${accepted.name}** (${accepted.manifest.registeredToolCount} tools; exact source preserved in [${accepted.name}/artifact](../evals/iterations/${accepted.name}/artifact/)).`,
    "",
    "| Configuration | Task success | Tokens / try | Seconds / try |",
    "| --- | ---: | ---: | ---: |",
    `| Candidate | ${ratio(candidate.passRate)} | ${numberOrDash(candidate.meanTokensPerRun)} | ${decimalOrDash(candidate.meanWallTimeMs / 1000, 1, " s")} |`,
    `| No WebMCP | ${ratio(noWebMcp.passRate)} | ${numberOrDash(noWebMcp.meanTokensPerRun)} | ${decimalOrDash(noWebMcp.meanWallTimeMs / 1000, 1, " s")} |`,
    "",
    ...evidenceTable,
    END_MARKER,
  ].join("\n");
}

function assertPerformanceGate(
  iteration: ReturnType<typeof validateIteration>,
  decision: OptimizationDecision,
  control: ReturnType<typeof validateIteration> | undefined,
  previousAccepted?: ReturnType<typeof validateIteration>,
) {
  if (decision !== "accepted") return;
  if (iteration.manifest.configuration !== "candidate") {
    throw new Error("The no-WebMCP starting iteration cannot be accepted as a candidate.");
  }
  if (!control) {
    throw new Error(
      "A candidate cannot be accepted before iteration-001 is assessed as the control.",
    );
  }
  if (iteration.manifest.evalSetHash !== `sha256:${hashFile(EVALS_PATH)}`) {
    throw new Error("Approved iteration must match the current eval set.");
  }
  if (
    iteration.manifest.fixtureHash !==
    `sha256:${hashFiles([
      join(EVALS_ROOT, "runner/browser-control.ts"),
      join(EVALS_ROOT, "runner/browser-host.ts"),
      join(EVALS_ROOT, "runner/grading.ts"),
      join(EVALS_ROOT, "runner/run-agent-eval.ts"),
    ])}`
  ) {
    throw new Error("Approved iteration must match the current browser fixture.");
  }
  const candidate = iteration.benchmark.configurations.candidate;
  const noWebMcp = control.benchmark.configurations.no_webmcp;
  if (!candidate || !noWebMcp) {
    throw new Error(`${iteration.name} is missing a required configuration.`);
  }
  if (candidate.passRate <= noWebMcp.passRate) {
    throw new Error(
      "The first approved candidate must improve task success over no WebMCP.",
    );
  }
  const candidateTokens = candidate.meanTokensPerRun;
  const candidateTime = candidate.meanWallTimeMs;

  if (!previousAccepted) return;
  const previous = previousAccepted.benchmark.configurations.candidate;
  const previousTokens = previous.meanTokensPerRun;
  const previousTime = previous.meanWallTimeMs;
  if (candidate.passRate < previous.passRate) {
    throw new Error(
      "An accepted optimization iteration cannot regress task success.",
    );
  }
  const tokenImproved = candidateTokens < previousTokens;
  const timeImproved = candidateTime < previousTime;
  const tokenRegressedTooFar = candidateTokens > previousTokens * 1.1;
  const timeRegressedTooFar = candidateTime > previousTime * 1.1;
  if ((!tokenImproved && !timeImproved) || tokenRegressedTooFar || timeRegressedTooFar) {
    throw new Error(
      "An accepted optimization iteration must improve tokens or visible time without >10% regression in the other.",
    );
  }
}

function assertNoTrackedRawArtifacts() {
  const tracked = execFileSync("git", ["ls-files", "evals/.raw"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  if (tracked) throw new Error("evals/.raw must never be tracked by Git.");
}

function main() {
  const definition = validateDefinition();
  assertNoTrackedRawArtifacts();
  const iterationNames = officialIterationNames();
  if (process.argv.includes("--write-doc")) {
    for (const name of iterationNames) {
      curatePublishedIteration(join(ITERATIONS_ROOT, name), definition);
    }
  }
  const iterations = iterationNames.map((name) =>
    validateIteration(name, definition),
  );
  iterations.forEach((iteration, index) => {
    const expectedName = `iteration-${String(index + 1).padStart(3, "0")}`;
    if (iteration.name !== expectedName) {
      throw new Error(
        `Official iterations must be contiguous; expected ${expectedName}, found ${iteration.name}.`,
      );
    }
  });
  const control = iterations.find(
    ({ manifest }) => manifest.configuration === "no_webmcp",
  );
  const trajectoryData = readOptimizationTrajectory(ITERATIONS_ROOT);
  if (!trajectoryData) {
    throw new Error("Official iterations require an optimization trajectory.");
  }
  const decisions = new Map<string, OptimizationDecision>(
    trajectoryData.attempts.map(({ iteration, decision }) => [
      iteration,
      decision,
    ]),
  );
  let previousAccepted: ReturnType<typeof validateIteration> | undefined;
  for (const iteration of iterations) {
    const decision = decisions.get(iteration.name);
    if (!decision) {
      throw new Error(`${iteration.name} has no derived optimization decision.`);
    }
    assertPerformanceGate(iteration, decision, control, previousAccepted);
    if (decision === "accepted") {
      previousAccepted = iteration;
    }
  }
  const accepted = [...iterations]
    .reverse()
    .find((iteration) => decisions.get(iteration.name) === "accepted");
  const expected = acceptedBlock(accepted, control, iterations, decisions);
  const document = readFileSync(EVALUATION_PATH, "utf8");
  const start = document.indexOf(START_MARKER);
  const end = document.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("EVALUATION.md is missing accepted benchmark markers.");
  }
  const current = document.slice(start, end + END_MARKER.length);
  if (process.argv.includes("--write-doc")) {
    if (current !== expected) {
      writeFileSync(EVALUATION_PATH, document.replace(current, expected));
    }
  } else if (current !== expected) {
    throw new Error(
      "EVALUATION.md metrics do not match the latest approved iteration. Run npm run eval:webmcp:publish.",
    );
  }
  const trajectory = buildOptimizationTrajectory(ITERATIONS_ROOT);
  if (!trajectory) {
    if (existsSync(TRAJECTORY_JSON_PATH) || existsSync(TRAJECTORY_SVG_PATH)) {
      throw new Error(
        "Optimization trajectory exists without an official iteration.",
      );
    }
  } else if (process.argv.includes("--write-doc")) {
    mkdirSync(OPTIMIZATION_ROOT, { recursive: true });
    writeFileSync(TRAJECTORY_JSON_PATH, trajectory.json);
    writeFileSync(TRAJECTORY_SVG_PATH, trajectory.svg);
  } else {
    if (
      !existsSync(TRAJECTORY_JSON_PATH) ||
      !existsSync(TRAJECTORY_SVG_PATH) ||
      readFileSync(TRAJECTORY_JSON_PATH, "utf8") !== trajectory.json ||
      readFileSync(TRAJECTORY_SVG_PATH, "utf8") !== trajectory.svg
    ) {
      throw new Error(
        "Optimization trajectory is missing or stale. Run npm run eval:webmcp:publish.",
      );
    }
  }
  process.stdout.write(
    `Evaluation definition verified: ${definition.cases.length} cases, ${definition.cases.length * definition.officialRepetitions} planned sessions per iteration. Retained iterations: ${iterations.length}. Accepted candidate: ${accepted?.name ?? "none"}.\n`,
  );
}

main();
