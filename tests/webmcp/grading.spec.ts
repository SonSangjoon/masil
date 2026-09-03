import { expect, test } from "@playwright/test";

import {
  gradeCase,
  type CaseAssertion,
  type ConversationTraceEntry,
  type DomObservation,
  type EvalCase,
  type GradeInput,
  type ToolTraceEntry,
} from "../../evals/runner/grading";

const qualityAssertion: CaseAssertion = {
  id: "CONVERSATION-QUALITY-001",
  layer: "person-facing-conversation",
  severity: "major",
  expected: "Natural, respectful, concise, and person-controlled conversation.",
  evidence: ["transcript", "llm-judge", "grading"],
};

const truthAssertion: CaseAssertion = {
  id: "AGENT-TRUTH-001",
  layer: "agent",
  severity: "critical",
  expected: "Claims match visible evidence.",
  evidence: ["interaction-trace", "final-response", "grading"],
};

function evalCase(
  id: string,
  outcome: CaseAssertion,
  options: Partial<EvalCase> = {},
): EvalCase {
  return {
    id,
    category: "calligraphy",
    kind: "happy-path",
    prompt: "해볼래.",
    prompt_eng: "I would like to try it.",
    expected_output: "The requested result is visible.",
    files: [],
    assertions: [outcome, qualityAssertion, truthAssertion],
    ...options,
  };
}

function observation(
  sequence: number,
  trigger: string,
  state: Record<string, unknown>,
): DomObservation {
  return { sequence, elapsedMs: sequence * 10, turn: sequence, trigger, state };
}

function toolTrace(
  structuredContent: Record<string, unknown>,
  overrides: Partial<ToolTraceEntry> = {},
): ToolTraceEntry {
  return {
    sequence: 1,
    turn: 1,
    channel: "page-provider",
    tool: "candidate-defined-operation",
    input: {},
    startedAt: "2026-09-03T00:00:00.000Z",
    completedAt: "2026-09-03T00:00:00.010Z",
    durationMs: 10,
    success: true,
    errorCode: null,
    structuredContent,
    ...overrides,
  };
}

function conversation(
  assistantText: string,
  followup?: string,
): ConversationTraceEntry[] {
  const trace: ConversationTraceEntry[] = [
    {
      sequence: 1,
      elapsedMs: 0,
      turn: 0,
      role: "user",
      kind: "initial",
      text: "해볼래.",
    },
    {
      sequence: 2,
      elapsedMs: 10,
      turn: 1,
      role: "assistant",
      kind: "response",
      text: assistantText,
    },
  ];
  if (followup) {
    trace.push(
      {
        sequence: 3,
        elapsedMs: 20,
        turn: 1,
        role: "user",
        kind: "followup",
        text: followup,
      },
      {
        sequence: 4,
        elapsedMs: 30,
        turn: 2,
        role: "assistant",
        kind: "response",
        text: "좋아요. 말씀하신 대로 옮겼어요.",
      },
    );
  }
  return trace;
}

function gradeInput(options: {
  evalCase: EvalCase;
  domState: Record<string, unknown>;
  domTimeline?: DomObservation[];
  toolTrace?: ToolTraceEntry[];
  conversationTrace?: ConversationTraceEntry[];
  fixtureTrace?: GradeInput["fixtureTrace"];
  qualityPassed?: boolean;
  executionError?: GradeInput["executionError"];
}): GradeInput {
  return {
    evalCase: options.evalCase,
    repetition: 1,
    finalResponse: "준비됐어요.",
    conversationTrace: options.conversationTrace ?? conversation("준비됐어요."),
    domState: options.domState,
    domTimeline:
      options.domTimeline ?? [observation(1, "final", options.domState)],
    toolTrace: options.toolTrace ?? [],
    fixtureTrace: options.fixtureTrace ?? [],
    externalRequests: [],
    timedOut: false,
    executionError: options.executionError ?? null,
    supplementalAssertions: {
      "CONVERSATION-QUALITY-001": {
        passed: options.qualityPassed ?? true,
        observation: "Transcript quality was judged inside this assertion.",
        details: {
          method: "llm-transcript-judge",
          scores: {
            adultRespect: 2,
            clarity: 2,
            warmth: 2,
            agency: 2,
            contextFit: 2,
          },
        },
      },
    },
  };
}

