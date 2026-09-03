import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Start every run from the tracked empty iteration skeleton. The destination
 * must not exist so a retry can never overwrite partial or retained evidence.
 */
export function initializeIterationWorkspace(options: {
  templateRoot: string;
  outputRoot: string;
}) {
  if (existsSync(options.outputRoot)) {
    throw new Error("EVALUATION_WORKSPACE_ALREADY_EXISTS");
  }
  mkdirSync(dirname(options.outputRoot), { recursive: true });
  cpSync(options.templateRoot, options.outputRoot, { recursive: true });
}

/** Remove tracked template markers before an official directory is retained. */
export function finalizeIterationWorkspace(outputRoot: string) {
  rmSync(join(outputRoot, "cases", ".gitkeep"), { force: true });
}

