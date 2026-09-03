import { expect, test } from "@playwright/test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  finalizeIterationWorkspace,
  initializeIterationWorkspace,
} from "../../evals/runner/workspace";

test("iteration staging starts from the tracked template without creating an official result", () => {
  const root = mkdtempSync(join(tmpdir(), "masil-eval-workspace-"));
  const outputRoot = join(root, ".staging-iteration-001");
  const templateRoot = resolve(process.cwd(), "evals/templates/iteration");

  try {
    initializeIterationWorkspace({ templateRoot, outputRoot });
    expect(existsSync(join(outputRoot, "cases", ".gitkeep"))).toBe(true);
    finalizeIterationWorkspace(outputRoot);
    expect(existsSync(join(outputRoot, "cases", ".gitkeep"))).toBe(false);
    expect(existsSync(join(outputRoot, "cases"))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
