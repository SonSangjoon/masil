import type {
  MasilInvocationSource,
  MasilToolInputMap,
  MasilToolName,
  MasilWebMcpToolResult,
  WebMcpInvocationRecord,
} from "@/features/webmcp/types";

/**
 * The only boundary between MASIL's provider and its visible React experience.
 * Both person gestures and Agent calls enter the same semantic execute path.
 */
export interface MasilWebMcpAdapter {
  getRevision: () => number;
  execute: <TName extends MasilToolName>(
    name: TName,
    input: MasilToolInputMap[TName],
    source: MasilInvocationSource,
  ) => Promise<MasilWebMcpToolResult>;
  onInvocation: (record: WebMcpInvocationRecord) => void;
}
