import { expect, test } from "@playwright/test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { snapshotWebMcpArtifact } from "../../evals/runner/artifact";

test("iteration artifact contains only a flat WebMCP code snapshot", () => {
  const root = mkdtempSync(join(tmpdir(), "masil-webmcp-artifact-"));
  const source = join(root, "webmcp");
  const iteration = join(root, "iteration-002");
  try {
    mkdirSync(join(source, "tools"), { recursive: true });
    writeFileSync(join(source, "contract.ts"), "export const contract = [];\n");
    writeFileSync(join(source, "tools/example.ts"), "export const tool = {};\n");

    expect(
      snapshotWebMcpArtifact({
        webMcpSourceRoot: source,
        iterationRoot: iteration,
      }),
    ).toEqual({ path: "artifact" });

    const artifact = join(iteration, "artifact");
    expect(readdirSync(artifact).sort()).toEqual(["contract.ts", "tools"]);
    expect(readFileSync(join(artifact, "contract.ts"), "utf8")).toContain(
      "contract",
    );
    expect(readFileSync(join(artifact, "tools/example.ts"), "utf8")).toContain(
      "tool",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
