import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type WebMcpArtifact = {
  path: "artifact";
};

/**
 * Preserve only the WebMCP candidate code evaluated in one iteration.
 * The fixed eval set, application UI, and generated inventories stay outside.
 */
export function snapshotWebMcpArtifact(options: {
  webMcpSourceRoot: string;
  iterationRoot: string;
}): WebMcpArtifact {
  const artifactRoot = join(options.iterationRoot, "artifact");
  if (existsSync(artifactRoot)) {
    throw new Error("WEBMCP_ARTIFACT_ALREADY_EXISTS");
  }
  mkdirSync(artifactRoot, { recursive: true });
  for (const entry of readdirSync(options.webMcpSourceRoot)) {
    cpSync(
      join(options.webMcpSourceRoot, entry),
      join(artifactRoot, entry),
      { recursive: true },
    );
  }
  return { path: "artifact" };
}
