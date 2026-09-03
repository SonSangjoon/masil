import { expect, test, type Page } from "@playwright/test";

import {
  createReferenceDataUrl,
  executeBrowserTool,
  installWebMcpTestHost,
  registeredBrowserTools,
  waitForRegisteredTools,
} from "./host";

async function openPageWithProvider(page: Page) {
  await installWebMcpTestHost(page);
  await page.goto("/");
  await waitForRegisteredTools(page);
}

async function startPendingCalligraphy(page: Page) {
  await page.evaluate(() => {
    const host = (
      window as typeof window & {
        __MASIL_WEBMCP_TEST_HOST__?: {
          execute: (
            name: string,
            input: Record<string, unknown>,
          ) => Promise<unknown>;
        };
        __MASIL_PENDING_CALLIGRAPHY__?: Promise<unknown>;
      }
    ).__MASIL_WEBMCP_TEST_HOST__;
    if (!host) throw new Error("TEST_HOST_NOT_INSTALLED");
    (
      window as typeof window & {
        __MASIL_PENDING_CALLIGRAPHY__?: Promise<unknown>;
      }
    ).__MASIL_PENDING_CALLIGRAPHY__ = host.execute(
      "masil_open_activity",
      {
        activity: "calligraphy",
        question: "어떤 글자를 써볼까요?",
      },
    );
  });

  await expect
    .poll(async () => {
      const result = await executeBrowserTool(page, "masil_get_session_state");
      return result.structuredContent?.activity;
    })
    .toBe("calligraphy");
}

async function awaitPendingCalligraphy(page: Page) {
  await page.evaluate(async () => {
    const target = window as typeof window & {
      __MASIL_PENDING_CALLIGRAPHY__?: Promise<unknown>;
    };
    await target.__MASIL_PENDING_CALLIGRAPHY__;
    delete target.__MASIL_PENDING_CALLIGRAPHY__;
  });
}

test("registers the complete contract and exposes matching capabilities", async ({
  page,
}) => {
  await openPageWithProvider(page);
  const tools = await registeredBrowserTools(page);
  const capabilities = await executeBrowserTool(
    page,
    "masil_get_capabilities",
  );

  expect(tools).toHaveLength(20);
  expect(new Set(tools.map(({ name }) => name)).size).toBe(20);
  expect(capabilities.structuredContent).toMatchObject({
    provider: "MASIL",
    toolCount: 20,
    agentCount: 1,
    embeddedAgent: false,
    pageOwnsModel: false,
    pageOwnsStt: false,
    pageOwnsTts: false,
  });
  expect(capabilities.structuredContent?.contractHash).toMatch(
    /^fnv1a:[a-f0-9]{8}$/,
  );
});