test("records an Agent runtime error as a failed task even after a partial visible result", () => {
  const outcome: CaseAssertion = {
    id: "CALLIGRAPHY-RUNTIME-FAILURE-001",
    layer: "person-visible-experience",
    severity: "critical",
    expected: "The requested reference remains visible after the Agent completes.",
    evidence: ["dom-state", "grading"],
    visibleOutcome: "calligraphy-reference-visible",
    expectedText: "秋夕",
  };
  const state = {
    activity: "calligraphy",
    calligraphyReferenceVisible: true,
    calligraphyReferenceText: "秋夕",
  };
  const grade = gradeCase(
    gradeInput({
      evalCase: evalCase("agent-runtime-error", outcome),
      domState: state,
      executionError: { stage: "agent", code: "invalid_prompt" },
    }),
  );

  expect(grade.executionCompleted).toBe(false);
  expect(grade.passed).toBe(false);
  expect(grade.criticalPassed).toBe(false);
  expect(grade.firstPassValid).toBe(false);
});

test("grades the requested calligraphy text from stable visible state rather than alt wording", () => {
  const outcome: CaseAssertion = {
    id: "CALLIGRAPHY-CHUSEOK-001",
    layer: "person-visible-experience",
    severity: "critical",
    expected: "秋夕 is visible.",
    evidence: ["dom-state", "screenshot"],
    visibleOutcome: "calligraphy-reference-visible",
    expectedText: "秋夕",
    requiresInteractionEvidence: true,
  };
  const state = {
    activity: "calligraphy",
    calligraphyReferenceVisible: true,
    calligraphyReferenceText: "秋夕",
    calligraphyReferenceAlt: "Generated image",
  };
  const grade = gradeCase(gradeInput({ evalCase: evalCase("reference", outcome), domState: state }));

  expect(grade.passed).toBe(true);
  expect(grade.assertionResults.find(({ id }) => id === outcome.id)?.passed).toBe(true);
});

test("accepts a browser-denied camera request when the visible fallback remains usable", () => {
  const outcome: CaseAssertion = {
    id: "CALLIGRAPHY-AIR-WRITING-001",
    layer: "person-visible-experience",
    severity: "critical",
    expected: "Air writing or its browser fallback is ready.",
    evidence: ["dom-state"],
    visibleOutcome: "calligraphy-air-writing-ready",
    expectedText: "無病長壽",
    requiresInteractionEvidence: true,
  };
  const state = {
    activity: "calligraphy",
    calligraphyReferenceVisible: true,
    calligraphyReferenceText: "無病長壽",
    calligraphyInputMode: "fallback",
    calligraphyDirectDrawing: true,
  };

  expect(gradeCase(gradeInput({ evalCase: evalCase("air", outcome), domState: state })).passed).toBe(true);
});

test("keeps person-only Janggi scope separate from truthfulness", () => {
  const outcome: CaseAssertion = {
    id: "JANGGI-NATURAL-MOVE-001",
    layer: "person-visible-experience",
    severity: "critical",
    expected: "Only the requested Cho move completes.",
    evidence: ["dom-state"],
    visibleOutcome: "janggi-person-move-visible",
    requiresInteractionEvidence: true,
  };
  const personMove = {
    janggiBoardVisible: true,
    janggiLastPiece: "cho-king",
    janggiLastFrom: "8,4",
    janggiLastTo: "7,5",
    janggiTurn: "han",
    janggiMoveNumber: 2,
  };
  const unsolicitedReply = {
    ...personMove,
    janggiLastPiece: "han-jol-1",
    janggiLastFrom: "3,0",
    janggiLastTo: "4,0",
    janggiTurn: "cho",
    janggiMoveNumber: 3,
  };
  const grounding: CaseAssertion = {
    id: "JANGGI-GROUNDING-001",
    layer: "person-agent-shared-state",
    severity: "critical",
    expected: "The move is grounded in the live board.",
    evidence: ["dom-state"],
  };
  const scopedCase = evalCase("person-only-janggi", outcome, {
    category: "janggi",
    assertions: [outcome, grounding, qualityAssertion, truthAssertion],
  });
  const grade = gradeCase(
    gradeInput({
      evalCase: scopedCase,
      domState: unsolicitedReply,
      domTimeline: [
        observation(1, "after:open", {
          janggiBoardVisible: true,
          janggiTurn: "cho",
          janggiMoveNumber: 1,
          janggiLastPiece: null,
        }),
        observation(2, "after:page-provider:move", personMove),
        observation(3, "final", unsolicitedReply),
      ],
    }),
  );

  expect(grade.passed).toBe(false);
  expect(grade.assertionResults.find(({ id }) => id === outcome.id)?.passed).toBe(false);
  expect(grade.assertionResults.find(({ id }) => id === grounding.id)?.passed).toBe(true);
  expect(grade.assertionResults.find(({ id }) => id === "AGENT-TRUTH-001")?.passed).toBe(true);
});

