import { MASIL_TOOL_DESCRIPTORS } from "@/features/webmcp/contract";
import type { MasilWebMcpAdapter } from "@/features/webmcp/adapter";
import type {
  BrowserWebMcpTool,
  MasilInvocationSource,
  MasilToolDescriptor,
  MasilToolExecutor,
  MasilToolInputMap,
  MasilToolName,
  WebMcpInvocationRecord,
} from "@/features/webmcp/types";

type BrowserModelContext = NonNullable<Document["modelContext"]>;

let invocationSequence = 0;

function nowMilliseconds() {
  return globalThis.performance?.now() ?? Date.now();
}

function makeInvocationId() {
  invocationSequence += 1;
  return `webmcp-${Date.now()}-${invocationSequence}`;
}

export function errorCodeFrom(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = message.split(":", 1)[0]?.trim();
  return code || "UNKNOWN_PROVIDER_ERROR";
}

export function createInstrumentedMasilExecutor(
  adapter: MasilWebMcpAdapter,
): MasilToolExecutor {
  return async <TName extends MasilToolName>(
    name: TName,
    input: MasilToolInputMap[TName],
    source: MasilInvocationSource = "person",
  ) => {
    const startedAt = new Date();
    const startedMonotonic = nowMilliseconds();
    const record: WebMcpInvocationRecord = {
      id: makeInvocationId(),
      tool: name,
      source,
      status: "running",
      startedAt: startedAt.toISOString(),
      completedAt: null,
      durationMs: null,
      revisionBefore: adapter.getRevision(),
      revisionAfter: null,
      errorCode: null,
    };

    adapter.onInvocation(record);

    try {
      const result = await adapter.execute(name, input, source);
      const completedAt = new Date();
      adapter.onInvocation({
        ...record,
        status: "succeeded",
        completedAt: completedAt.toISOString(),
        durationMs: Math.max(0, nowMilliseconds() - startedMonotonic),
        revisionAfter: adapter.getRevision(),
      });
      return result;
    } catch (error) {
      const completedAt = new Date();
      adapter.onInvocation({
        ...record,
        status: "failed",
        completedAt: completedAt.toISOString(),
        durationMs: Math.max(0, nowMilliseconds() - startedMonotonic),
        revisionAfter: adapter.getRevision(),
        errorCode: errorCodeFrom(error),
      });
      throw error;
    }
  };
}

export async function registerMasilWebMcpProvider(options: {
  modelContext: BrowserModelContext;
  execute: MasilToolExecutor;
  descriptors?: readonly MasilToolDescriptor[];
  isActive?: () => boolean;
}) {
  const {
    modelContext,
    execute,
    descriptors = MASIL_TOOL_DESCRIPTORS,
    isActive = () => true,
  } = options;
  const registered: MasilToolName[] = [];

  try {
    for (const descriptor of descriptors) {
      if (!isActive()) break;
      if (modelContext.unregisterTool) {
        try {
          await Promise.resolve(modelContext.unregisterTool(descriptor.name));
        } catch {
          // A new page or host has nothing to unregister.
        }
      }

      const webMcpTool: BrowserWebMcpTool = {
        ...descriptor,
        execute: (input) =>
          execute(
            descriptor.name,
            input as MasilToolInputMap[typeof descriptor.name],
            "webmcp",
          ),
      };
      await Promise.resolve(modelContext.registerTool(webMcpTool));
      registered.push(descriptor.name);
    }
  } catch (error) {
    await unregisterMasilWebMcpTools(modelContext, registered);
    throw error;
  }

  return () => unregisterMasilWebMcpTools(modelContext, registered);
}

async function unregisterMasilWebMcpTools(
  modelContext: BrowserModelContext,
  names: readonly MasilToolName[],
) {
  if (!modelContext.unregisterTool) return;
  await Promise.allSettled(
    names.map((name) => Promise.resolve(modelContext.unregisterTool?.(name))),
  );
}
