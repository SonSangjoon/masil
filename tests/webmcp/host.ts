import type { Page } from "@playwright/test";

import type {
  MasilToolDescriptor,
  MasilWebMcpToolResult,
} from "../../src/features/webmcp/types";

export type BrowserTestHost = {
  list: () => MasilToolDescriptor[];
  execute: (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<MasilWebMcpToolResult>;
};

export async function installWebMcpTestHost(page: Page) {
  await page.addInitScript(() => {
    const tools = new Map<
      string,
      {
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
        annotations?: Record<string, boolean>;
        execute: (
          input: Record<string, unknown>,
        ) => unknown | Promise<unknown>;
      }
    >();

    const host = {
      list: () =>
        [...tools.values()].map(
          ({ name, description, inputSchema, annotations }) => ({
            name,
            description,
            inputSchema,
            annotations,
          }),
        ),
      execute: async (name: string, input: Record<string, unknown>) => {
        const tool = tools.get(name);
        if (!tool) throw new Error(`TEST_HOST_TOOL_NOT_REGISTERED:${name}`);
        return tool.execute(input);
      },
    };

    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool: (tool: (typeof tools extends Map<string, infer T> ? T : never)) => {
          tools.set(tool.name, tool);
        },
        unregisterTool: (name: string) => {
          tools.delete(name);
        },
      },
    });
    Object.defineProperty(window, "__MASIL_WEBMCP_TEST_HOST__", {
      configurable: true,
      value: host,
    });
  });
}

export async function waitForRegisteredTools(page: Page, count = 20) {
  await page.waitForFunction(
    (expected) => {
      const host = (
        window as typeof window & { __MASIL_WEBMCP_TEST_HOST__?: BrowserTestHost }
      ).__MASIL_WEBMCP_TEST_HOST__;
      return host?.list().length === expected;
    },
    count,
  );
}

export async function executeBrowserTool(
  page: Page,
  name: string,
  input: Record<string, unknown> = {},
) {
  return page.evaluate(
    async ({ toolName, toolInput }) => {
      const host = (
        window as typeof window & { __MASIL_WEBMCP_TEST_HOST__?: BrowserTestHost }
      ).__MASIL_WEBMCP_TEST_HOST__;
      if (!host) throw new Error("TEST_HOST_NOT_INSTALLED");
      return host.execute(toolName, toolInput);
    },
    { toolName: name, toolInput: input },
  );
}

export async function registeredBrowserTools(page: Page) {
  return page.evaluate(() => {
    const host = (
      window as typeof window & { __MASIL_WEBMCP_TEST_HOST__?: BrowserTestHost }
    ).__MASIL_WEBMCP_TEST_HOST__;
    if (!host) throw new Error("TEST_HOST_NOT_INSTALLED");
    return host.list();
  });
}

export async function createReferenceDataUrl(
  page: Page,
  variant:
    | "valid"
    | "opaque"
    | "wrong-ratio"
    | "too-small"
    | "light-ink"
    | "unsafe-margin"
    | "small-ink",
) {
  return page.evaluate((fixtureVariant) => {
    const dimensions =
      fixtureVariant === "too-small"
        ? { width: 900, height: 600 }
        : fixtureVariant === "wrong-ratio"
          ? { width: 1536, height: 900 }
          : { width: 1536, height: 1024 };
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("FIXTURE_CANVAS_UNAVAILABLE");

    if (fixtureVariant === "opaque") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.fillStyle =
      fixtureVariant === "light-ink" ? "rgb(230, 180, 150)" : "#111111";

    if (fixtureVariant === "small-ink") {
      context.fillRect(
        canvas.width * 0.4,
        canvas.height * 0.3,
        canvas.width * 0.2,
        canvas.height * 0.4,
      );
    } else if (fixtureVariant === "unsafe-margin") {
      context.fillRect(0, canvas.height * 0.2, canvas.width, canvas.height * 0.6);
    } else {
      context.fillRect(
        canvas.width * 0.12,
        canvas.height * 0.18,
        canvas.width * 0.76,
        canvas.height * 0.64,
      );
    }

    return canvas.toDataURL("image/png");
  }, variant);
}
