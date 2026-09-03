import type { Page } from "@playwright/test";

export type EvalToolDescriptor = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
};

type EvalHost = {
  list: () => EvalToolDescriptor[];
  history: () => Array<Record<string, unknown>>;
  execute: (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
};

type EvalWindow = typeof window & {
  __MASIL_WEBMCP_EVAL_HOST__?: EvalHost;
  __MASIL_PENDING_EVAL_TOOL__?: Promise<Record<string, unknown>>;
  __MASIL_PENDING_EVAL_TOOL_SETTLED__?: boolean;
};

const EVAL_HOST_INIT_SCRIPT = `
(() => {
  const tools = new Map();
  const history = [];
  let sequence = 0;
  const host = {
    list: () => [...tools.values()].map(({ name, description, inputSchema, annotations }) => ({
      name, description, inputSchema, annotations,
    })),
    history: () => history.slice(),
    execute: async (name, input) => {
      const tool = tools.get(name);
      if (!tool) throw new Error("EVAL_TOOL_NOT_REGISTERED:" + name);
      const startedAt = new Date().toISOString();
      const started = performance.now();
      sequence += 1;
      try {
        const result = await tool.execute(input);
        history.push({
          sequence,
          tool: name,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Math.max(0, performance.now() - started),
          success: true,
          errorCode: null,
          structuredContent: result && result.structuredContent ? result.structuredContent : null,
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        history.push({
          sequence,
          tool: name,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Math.max(0, performance.now() - started),
          success: false,
          errorCode: message.split(":", 1)[0] || "UNKNOWN_ERROR",
          structuredContent: null,
        });
        throw error;
      }
    },
  };
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: {
      registerTool: (tool) => tools.set(tool.name, tool),
      unregisterTool: (name) => tools.delete(name),
    },
  });
  Object.defineProperty(window, "__MASIL_WEBMCP_EVAL_HOST__", {
    configurable: true,
    value: host,
  });
})();
`;

export async function installEvalHost(page: Page) {
  await page.addInitScript({ content: EVAL_HOST_INIT_SCRIPT });
}

export async function waitForEvalTools(page: Page, minimum = 1) {
  await page.waitForFunction(
    (expected) =>
      ((window as EvalWindow).__MASIL_WEBMCP_EVAL_HOST__?.list().length ?? 0) >=
      expected,
    minimum,
  );
}

export async function listEvalTools(page: Page) {
  return page.evaluate(() => {
    const host = (window as EvalWindow).__MASIL_WEBMCP_EVAL_HOST__;
    if (!host) throw new Error("EVAL_HOST_NOT_INSTALLED");
    return host.list();
  });
}

export async function getEvalHostHistory(page: Page) {
  return page.evaluate(() => {
    const host = (window as EvalWindow).__MASIL_WEBMCP_EVAL_HOST__;
    if (!host) throw new Error("EVAL_HOST_NOT_INSTALLED");
    return host.history();
  });
}

export async function executeEvalTool(
  page: Page,
  name: string,
  input: Record<string, unknown>,
) {
  return page.evaluate(
    async ({ toolName, toolInput }) => {
      const host = (window as EvalWindow).__MASIL_WEBMCP_EVAL_HOST__;
      if (!host) throw new Error("EVAL_HOST_NOT_INSTALLED");
      return host.execute(toolName, toolInput);
    },
    { toolName: name, toolInput: input },
  );
}

export async function startPendingEvalTool(
  page: Page,
  name: string,
  input: Record<string, unknown>,
) {
  await page.evaluate(
    ({ toolName, toolInput }) => {
      const target = window as EvalWindow;
      const host = target.__MASIL_WEBMCP_EVAL_HOST__;
      if (!host) throw new Error("EVAL_HOST_NOT_INSTALLED");
      if (target.__MASIL_PENDING_EVAL_TOOL__) {
        throw new Error("EVAL_PENDING_TOOL_ALREADY_EXISTS");
      }
      target.__MASIL_PENDING_EVAL_TOOL_SETTLED__ = false;
      target.__MASIL_PENDING_EVAL_TOOL__ = host
        .execute(toolName, toolInput)
        .finally(() => {
          target.__MASIL_PENDING_EVAL_TOOL_SETTLED__ = true;
        });
    },
    { toolName: name, toolInput: input },
  );
}

export async function awaitPendingEvalTool(page: Page) {
  return page.evaluate(async () => {
    const target = window as EvalWindow;
    const pending = target.__MASIL_PENDING_EVAL_TOOL__;
    if (!pending) throw new Error("EVAL_PENDING_TOOL_NOT_FOUND");
    try {
      return await pending;
    } finally {
      delete target.__MASIL_PENDING_EVAL_TOOL__;
      delete target.__MASIL_PENDING_EVAL_TOOL_SETTLED__;
    }
  });
}

export async function getPendingEvalToolState(page: Page) {
  return page.evaluate(() => {
    const target = window as EvalWindow;
    return {
      exists: Boolean(target.__MASIL_PENDING_EVAL_TOOL__),
      settled: target.__MASIL_PENDING_EVAL_TOOL_SETTLED__ === true,
    };
  });
}

export type EvalReferenceVariant = "valid" | "opaque" | "wrong-ratio";

export async function createReferenceDataUrl(
  page: Page,
  text: string,
  variant: EvalReferenceVariant = "valid",
) {
  return page.evaluate(({ referenceText, referenceVariant }) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1536;
    canvas.height = referenceVariant === "wrong-ratio" ? 900 : 1024;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("EVAL_FIXTURE_CANVAS_UNAVAILABLE");
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (referenceVariant === "opaque") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.fillStyle = "#111111";
    context.textAlign = "center";
    context.textBaseline = "middle";
    const characterCount = Math.max(
      1,
      Array.from(referenceText.replace(/\s/gu, "")).length,
    );
    const fontSize = 720;
    context.font =
      `600 ${fontSize}px "Noto Serif CJK KR", "Noto Serif CJK SC", "Songti SC", "AppleMyungjo", serif`;
    const targetWidthRatio = [0, 0.4, 0.58, 0.72, 0.8][
      Math.min(4, characterCount)
    ];
    const measuredWidth = Math.max(1, context.measureText(referenceText).width);
    const horizontalScale = (canvas.width * targetWidthRatio) / measuredWidth;
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2 + 26);
    context.scale(horizontalScale, 1);
    context.fillText(referenceText, 0, 0);
    context.restore();
    return canvas.toDataURL("image/png");
  }, { referenceText: text, referenceVariant: variant });
}
