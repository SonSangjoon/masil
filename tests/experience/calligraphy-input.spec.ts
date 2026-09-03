import { expect, test } from "@playwright/test";

import {
  createReferenceDataUrl,
  executeBrowserTool,
  installWebMcpTestHost,
  waitForRegisteredTools,
} from "../webmcp/host";

test("the direct brush remains available with an alpha-shaped reference mask", async ({
  page,
}) => {
  await installWebMcpTestHost(page);
  await page.goto("/");
  await waitForRegisteredTools(page);

  await page.evaluate(() => {
    const target = window as typeof window & {
      __MASIL_WEBMCP_TEST_HOST__?: {
        execute: (
          name: string,
          input: Record<string, unknown>,
        ) => Promise<unknown>;
      };
      __MASIL_CALLIGRAPHY_INPUT_TEST__?: Promise<unknown>;
    };
    if (!target.__MASIL_WEBMCP_TEST_HOST__) {
      throw new Error("TEST_HOST_NOT_INSTALLED");
    }
    target.__MASIL_CALLIGRAPHY_INPUT_TEST__ =
      target.__MASIL_WEBMCP_TEST_HOST__.execute("masil_open_activity", {
        activity: "calligraphy",
        question: "어떤 글자를 써볼까요?",
      });
  });

  await expect(page.getByText("어떤 글자를 써볼까요?", { exact: true }))
    .toBeVisible();
  await expect(page.getByText("확인을 기다리는 중", { exact: true }))
    .toBeVisible();
  const referenceImageUrl = await createReferenceDataUrl(page, "valid");
  await executeBrowserTool(page, "masil_set_calligraphy_reference", {
    character: "春",
    referenceImageUrl,
  });
  await page.evaluate(async () => {
    const target = window as typeof window & {
      __MASIL_CALLIGRAPHY_INPUT_TEST__?: Promise<unknown>;
    };
    await target.__MASIL_CALLIGRAPHY_INPUT_TEST__;
    delete target.__MASIL_CALLIGRAPHY_INPUT_TEST__;
  });
  const canvas = page.locator(
    'canvas[aria-label="春 글자를 공중의 손동작으로 쓰는 WebGPU 서예 공간"]',
  );
  await expect(canvas).toBeVisible();
  await executeBrowserTool(page, "masil_start_calligraphy_camera", {
    personExplicitlyAsked: true,
  });
  await expect(
    page.getByText("주먹을 쥐면 쓰고 · 손을 펴면 멈춰요", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await executeBrowserTool(page, "masil_stop_calligraphy_camera", {
    personExplicitlyAsked: true,
  });

  await expect(
    page.getByText("이 브라우저에서 WebGPU 붓을 열 수 없어요.", {
      exact: true,
    }),
  ).toHaveCount(0);

  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;
  await page.mouse.move(bounds.x + bounds.width * 0.35, bounds.y + bounds.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + bounds.height * 0.45, {
    steps: 12,
  });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(
    page.getByText("이 브라우저에서 WebGPU 붓을 열 수 없어요.", {
      exact: true,
    }),
  ).toHaveCount(0);
});
