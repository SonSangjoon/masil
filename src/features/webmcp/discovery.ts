import {
  MASIL_TOOL_NAMES,
  MASIL_WEBMCP_CONTRACT_VERSION,
} from "@/features/webmcp/contract";

export const MASIL_WEBMCP_DISCOVERY_ELEMENT_ID =
  "masil-webmcp-agent-discovery";
export const MASIL_WEBMCP_TRANSPORT = "document.modelContext";
export const MASIL_WEBMCP_TOOL_SCOPE = "current-browser-tab";
export const MASIL_WEBMCP_DISCOVERY_CHANNEL = "webmcp-capability-fetchTools";
export const MASIL_WEBMCP_AGENT_HINT =
  "MASIL actions are page-defined, tab-scoped WebMCP tools. Browser agents should discover them from the current tab's WebMCP capability with fetchTools(); the global task tool list alone is not an authoritative availability check.";

export const MASIL_WEBMCP_DISCOVERY_MANIFEST = {
  schemaVersion: 1,
  provider: "MASIL",
  contractVersion: MASIL_WEBMCP_CONTRACT_VERSION,
  transport: MASIL_WEBMCP_TRANSPORT,
  registrationApi: "document.modelContext.registerTool",
  toolScope: MASIL_WEBMCP_TOOL_SCOPE,
  discovery: {
    capability: "webmcp",
    operation: "fetchTools",
    channel: MASIL_WEBMCP_DISCOVERY_CHANNEL,
  },
  toolPrefix: "masil_",
  toolCount: MASIL_TOOL_NAMES.length,
  tools: MASIL_TOOL_NAMES,
  agentHint: MASIL_WEBMCP_AGENT_HINT,
  safety:
    "Discovery metadata does not grant permission. Tool calls still require the person's request and the tool contract's confirmation boundaries.",
} as const;

export const MASIL_WEBMCP_DISCOVERY_JSON = JSON.stringify(
  MASIL_WEBMCP_DISCOVERY_MANIFEST,
).replace(/</g, "\\u003c");
