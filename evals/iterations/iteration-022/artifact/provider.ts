import { MASIL_TOOL_DESCRIPTORS } from "@/features/webmcp/contract";
import type { MasilWebMcpAdapter } from "@/features/webmcp/adapter";
import type {
  BrowserWebMcpTool,
  MasilInvocationSource,
  MasilToolDescriptor,
  MasilToolExecutor,
  MasilToolInputMap,
  MasilToolName,
  MasilWebMcpToolResult,
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

function compactJanggiPieces(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const piece = entry as Record<string, unknown>;
    return {
      id: piece.id,
      row: piece.row,
      col: piece.col,
      legalMoves: piece.legalMoves,
    };
  });
}

/** Keep the complete position while removing labels derivable from stable piece ids. */
export function projectMasilWebMcpResult(
  name: MasilToolName,
  result: MasilWebMcpToolResult,
  context?: { recoveredFrom?: string },
): MasilWebMcpToolResult {
  const structured = result.structuredContent;
  if (!structured || typeof structured !== "object") return result;
  if (name === "masil_get_janggi_state") {
    return {
      ...result,
      structuredContent: {
        ...structured,
        pieces: compactJanggiPieces(structured.pieces),
      },
    };
  }
  if (name === "masil_set_calligraphy_reference") {
    return {
      ...result,
      structuredContent: {
        ...structured,
        visibleOutcome: "reference-ready",
        calligraphyInputMode: "idle",
        nextInputDecisionOwner: "person",
        drawingInputReady: false,
        ...(context?.recoveredFrom
          ? {
              recoveryCompleted: true,
              recoveredFrom: context.recoveredFrom,
              personFacingNextStep:
                "Tell the person that the requested calligraphy.character reference is now visible and ready to use. Mention calligraphy.meaning only when it is non-empty, then ask what they would like to do next. Do not mention the prior defect, validation, alpha or transparency, file format, or alt text.",
            }
          : {}),
      },
    };
  }
  if (name === "masil_start_calligraphy_camera") {
    return {
      ...result,
      structuredContent: {
        ...structured,
        permissionDecisionState: "awaiting-person-browser-decision",
        directDrawingFallbackActive: false,
        personFacingGuidance:
          "The browser is waiting for the person's camera-permission choice. Tell the person that allowing it starts the requested air-writing experience and declining it keeps camera control with them and permits direct drawing. Do not claim the camera is unavailable, permission was denied, or direct drawing is active unless a later visible state proves that outcome.",
      },
    };
  }
  if (
    name === "masil_move_janggi_piece" ||
    name === "masil_wait_for_person_janggi_move"
  ) {
    const game = structured.game;
    if (!game || typeof game !== "object") return result;
    const action = structured.action;
    const personFacingGuidance =
      action === "preview"
        ? "Describe this as one visibly highlighted legal destination, ask which legal destination the person chooses, then end the turn. Do not wait for future speech with the board-gesture wait tool."
        : action === "move"
          ? "In natural language, say the requested move was verified as legal and visibly completed, then say whose turn is next from nextTurnOwner. Keep actors unambiguous: when actor is agent, use first person for the Agent's move and name move.side as the Agent's side; describe any preceding person move separately as the person's move and never attribute the Agent move to that person. Do not join two actors under one subject. Use the person's relative wording when possible; avoid tool narration and raw coordinates unless the person used them."
          : undefined;
    return {
      ...result,
      structuredContent: {
        ...structured,
        ...(personFacingGuidance ? { personFacingGuidance } : {}),
        game: {
          ...(game as Record<string, unknown>),
          pieces: compactJanggiPieces(
            (game as Record<string, unknown>).pieces,
          ),
        },
      },
    };
  }
  return result;
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
  let pendingCalligraphyRecovery: string | undefined;

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
        execute: async (input) => {
          try {
            const result = await execute(
              descriptor.name,
              input as MasilToolInputMap[typeof descriptor.name],
              "webmcp",
            );
            const recovery =
              descriptor.name === "masil_set_calligraphy_reference"
                ? pendingCalligraphyRecovery
                : undefined;
            if (descriptor.name === "masil_set_calligraphy_reference") {
              pendingCalligraphyRecovery = undefined;
            }
            return projectMasilWebMcpResult(descriptor.name, result, {
              recoveredFrom: recovery,
            });
          } catch (error) {
            const errorCode = errorCodeFrom(error);
            if (
              descriptor.name === "masil_set_calligraphy_reference" &&
              errorCode.startsWith("REFERENCE_IMAGE_")
            ) {
              pendingCalligraphyRecovery = errorCode;
            }
            throw error;
          }
        },
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
