import type { BrowserWebMcpTool } from "@/features/webmcp/types";

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: BrowserWebMcpTool,
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
      /** Legacy host compatibility; current WebMCP unregisters with AbortSignal. */
      unregisterTool?: (name: string) => void | Promise<void>;
    };
  }
}

export {};
