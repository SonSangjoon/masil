import { expect, test, type Page } from "@playwright/test";

import {
  awaitPendingEvalTool,
  createReferenceDataUrl,
  executeEvalTool,
  installEvalHost,
  startPendingEvalTool,
  waitForEvalTools,
} from "../../evals/runner/browser-host";

async function openProvider(page: Page) {
  await installEvalHost(page);
  await page.goto("/");
  await waitForEvalTools(page, 20);
}

async function startCalligraphy(page: Page) {
  await startPendingEvalTool(page, "masil_open_activity", {
    activity: "calligraphy",
    question: "어떤 글자를 써볼까요?",
  });
  await expect
    .poll(async () => {
      const state = await executeEvalTool(page, "masil_get_session_state", {});
      return state.structuredContent &&
        typeof state.structuredContent === "object"
        ? (state.structuredContent as Record<string, unknown>).activity
        : null;
    })
    .toBe("calligraphy");
}

test("evaluation fixtures place complete one-to-four-character references", async ({
  page,
}) => {
  await openProvider(page);

  for (const text of ["福", "秋夕", "한가위", "無病長壽"]) {
    await test.step(`${Array.from(text).length} characters: ${text}`, async () => {
      await startCalligraphy(page);
      const referenceImageUrl = await createReferenceDataUrl(page, text);
      const result = await executeEvalTool(
        page,
        "masil_set_calligraphy_reference",
        { character: text, referenceImageUrl },
      );
      await awaitPendingEvalTool(page);

      expect(result.structuredContent).toMatchObject({
        calligraphy: {
          character: text,
          referenceImagePresent: true,
          referenceValidation: {
            width: 1536,
            height: 1024,
            trueAlpha: true,
          },
        },
      });
      const visibleReference = page.getByTestId("calligraphy-reference");
      await expect(visibleReference).toBeVisible();
      await expect(visibleReference).toHaveAttribute(
        "data-calligraphy-reference-text",
        text,
      );
      await executeEvalTool(page, "masil_go_home", { personConfirmed: true });
    });
  }
});

test("evaluation recovery fixtures trigger the exact alpha and ratio guards", async ({
  page,
}) => {
  await openProvider(page);
  await startCalligraphy(page);

  const opaque = await createReferenceDataUrl(page, "봄바람", "opaque");
  await expect(
    executeEvalTool(page, "masil_set_calligraphy_reference", {
      character: "봄바람",
      referenceImageUrl: opaque,
    }),
  ).rejects.toThrow(/REFERENCE_IMAGE_REQUIRES_TRUE_ALPHA/);

  const wrongRatio = await createReferenceDataUrl(
    page,
    "봄바람",
    "wrong-ratio",
  );
  await expect(
    executeEvalTool(page, "masil_set_calligraphy_reference", {
      character: "봄바람",
      referenceImageUrl: wrongRatio,
    }),
  ).rejects.toThrow(/REFERENCE_IMAGE_REQUIRES_3_BY_2/);

  const corrected = await createReferenceDataUrl(page, "봄바람");
  await executeEvalTool(page, "masil_set_calligraphy_reference", {
    character: "봄바람",
    referenceImageUrl: corrected,
  });
  await awaitPendingEvalTool(page);
});