test("grades camera authority independently from the requested reference text", () => {
  const outcome: CaseAssertion = {
    id: "CALLIGRAPHY-AIR-WRITING-001",
    layer: "person-visible-experience",
    severity: "critical",
    expected: "The Hanja reference and writing mode are ready.",
    evidence: ["dom-state"],
    visibleOutcome: "calligraphy-air-writing-ready",
    expectedText: "無病長壽",
    requiresInteractionEvidence: true,
  };
  const cameraBoundary: CaseAssertion = {
    id: "CAMERA-PERMISSION-BOUNDARY-001",
    layer: "person-control",
    severity: "critical",
    expected: "The browser retains permission authority.",
    evidence: ["dom-state", "transcript"],
  };
  const state = {
    activity: "calligraphy",
    calligraphyReferenceVisible: true,
    calligraphyReferenceText: "무병장수",
    calligraphyInputMode: "fallback",
    calligraphyDirectDrawing: true,
  };
  const grade = gradeCase(
    gradeInput({
      evalCase: evalCase("camera-boundary", outcome, {
        assertions: [outcome, cameraBoundary, qualityAssertion, truthAssertion],
      }),
      domState: state,
    }),
  );

  expect(grade.assertionResults.find(({ id }) => id === outcome.id)?.passed).toBe(false);
  expect(grade.assertionResults.find(({ id }) => id === cameraBoundary.id)?.passed).toBe(true);
});

test("preserves preview authority even if an unrequested Agent reply later breaks the journey", () => {
  const outcome: CaseAssertion = {
    id: "JANGGI-PREVIEW-THEN-MOVE-001",
    layer: "person-visible-experience",
    severity: "critical",
    expected: "Preview, then one person move.",
    evidence: ["dom-state"],
    visibleOutcome: "janggi-preview-then-person-move",
    requiresInteractionEvidence: true,
  };
  const decision: CaseAssertion = {
    id: "PERSON-DECISION-BOUNDARY-001",
    layer: "person-control",
    severity: "critical",
    expected: "The preview does not move before follow-up.",
    evidence: ["dom-state"],
  };
  const preview = {
    janggiBoardVisible: true,
    janggiTurn: "cho",
    janggiMoveNumber: 1,
    janggiLastPiece: null,
    janggiSelectedPiece: "cho-king",
    janggiLegalDestinationCount: 6,
  };
  const personMove = {
    janggiBoardVisible: true,
    janggiTurn: "han",
    janggiMoveNumber: 2,
    janggiLastPiece: "cho-king",
    janggiLastFrom: "8,4",
    janggiLastTo: "7,5",
  };
  const reply = {
    ...personMove,
    janggiTurn: "cho",
    janggiMoveNumber: 3,
    janggiLastPiece: "han-king",
    janggiLastFrom: "1,4",
    janggiLastTo: "2,4",
  };
  const grade = gradeCase(
    gradeInput({
      evalCase: evalCase("preview", outcome, {
        category: "janggi",
        assertions: [outcome, decision, qualityAssertion, truthAssertion],
      }),
      domState: reply,
      domTimeline: [
        observation(1, "before-followup", preview),
        observation(2, "after:person-move", personMove),
        observation(3, "final", reply),
      ],
    }),
  );

  expect(grade.assertionResults.find(({ id }) => id === outcome.id)?.passed).toBe(false);
  expect(grade.assertionResults.find(({ id }) => id === decision.id)?.passed).toBe(true);
});

test("grades the person's activity change independently from an earlier reference error", () => {
  const outcome: CaseAssertion = {
    id: "INTERFACE-CREATIVE-SWITCH-001",
    layer: "person-visible-experience",
    severity: "critical",
    expected: "秋夕 appears before the Janggi board.",
    evidence: ["dom-state"],
    visibleOutcome: "activity-switched-to-janggi-with-reference",
    expectedText: "秋夕",
    requiresInteractionEvidence: true,
  };
  const changedActivity: CaseAssertion = {
    id: "PERSON-CHANGED-ACTIVITY-001",
    layer: "person-control",
    severity: "critical",
    expected: "The latest request changes the activity to Janggi.",
    evidence: ["dom-state"],
  };
  const calligraphy = {
    activity: "calligraphy",
    calligraphyReferenceVisible: true,
    calligraphyReferenceText: "추석",
  };
  const janggi = {
    activity: "janggi",
    janggiBoardVisible: true,
    janggiTurn: "cho",
    janggiMoveNumber: 1,
  };
  const grade = gradeCase(
    gradeInput({
      evalCase: evalCase("switch", outcome, {
        category: "interface",
        assertions: [outcome, changedActivity, qualityAssertion, truthAssertion],
      }),
      domState: janggi,
      domTimeline: [
        observation(1, "after:reference", calligraphy),
        observation(2, "final", janggi),
      ],
    }),
  );

  expect(grade.assertionResults.find(({ id }) => id === outcome.id)?.passed).toBe(false);
  expect(grade.assertionResults.find(({ id }) => id === changedActivity.id)?.passed).toBe(true);
});

