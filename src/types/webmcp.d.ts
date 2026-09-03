import type { BrowserWebMcpTool } from "@/features/webmcp/types";

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: BrowserWebMcpTool) => void | Promise<void>;
      unregisterTool?: (name: string) => void | Promise<void>;
    };
  }
}

export {};
