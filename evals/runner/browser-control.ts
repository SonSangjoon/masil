import type { Page } from "@playwright/test";
import type { Tool } from "openai/resources/responses/responses";

export type BrowserControlToolName =
  | "browser_read_page"
  | "browser_click"
  | "browser_type"
  | "browser_wait";

export type BrowserSnapshot = {
  url: string;
  title: string;
  language: string;
  visibleText: string;
  elements: Array<{
    ref: string;
    role: string;
    name: string;
    disabled: boolean;
    selected: boolean | null;
    pressed: boolean | null;
  }>;
};

export const BROWSER_CONTROL_TOOLS: Tool[] = [
  {
    type: "function",
    name: "browser_read_page",
    description:
      "Read the currently visible human-facing web page through its text and accessibility semantics. This is generic browser observation, not an application API. Call it before choosing what to click and again after the page changes.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function",
    name: "browser_click",
    description:
      "Click one visible element from the latest browser_read_page result by its temporary ref. This behaves like using the human interface and reveals no hidden application state.",
    parameters: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "Temporary element ref returned by browser_read_page.",
        },
      },
      required: ["ref"],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function",
    name: "browser_type",
    description:
      "Replace the value of a visible text input or textarea from the latest browser_read_page result. This is generic human-interface input, not an application API.",
    parameters: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "Temporary element ref returned by browser_read_page.",
        },
        text: {
          type: "string",
          description: "Text to enter.",
        },
      },
      required: ["ref", "text"],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function",
    name: "browser_wait",
    description:
      "Wait briefly for a visible animation or page update, then read the page again.",
    parameters: {
      type: "object",
      properties: {
        milliseconds: {
          type: "integer",
          minimum: 100,
          maximum: 3000,
          description: "How long to wait, from 100 to 3000 milliseconds.",
        },
      },
      required: ["milliseconds"],
      additionalProperties: false,
    },
    strict: false,
  },
];

const browserControlNames = new Set<BrowserControlToolName>([
  "browser_read_page",
  "browser_click",
  "browser_type",
  "browser_wait",
]);

export function isBrowserControlTool(
  name: string,
): name is BrowserControlToolName {
  return browserControlNames.has(name as BrowserControlToolName);
}

export async function readBrowserSnapshot(
  page: Page,
): Promise<BrowserSnapshot> {
  // tsx names nested callbacks with this helper; Playwright serializes the
  // callback without the module prelude, so provide the harmless helper in the
  // isolated evaluation page before collecting accessibility-facing output.
  await page.evaluate(
    "globalThis.__name ??= (target) => target",
  );
  return page.evaluate(() => {
    const referenceAttribute = "data-eval-browser-ref";
    document
      .querySelectorAll(`[${referenceAttribute}]`)
      .forEach((element) => element.removeAttribute(referenceAttribute));

    const isVisible = (element: HTMLElement) => {
      const style = window.getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) > 0 &&
        bounds.width > 0 &&
        bounds.height > 0 &&
        !element.closest("[hidden], [aria-hidden='true'], [inert]")
      );
    };
    const inferredRole = (element: HTMLElement) => {
      const explicit = element.getAttribute("role");
      if (explicit) return explicit;
      if (element instanceof HTMLButtonElement) return "button";
      if (element instanceof HTMLAnchorElement) return "link";
      if (element instanceof HTMLTextAreaElement) return "textbox";
      if (element instanceof HTMLSelectElement) return "combobox";
      if (element instanceof HTMLInputElement) {
        if (element.type === "checkbox") return "checkbox";
        if (element.type === "radio") return "radio";
        return "textbox";
      }
      return element.tagName.toLowerCase();
    };
    const accessibleName = (element: HTMLElement) => {
      const labelledBy = element.getAttribute("aria-labelledby");
      const labelledText = labelledBy
        ?.split(/\s+/u)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
      return (
        element.getAttribute("aria-label") ||
        labelledText ||
        element.getAttribute("alt") ||
        element.getAttribute("title") ||
        element.textContent?.replace(/\s+/gu, " ").trim() ||
        "unnamed"
      ).slice(0, 180);
    };

    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        "button, a[href], input, textarea, select, [role='button'], [role='tab'], [role='link'], [role='checkbox'], [role='radio']",
      ),
    ).filter(isVisible);

    const elements = candidates.slice(0, 80).map((element, index) => {
      const ref = `e${index + 1}`;
      element.setAttribute(referenceAttribute, ref);
      const selected = element.getAttribute("aria-selected");
      const pressed = element.getAttribute("aria-pressed");
      return {
        ref,
        role: inferredRole(element),
        name: accessibleName(element),
        disabled:
          element.getAttribute("aria-disabled") === "true" ||
          ("disabled" in element && Boolean(element.disabled)),
        selected: selected === null ? null : selected === "true",
        pressed: pressed === null ? null : pressed === "true",
      };
    });

    return {
      url: window.location.href,
      title: document.title,
      language: document.documentElement.lang || "unknown",
      visibleText: document.body.innerText.replace(/\s+/gu, " ").trim().slice(0, 1800),
      elements,
    };
  });
}

export async function executeBrowserControl(
  page: Page,
  name: BrowserControlToolName,
  input: Record<string, unknown>,
) {
  if (name === "browser_read_page") {
    return { structuredContent: await readBrowserSnapshot(page) };
  }

  if (name === "browser_wait") {
    const requested = Number(input.milliseconds);
    if (!Number.isFinite(requested)) {
      throw new Error("BROWSER_WAIT_INVALID");
    }
    await page.waitForTimeout(Math.min(3000, Math.max(100, requested)));
    return { structuredContent: await readBrowserSnapshot(page) };
  }

  const ref = typeof input.ref === "string" ? input.ref : "";
  if (!/^e\d+$/u.test(ref)) throw new Error("BROWSER_REF_INVALID");
  const locator = page.locator(`[data-eval-browser-ref="${ref}"]`);
  if ((await locator.count()) !== 1) throw new Error("BROWSER_REF_STALE");
  const target = await locator.evaluate((element) => ({
    targetName:
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.textContent?.replace(/\s+/gu, " ").trim().slice(0, 180) ||
      "unnamed",
    targetRole:
      element.getAttribute("role") ||
      (element instanceof HTMLButtonElement
        ? "button"
        : element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement
          ? "textbox"
          : element.tagName.toLowerCase()),
  }));

  if (name === "browser_click") {
    await locator.click({ timeout: 5000 });
  } else {
    if (typeof input.text !== "string") throw new Error("BROWSER_TEXT_REQUIRED");
    await locator.fill(input.text, { timeout: 5000 });
  }
  await page.waitForTimeout(300);
  return {
    structuredContent: {
      ...(await readBrowserSnapshot(page)),
      interaction: {
        type: name === "browser_click" ? "click" : "type",
        ...target,
      },
    },
  };
}