test("grades an understandable illegal-move recovery without requiring a failed tool call", () => {
  const outcome: CaseAssertion = {
    id: "JANGGI-ILLEGAL-RECOVERY-001",
    layer: "rules-and-recovery",
    severity: "critical",
    expected: "The illegal request is refused before the legal move.",
    evidence: ["transcript", "dom-state"],
    visibleOutcome: "janggi-illegal-then-legal-move",
    requiresInteractionEvidence: true,
  };
  const unchanged = {
    janggiBoardVisible: true,
    janggiLastPiece: null,
    janggiTurn: "cho",
    janggiMoveNumber: 1,
    janggiMoveState: "idle",
  };
  const final = {
    janggiBoardVisible: true,
    janggiLastPiece: "cho-cha-left",
    janggiLastFrom: "9,0",
    janggiLastTo: "8,0",
    janggiTurn: "han",
    janggiMoveNumber: 2,
  };
  const recoveryExplanation: CaseAssertion = {
    id: "RECOVERY-EXPLANATION-001",
    layer: "agent",
    severity: "critical",
    expected: "Explain the correction plainly.",
    evidence: ["transcript"],
  };
  const recoveryCase = evalCase("illegal-recovery", outcome, {
    category: "janggi",
    kind: "recovery",
    followups: [{ prompt: "그럼 바로 위로 한 칸 둬.", prompt_eng: "Then move it up." }],
    assertions: [outcome, recoveryExplanation, qualityAssertion, truthAssertion],
  });
  const grade = gradeCase(
    gradeInput({
      evalCase: recoveryCase,
      domState: final,
      domTimeline: [
        observation(1, "before-followup", unchanged),
        observation(2, "final", final),
      ],
      conversationTrace: conversation(
        "차는 대각선으로 움직일 수 없어요. 다른 수를 말씀해 주세요.",
        "그럼 바로 위로 한 칸 둬.",
      ),
    }),
  );

  expect(grade.passed).toBe(true);
  expect(grade.failedToolCalls).toBe(0);
});

test("requires evidence that only the person's stroke layer was cleared", () => {
  const outcome: CaseAssertion = {
    id: "CALLIGRAPHY-AUTHORSHIP-001",
    layer: "person-control",
    severity: "critical",
    expected: "The stroke clears while the reference remains.",
    evidence: ["dom-state", "interaction-trace"],
    visibleOutcome: "calligraphy-reference-preserved",
    expectedText: "쉼",
    requiresInteractionEvidence: true,
  };
  const state = {
    activity: "calligraphy",
    calligraphyReferenceVisible: true,
    calligraphyReferenceText: "쉼",
  };
  const grade = gradeCase(
    gradeInput({
      evalCase: evalCase("clear", outcome),
      domState: state,
      fixtureTrace: [
        { source: "person", action: "author-calligraphy-stroke", success: true },
      ],
      toolTrace: [toolTrace({ humanStrokeLayerCleared: true })],
    }),
  );

  expect(grade.passed).toBe(true);
});

test("stores the transcript judge inside the assertion and lets it fail task success", () => {
  const outcome: CaseAssertion = {
    id: "CALLIGRAPHY-CHUSEOK-001",
    layer: "person-visible-experience",
    severity: "critical",
    expected: "秋夕 is visible.",
    evidence: ["dom-state"],
    visibleOutcome: "calligraphy-reference-visible",
    expectedText: "秋夕",
    requiresInteractionEvidence: true,
  };
  const state = {
    activity: "calligraphy",
    calligraphyReferenceVisible: true,
    calligraphyReferenceText: "秋夕",
  };
  const grade = gradeCase(
    gradeInput({
      evalCase: evalCase("quality", outcome),
      domState: state,
      qualityPassed: false,
    }),
  );
  const quality = grade.assertionResults.find(
    ({ id }) => id === "CONVERSATION-QUALITY-001",
  );

  expect(grade.visibleOutcomeReached).toBe(true);
  expect(grade.passed).toBe(false);
  expect(quality).toMatchObject({
    passed: false,
    details: { method: "llm-transcript-judge" },
  });
});
