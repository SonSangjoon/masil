import { expect, test, type Page } from "@playwright/test";

import {
  createReferenceDataUrl,
  executeBrowserTool,
  installWebMcpTestHost,
  waitForRegisteredTools,
} from "./host";

type PendingWindow = typeof window & {
  __MASIL_WEBMCP_TEST_HOST__?: {
    execute: (
      name: string,
      input: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
  };
  __MASIL_PENDING_TOOL__?: Promise<Record<string, unknown>>;
};

async function openProvider(page: Page) {
  await installWebMcpTestHost(page);
  await page.goto("/");
  await waitForRegisteredTools(page);
}

async function startPendingTool(
  page: Page,
  name: string,
  input: Record<string, unknown> = {},
) {
  await page.evaluate(
    ({ toolName, toolInput }) => {
      const target = window as PendingWindow;
      if (!target.__MASIL_WEBMCP_TEST_HOST__) {
        throw new Error("TEST_HOST_NOT_INSTALLED");
      }
      target.__MASIL_PENDING_TOOL__ =
        target.__MASIL_WEBMCP_TEST_HOST__.execute(toolName, toolInput);
    },
    { toolName: name, toolInput: input },
  );
}

async function awaitPendingTool(page: Page) {
  return page.evaluate(async () => {
    const target = window as PendingWindow;
    const result = await target.__MASIL_PENDING_TOOL__;
    delete target.__MASIL_PENDING_TOOL__;
    return result;
  });
}

test("every tool has a deterministic rejection or permission boundary", async ({
  page,
}) => {
  await openProvider(page);
  const rejected = [
    ["masil_set_language", { language: "fr" }, "INVALID_LANGUAGE"],
    [
      "masil_set_webmcp_panel",
      { open: true, tab: "unknown" },
      "INVALID_PANEL_TAB",
    ],
    [
      "masil_project_agent_presence",
      { phase: "recording" },
      "INVALID_AGENT_PHASE",
    ],
    ["masil_go_home", { personConfirmed: false }, "PERSON_CONFIRMATION_REQUIRED"],
    ["masil_open_activity", { activity: "video" }, "INVALID_ACTIVITY"],
    [
      "masil_set_calligraphy_reference",
      { character: "福", referenceImageUrl: "eval://missing" },
      "CALLIGRAPHY_NOT_OPEN",
    ],
    [
      "masil_start_calligraphy_camera",
      { personExplicitlyAsked: true },
      "CALLIGRAPHY_REFERENCE_NOT_READY",
    ],
    [
      "masil_stop_calligraphy_camera",
      { personExplicitlyAsked: true },
      "CALLIGRAPHY_NOT_OPEN",
    ],
    [
      "masil_clear_calligraphy",
      { personConfirmed: true },
      "CALLIGRAPHY_NOT_OPEN",
    ],
    ["masil_get_janggi_state", {}, "JANGGI_NOT_OPEN"],
    ["masil_wait_for_person_janggi_move", {}, "JANGGI_NOT_OPEN"],
    [
      "masil_move_janggi_piece",
      { action: "preview", actor: "person" },
      "JANGGI_NOT_OPEN",
    ],
    [
      "masil_open_support_note",
      {
        personExplicitlyAsked: false,
        summary: "synthetic",
        desiredOutcome: "synthetic",
      },
      "ACTIVE_ACTIVITY_REQUIRED",
    ],
    [
      "masil_prepare_support_review",
      { minimumDisclosure: "synthetic" },
      "PRIVATE_NOTE_NOT_OPEN",
    ],
    ["masil_create_local_handoff", { seenRevision: 0 }, "SUPPORT_REVIEW_NOT_OPEN"],
    ["masil_get_handoff_status", {}, "NO_HANDOFF"],
    ["masil_return_to_activity", {}, "NO_ACTIVITY_TO_RETURN_TO"],
  ] as const;

  for (const [name, input, code] of rejected) {
    await expect(executeBrowserTool(page, name, input)).rejects.toThrow(
      new RegExp(code),
    );
  }

  for (const readOnlyTool of [
    "masil_get_capabilities",
    "masil_get_session_state",
    "masil_get_execution_log",
  ]) {
    const result = await executeBrowserTool(page, readOnlyTool);
    expect(result.structuredContent).toBeTruthy();
  }
});

test("all 20 tools execute across one person-controlled end-to-end session", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openProvider(page);
  const succeeded = new Set<string>();
  const run = async (name: string, input: Record<string, unknown> = {}) => {
    const result = await executeBrowserTool(page, name, input);
    succeeded.add(name);
    return result;
  };

  await run("masil_get_capabilities");
  await run("masil_get_session_state");
  await run("masil_get_execution_log");
  await run("masil_set_language", { language: "en" });
  await run("masil_set_language", { language: "ko" });
  await run("masil_set_webmcp_panel", { open: true, tab: "tools" });
  await run("masil_set_webmcp_panel", { open: false, tab: "history" });
  await run("masil_project_agent_presence", {
    phase: "listening",
    caption: "말씀을 듣고 있어요.",
  });

  await startPendingTool(page, "masil_open_activity", {
    activity: "calligraphy",
    question: "어떤 글자를 써볼까요?",
  });
  await expect
    .poll(async () => {
      const state = await executeBrowserTool(page, "masil_get_session_state");
      return state.structuredContent?.activity;
    })
    .toBe("calligraphy");
  const referenceImageUrl = await createReferenceDataUrl(page, "valid");
  await run("masil_set_calligraphy_reference", {
    character: "福",
    referenceImageUrl,
  });
  await awaitPendingTool(page);
  succeeded.add("masil_open_activity");

  await run("masil_start_calligraphy_camera", {
    personExplicitlyAsked: true,
  });
  await expect
    .poll(async () => {
      const state = await executeBrowserTool(page, "masil_get_session_state");
      return state.structuredContent?.calligraphyInputMode;
    })
    .toMatch(/requesting|hand/);
  await run("masil_stop_calligraphy_camera", {
    personExplicitlyAsked: true,
  });
  await run("masil_clear_calligraphy", { personConfirmed: true });
  await run("masil_go_home", { personConfirmed: true });

  await run("masil_open_activity", {
    activity: "janggi",
    caption: "장기를 같이 둘게요.",
  });
  await run("masil_get_janggi_state");
  await startPendingTool(page, "masil_wait_for_person_janggi_move");
  await expect
    .poll(async () => {
      const state = await executeBrowserTool(page, "masil_get_session_state");
      return state.structuredContent?.presence;
    })
    .toBe("awaiting");
  await page.getByTestId("janggi-piece-cho-king").click();
  await page.getByTestId("janggi-destination-7-5").click();
  const personMove = await awaitPendingTool(page);
  succeeded.add("masil_wait_for_person_janggi_move");
  expect(personMove).toBeTruthy();
  expect(personMove?.structuredContent).toMatchObject({
    shouldAgentReply: true,
    animation: "completed",
  });

  const afterPerson = await run("masil_get_janggi_state");
  const pieces = (afterPerson.structuredContent?.pieces ?? []) as Array<{
    id: string;
    legalMoves: Array<{ row: number; col: number }>;
  }>;
  const agentPiece = pieces.find((piece) => piece.legalMoves.length > 0);
  const agentDestination = agentPiece?.legalMoves[0];
  expect(agentPiece).toBeTruthy();
  expect(agentDestination).toBeTruthy();
  await run("masil_move_janggi_piece", {
    action: "move",
    actor: "agent",
    pieceId: agentPiece?.id,
    toRow: agentDestination?.row,
    toCol: agentDestination?.col,
    spokenMove: "Agent 응수",
    personConfirmed: false,
  });

  await run("masil_open_support_note", {
    personExplicitlyAsked: true,
    summary: "반찬 배달이 멈췄어요.",
    desiredOutcome: "전화로 확인하고 싶어요.",
  });
  await run("masil_prepare_support_review", {
    minimumDisclosure: "반찬 배달 중단 창구를 전화로 확인하고 싶습니다.",
  });
  await page.getByRole("button", { name: "이 문장만 보여줘도 괜찮아요" }).click();
  await page
    .getByRole("button", { name: "로컬 담당자 작업 카드를 만들어 주세요" })
    .click();
  const confirmed = await run("masil_get_session_state");
  await run("masil_create_local_handoff", {
    seenRevision: confirmed.structuredContent?.revision,
  });
  await run("masil_get_handoff_status");
  await run("masil_return_to_activity");

  expect([...succeeded].sort()).toEqual(
    [
      "masil_clear_calligraphy",
      "masil_create_local_handoff",
      "masil_get_capabilities",
      "masil_get_execution_log",
      "masil_get_handoff_status",
      "masil_get_janggi_state",
      "masil_get_session_state",
      "masil_go_home",
      "masil_move_janggi_piece",
      "masil_open_activity",
      "masil_open_support_note",
      "masil_prepare_support_review",
      "masil_project_agent_presence",
      "masil_return_to_activity",
      "masil_set_calligraphy_reference",
      "masil_set_language",
      "masil_set_webmcp_panel",
      "masil_start_calligraphy_camera",
      "masil_stop_calligraphy_camera",
      "masil_wait_for_person_janggi_move",
    ].sort(),
  );

  const log = await run("masil_get_execution_log");
  const serialized = JSON.stringify(log.structuredContent);
  expect(serialized).not.toContain("data:image");
  expect(serialized).not.toContain("반찬 배달이 멈췄어요");
});
