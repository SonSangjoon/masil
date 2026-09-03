import { expect, test } from "@playwright/test";

import {
  executeBrowserControl,
  readBrowserSnapshot,
} from "../../evals/runner/browser-control";

test("generic browser control reaches a visible activity without WebMCP", async ({
  page,
}) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => "modelContext" in document))
    .toBe(false);

  const home = await readBrowserSnapshot(page);
  const panelButton = home.elements.find(({ name }) =>
    name.startsWith("WebMCP "),
  );
  expect(panelButton).toBeDefined();
  const panelOpen = await executeBrowserControl(page, "browser_click", {
    ref: panelButton?.ref,
  });
  expect(panelOpen.structuredContent).toMatchObject({
    interaction: {
      type: "click",
      targetRole: "button",
    },
  });

  const panel = await readBrowserSnapshot(page);
  const calligraphyButton = panel.elements.find(({ name }) =>
    name.startsWith("서예"),
  );
  expect(calligraphyButton).toBeDefined();
  await executeBrowserControl(page, "browser_click", {
    ref: calligraphyButton?.ref,
  });

  await expect(page.getByText("어떤 글자를 써볼까요?", { exact: true })).toBeVisible({
    timeout: 5000,
  });
  const activity = await readBrowserSnapshot(page);
  expect(activity.visibleText).toContain("어떤 글자를 써볼까요?");
});

test("the initial Janggi turn number is not mistaken for a committed move", async ({
  page,
}) => {
  await page.goto("/");
  const home = await readBrowserSnapshot(page);
  await executeBrowserControl(page, "browser_click", {
    ref: home.elements.find(({ name }) =>
      name.startsWith("WebMCP "),
    )?.ref,
  });
  const panel = await readBrowserSnapshot(page);
  await executeBrowserControl(page, "browser_click", {
    ref: panel.elements.find(({ name }) => name.startsWith("장기"))?.ref,
  });

  const board = page.getByTestId("janggi-vgpu-board");
  await expect(board).toBeVisible({ timeout: 5_000 });
  await expect(board).toHaveAttribute("data-janggi-move-number", "1");
  await expect(board).toHaveAttribute("data-janggi-last-piece", "");
  await expect(board).toHaveAttribute("data-janggi-move-state", "idle");
});