test("language, panels, activity transitions, and home use semantic tools", async ({
  page,
}) => {
  await openPageWithProvider(page);

  await executeBrowserTool(page, "masil_set_language", { language: "en" });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await executeBrowserTool(page, "masil_set_webmcp_panel", {
    open: true,
    tab: "tools",
  });
  await expect(page.locator("#webmcp-panel")).toBeVisible();
  await expect(page.getByTestId("webmcp-tab-tools")).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await executeBrowserTool(page, "masil_set_webmcp_panel", {
    open: true,
    tab: "history",
  });
  await expect(page.getByTestId("webmcp-tab-history")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await executeBrowserTool(page, "masil_set_webmcp_panel", {
    open: false,
    tab: "history",
  });

  await startPendingCalligraphy(page);
  const referenceImageUrl = await createReferenceDataUrl(page, "valid");
  await executeBrowserTool(page, "masil_set_calligraphy_reference", {
    character: "福",
    referenceImageUrl,
  });
  await awaitPendingCalligraphy(page);
  const calligraphyState = await executeBrowserTool(
    page,
    "masil_get_session_state",
  );
  expect(calligraphyState.structuredContent?.validNextActions).toContain(
    "masil_open_activity",
  );

  await executeBrowserTool(page, "masil_open_activity", {
    activity: "janggi",
    caption: "Let's play Janggi.",
  });
  await expect(page.getByTestId("janggi-vgpu-board")).toBeVisible();
  const home = await executeBrowserTool(page, "masil_go_home", {
    personConfirmed: true,
  });
  expect(home.structuredContent).toMatchObject({ stage: "home", activity: null });

  const log = await executeBrowserTool(page, "masil_get_execution_log");
  const invocations = log.structuredContent?.invocations as
    | Array<Record<string, unknown>>
    | undefined;
  expect(invocations?.length).toBeGreaterThanOrEqual(4);
  expect(invocations?.every((entry) => "revisionBefore" in entry)).toBe(true);
  expect(JSON.stringify(invocations)).not.toContain("Let's play Janggi");
});

test("calligraphy rejects malformed assets and accepts one real-alpha 3:2 reference", async ({
  page,
}) => {
  await openPageWithProvider(page);
  await startPendingCalligraphy(page);

  const cases = [
    ["opaque", "REFERENCE_IMAGE_REQUIRES_TRUE_ALPHA"],
    ["wrong-ratio", "REFERENCE_IMAGE_REQUIRES_3_BY_2"],
    ["too-small", "REFERENCE_IMAGE_TOO_SMALL"],
    ["light-ink", "REFERENCE_IMAGE_NEEDS_BLACK_INK_ONLY"],
    ["unsafe-margin", "REFERENCE_IMAGE_NEEDS_TRANSPARENT_MARGIN"],
    ["small-ink", "REFERENCE_IMAGE_INK_TOO_SMALL"],
  ] as const;

  for (const [variant, errorCode] of cases) {
    const referenceImageUrl = await createReferenceDataUrl(page, variant);
    await expect(
      executeBrowserTool(page, "masil_set_calligraphy_reference", {
        character: "秋夕",
        referenceImageUrl,
      }),
    ).rejects.toThrow(new RegExp(errorCode));
  }

  const referenceImageUrl = await createReferenceDataUrl(page, "valid");
  const placed = await executeBrowserTool(
    page,
    "masil_set_calligraphy_reference",
    {
      character: "秋夕",
      reading: "추석",
      meaning: "가을 저녁",
      referenceImageUrl,
      referenceImageAlt: "검은 먹으로 쓴 秋夕 글자본",
    },
  );
  await awaitPendingCalligraphy(page);

  expect(placed.structuredContent).toMatchObject({
    calligraphy: {
      character: "秋夕",
      referenceImagePresent: true,
      referenceValidation: {
        width: 1536,
        height: 1024,
        trueAlpha: true,
      },
    },
    assetValidation: {
      width: 1536,
      height: 1024,
      trueAlpha: true,
    },
  });

  const log = await executeBrowserTool(page, "masil_get_execution_log");
  expect(JSON.stringify(log.structuredContent)).not.toContain("data:image");
});

test("camera, destructive actions, and support handoff preserve person gates", async ({
  page,
}) => {
  await openPageWithProvider(page);
  await startPendingCalligraphy(page);
  const referenceImageUrl = await createReferenceDataUrl(page, "valid");
  await executeBrowserTool(page, "masil_set_calligraphy_reference", {
    character: "福",
    referenceImageUrl,
  });
  await awaitPendingCalligraphy(page);

  await expect(
    executeBrowserTool(page, "masil_start_calligraphy_camera", {
      personExplicitlyAsked: false,
    }),
  ).rejects.toThrow(/EXPLICIT_REQUEST_REQUIRED/);
  await expect(
    executeBrowserTool(page, "masil_clear_calligraphy", {
      personConfirmed: false,
    }),
  ).rejects.toThrow(/PERSON_CONFIRMATION_REQUIRED/);
  await expect(
    executeBrowserTool(page, "masil_open_support_note", {
      personExplicitlyAsked: false,
      summary: "반찬 배달이 멈췄어요.",
      desiredOutcome: "전화로 확인하고 싶어요.",
    }),
  ).rejects.toThrow(/EXPLICIT_REQUEST_REQUIRED/);

  await executeBrowserTool(page, "masil_open_support_note", {
    personExplicitlyAsked: true,
    summary: "반찬 배달이 멈췄어요.",
    desiredOutcome: "전화로 확인하고 싶어요.",
  });
  await executeBrowserTool(page, "masil_prepare_support_review", {
    minimumDisclosure: "반찬 배달 중단 창구를 전화로 확인하고 싶습니다.",
  });

  await expect(
    executeBrowserTool(page, "masil_create_local_handoff", { seenRevision: 0 }),
  ).rejects.toThrow(/TWO_CONFIRMATIONS_REQUIRED/);

  await page.getByRole("button", { name: "이 문장만 보여줘도 괜찮아요" }).click();
  await page
    .getByRole("button", { name: "로컬 담당자 작업 카드를 만들어 주세요" })
    .click();

  await expect(
    executeBrowserTool(page, "masil_create_local_handoff", { seenRevision: 0 }),
  ).rejects.toThrow(/STALE_REVISION/);

  const state = await executeBrowserTool(page, "masil_get_session_state");
  const handoff = await executeBrowserTool(page, "masil_create_local_handoff", {
    seenRevision: state.structuredContent?.revision,
  });
  expect(handoff.structuredContent).toMatchObject({
    stage: "handoff",
    localDemoOnly: true,
    externalTransmissionOccurred: false,
    governmentRequestCreated: false,
  });
});

test("Janggi requires live state and validates a visible person move", async ({
  page,
}) => {
  await openPageWithProvider(page);
  await executeBrowserTool(page, "masil_open_activity", {
    activity: "janggi",
    caption: "장기를 같이 둘게요.",
  });
  const state = await executeBrowserTool(page, "masil_get_janggi_state");
  expect(state.structuredContent).toMatchObject({
    personSide: "cho",
    agentSide: "han",
    turnOwner: "person",
  });

  await expect(
    executeBrowserTool(page, "masil_move_janggi_piece", {
      action: "move",
      actor: "person",
      pieceId: "cho-king",
      toRow: 7,
      toCol: 5,
      spokenMove: "왕 오른쪽 대각선",
      personConfirmed: false,
    }),
  ).rejects.toThrow(/PERSON_CONFIRMATION_REQUIRED/);

  const moved = await executeBrowserTool(page, "masil_move_janggi_piece", {
    action: "move",
    actor: "person",
    pieceId: "cho-king",
    toRow: 7,
    toCol: 5,
    spokenMove: "왕 오른쪽 대각선",
    personConfirmed: true,
  });
  expect(moved.structuredContent).toMatchObject({
    action: "move",
    actor: "person",
    rulesValidated: true,
    shouldAgentReply: true,
    animation: "completed",
    toolResolvedAfterVisibleAnimation: true,
  });

  await expect(
    executeBrowserTool(page, "masil_move_janggi_piece", {
      action: "reset",
      actor: "agent",
      personConfirmed: false,
    }),
  ).rejects.toThrow(/PERSON_CONFIRMATION_REQUIRED/);

  const reset = await executeBrowserTool(page, "masil_move_janggi_piece", {
    action: "reset",
    actor: "person",
    personConfirmed: true,
  });
  expect(reset.structuredContent).toMatchObject({
    action: "reset",
    actor: "person",
    moveNumber: 1,
    turn: "cho",
  });
});

test("without a WebMCP host the page registers no callable provider tools", async ({
  page,
}) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => document.modelContext === undefined))
    .toBe(true);
  await expect(page.getByTestId("open-event-log")).toHaveAccessibleName(
    /WebMCP 연결되지 않음/,
    { timeout: 8_000 },
  );
});
