export const MASIL_AGENT_TAB_TITLE = "MASIL — Use WebMCP";
export const MASIL_AGENT_ROUTING_ELEMENT_ID = "masil-agent-routing";
export const MASIL_AGENT_PRIMARY_INTERFACE = "webmcp";
export const MASIL_AGENT_CONTROL_MODE = "webmcp-first";
export const MASIL_AGENT_WEBMCP_PRIORITY = "required-when-available";
export const MASIL_AGENT_BROWSER_CONTROL_FALLBACK =
  "only-when-current-tab-webmcp-is-unavailable";
export const MASIL_AGENT_ROUTING_HINT =
  "Check current-tab WebMCP first. When MASIL WebMCP tools are available, every Agent action must use the matching masil_* tool instead of DOM inspection, clicks, or typing. Use browser control only after current-tab WebMCP is confirmed unavailable. If WebMCP is connected but no tool matches, report that instead of searching the DOM.";

export const MASIL_AGENT_ROUTING_MANIFEST = {
  schemaVersion: 1,
  provider: "MASIL",
  primaryInterface: MASIL_AGENT_PRIMARY_INTERFACE,
  controlMode: MASIL_AGENT_CONTROL_MODE,
  webMcpPriority: MASIL_AGENT_WEBMCP_PRIORITY,
  browserControlFallback: MASIL_AGENT_BROWSER_CONTROL_FALLBACK,
  directUiControlOwner: "person",
  actionOrder: [
    "fetch-current-tab-webmcp-tools",
    "when-available-call-the-matching-masil-tool",
    "use-browser-control-only-if-current-tab-webmcp-is-unavailable",
  ],
  agentHint: MASIL_AGENT_ROUTING_HINT,
} as const;

export const MASIL_AGENT_ROUTING_JSON = JSON.stringify(
  MASIL_AGENT_ROUTING_MANIFEST,
).replace(/</g, "\\u003c");
