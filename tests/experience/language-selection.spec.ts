import { expect, test, type Page } from "@playwright/test";

import {
  createReferenceDataUrl,
  executeBrowserTool,
  installWebMcpTestHost,
  waitForRegisteredTools,
} from "../webmcp/host";

async function openPageWithProvider(page: Page) {
  await installWebMcpTestHost(page);
  await page.goto("/");
  await waitForRegisteredTools(page);
}

async function startPendingCalligraphy(page: Page) {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __MASIL_WEBMCP_TEST_HOST__?: {
        execute: (
          name: string,
          input: Record<string, unknown>,
        ) => Promise<unknown>;
      };
      __MASIL_LANGUAGE_TEST_CALLIGRAPHY__?: Promise<unknown>;
    };
    if (!target.__MASIL_WEBMCP_TEST_HOST__) {
      throw new Error("TEST_HOST_NOT_INSTALLED");
    }
    target.__MASIL_LANGUAGE_TEST_CALLIGRAPHY__ =
      target.__MASIL_WEBMCP_TEST_HOST__.execute("masil_open_activity", {
        activity: "calligraphy",
        question: "어떤 글자를 써볼까요?",
      });
  });

  await expect(page.getByText("어떤 글자를 써볼까요?", { exact: true }))
    .toBeVisible({ timeout: 5_000 });
}

async function finishPendingCalligraphy(page: Page) {
  const referenceImageUrl = await createReferenceDataUrl(page, "valid");
  await executeBrowserTool(page, "masil_set_calligraphy_reference", {
    character: "福",
    referenceImageUrl,
  });
  await page.evaluate(async () => {
    const target = window as typeof window & {
      __MASIL_LANGUAGE_TEST_CALLIGRAPHY__?: Promise<unknown>;
    };
    await target.__MASIL_LANGUAGE_TEST_CALLIGRAPHY__;
    delete target.__MASIL_LANGUAGE_TEST_CALLIGRAPHY__;
  });
}

test("visible built-in copy follows the selected language after a screen opens", async ({
  page,
}) => {
  await openPageWithProvider(page);
  await executeBrowserTool(page, "masil_set_language", { language: "ko" });
  await startPendingCalligraphy(page);

  await executeBrowserTool(page, "masil_set_language", { language: "en" });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText("What shall we write?", { exact: true }))
    .toBeVisible();
  await expect(
    page.getByText("어떤 글자를 써볼까요?", { exact: true }),
  ).toHaveCount(0);

  await executeBrowserTool(page, "masil_set_language", { language: "ko" });
  await expect(page.getByText("어떤 글자를 써볼까요?", { exact: true }))
    .toBeVisible();
  await expect(
    page.getByText("What shall we write?", { exact: true }),
  ).toHaveCount(0);

  await finishPendingCalligraphy(page);
  await executeBrowserTool(page, "masil_open_support_note", {
    personExplicitlyAsked: true,
  });
  await executeBrowserTool(page, "masil_set_language", { language: "en" });

  const state = await executeBrowserTool(page, "masil_get_session_state");
  expect(state.structuredContent?.support).toMatchObject({
    summary:
      "The side-dish delivery that had been coming each week stopped, and I do not know whom to ask.",
    desiredOutcome:
      "I want to call first and confirm the right community-center desk and next step without making an unnecessary visit.",
  });
  await expect(
    page.getByText(
      "The side-dish delivery that had been coming each week stopped, and I do not know whom to ask.",
      { exact: true },
    ),
  ).toBeVisible();
});
