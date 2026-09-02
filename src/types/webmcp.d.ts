type WebMcpContent = {
  type: "text";
  text: string;
};

type WebMcpToolResult = {
  content: WebMcpContent[];
  structuredContent?: Record<string, unknown>;
};

type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  execute: (
    input: Record<string, unknown>,
  ) => WebMcpToolResult | Promise<WebMcpToolResult>;
};

interface Document {
  modelContext?: {
    registerTool: (tool: WebMcpTool) => void | Promise<void>;
    unregisterTool?: (name: string) => void | Promise<void>;
  };
}
