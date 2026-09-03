export type MasilLanguage = "ko" | "en";
export type MasilActivity = "calligraphy" | "janggi";
export type MasilStage = "home" | "activity" | "private" | "review" | "handoff";
export type MasilPresence =
  | "ready"
  | "listening"
  | "receiving"
  | "creating"
  | "speaking"
  | "awaiting"
  | "connected";
export type WebMcpProviderStatus = "checking" | "connected" | "demo" | "error";
export type MasilInvocationSource = "webmcp" | "person";
export type MasilInspectorTab = "history" | "tools";
export type MasilCalligraphyInputMode =
  | "idle"
  | "requesting"
  | "hand"
  | "fallback";

export type MasilToolName =
  | "masil_get_capabilities"
  | "masil_get_session_state"
  | "masil_get_execution_log"
  | "masil_set_language"
  | "masil_set_webmcp_panel"
  | "masil_project_agent_presence"
  | "masil_go_home"
  | "masil_open_activity"
  | "masil_set_calligraphy_reference"
  | "masil_start_calligraphy_camera"
  | "masil_stop_calligraphy_camera"
  | "masil_clear_calligraphy"
  | "masil_get_janggi_state"
  | "masil_wait_for_person_janggi_move"
  | "masil_move_janggi_piece"
  | "masil_open_support_note"
  | "masil_prepare_support_review"
  | "masil_create_local_handoff"
  | "masil_get_handoff_status"
  | "masil_return_to_activity";

export type EmptyToolInput = Record<string, never>;

export type CalligraphySuggestion = {
  character: string;
  label: string;
  reading?: string;
  meaning?: string;
};

export interface MasilToolInputMap {
  masil_get_capabilities: EmptyToolInput;
  masil_get_session_state: EmptyToolInput;
  masil_get_execution_log: EmptyToolInput;
  masil_set_language: { language: MasilLanguage };
  masil_set_webmcp_panel: {
    open: boolean;
    tab?: MasilInspectorTab;
  };
  masil_project_agent_presence: {
    phase: MasilPresence;
    caption?: string;
  };
  masil_go_home: { personConfirmed: boolean };
  masil_open_activity: {
    activity: MasilActivity;
    caption?: string;
    question?: string;
    suggestions?: CalligraphySuggestion[];
  };
  masil_set_calligraphy_reference: {
    character: string;
    reading?: string;
    meaning?: string;
    caption?: string;
    referenceImageUrl: string;
    referenceImageAlt?: string;
  };
  masil_start_calligraphy_camera: { personExplicitlyAsked: boolean };
  masil_stop_calligraphy_camera: { personExplicitlyAsked: boolean };
  masil_clear_calligraphy: { personConfirmed: boolean };
  masil_get_janggi_state: EmptyToolInput;
  masil_wait_for_person_janggi_move: EmptyToolInput;
  masil_move_janggi_piece: {
    action: "preview" | "move" | "pass" | "reset";
    actor: "person" | "agent";
    pieceId?: string;
    toRow?: number;
    toCol?: number;
    spokenMove?: string;
    personConfirmed: boolean;
  };
  masil_open_support_note: {
    personExplicitlyAsked: boolean;
    summary: string;
    desiredOutcome: string;
  };
  masil_prepare_support_review: { minimumDisclosure: string };
  masil_create_local_handoff: { seenRevision: number };
  masil_get_handoff_status: EmptyToolInput;
  masil_return_to_activity: EmptyToolInput;
}

type StructuredResult = Record<string, unknown>;

export interface MasilToolResultMap {
  masil_get_capabilities: StructuredResult & {
    provider: "MASIL";
    toolCount: number;
    validNextActions: MasilToolName[];
  };
  masil_get_session_state: StructuredResult & {
    stage: MasilStage;
    activity: MasilActivity | null;
    revision: number;
    validNextActions: MasilToolName[];
  };
  masil_get_execution_log: StructuredResult & {
    invocations: WebMcpInvocationRecord[];
    newestFirst: true;
  };
  masil_set_language: StructuredResult & { language: MasilLanguage };
  masil_set_webmcp_panel: StructuredResult & {
    open: boolean;
    tab: MasilInspectorTab;
  };
  masil_project_agent_presence: StructuredResult & {
    revision: number;
    phase: MasilPresence;
  };
  masil_go_home: StructuredResult & { stage: "home"; activity: null };
  masil_open_activity: StructuredResult & {
    stage: MasilStage;
    activity: MasilActivity;
    revision: number;
  };
  masil_set_calligraphy_reference: StructuredResult & {
    revision: number;
    calligraphy: StructuredResult & {
      character: string;
      referenceImagePresent: boolean;
    };
    assetValidation: StructuredResult & { trueAlpha: true };
  };
  masil_start_calligraphy_camera: StructuredResult & { revision: number };
  masil_stop_calligraphy_camera: StructuredResult & { revision: number };
  masil_clear_calligraphy: StructuredResult & { revision: number };
  masil_get_janggi_state: StructuredResult & { revision: number };
  masil_wait_for_person_janggi_move: StructuredResult;
  masil_move_janggi_piece: StructuredResult & {
    revision: number;
    action: "preview" | "move" | "pass" | "reset";
    actor: "person" | "agent";
  };
  masil_open_support_note: StructuredResult & {
    stage: "private";
    revision: number;
  };
  masil_prepare_support_review: StructuredResult & {
    stage: "review";
    revision: number;
  };
  masil_create_local_handoff: StructuredResult & {
    stage: "handoff";
    revision: number;
  };
  masil_get_handoff_status: StructuredResult & { revision: number };
  masil_return_to_activity: StructuredResult & {
    stage: "activity";
    activity: MasilActivity;
    revision: number;
  };
}

export type MasilWebMcpContent = {
  type: "text";
  text: string;
};

export type MasilWebMcpToolResult<
  TStructured extends StructuredResult = StructuredResult,
> = {
  content: MasilWebMcpContent[];
  structuredContent?: TStructured;
};

export type MasilToolDescriptor = {
  name: MasilToolName;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
};

export type BrowserWebMcpTool = MasilToolDescriptor & {
  execute: (
    input: Record<string, unknown>,
  ) => MasilWebMcpToolResult | Promise<MasilWebMcpToolResult>;
};

export type WebMcpInvocationRecord = {
  id: string;
  tool: MasilToolName;
  source: MasilInvocationSource;
  status: "running" | "succeeded" | "failed";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  revisionBefore: number;
  revisionAfter: number | null;
  errorCode: string | null;
};

export type MasilToolExecutor = <TName extends MasilToolName>(
  name: TName,
  input: MasilToolInputMap[TName],
  source?: MasilInvocationSource,
) => Promise<MasilWebMcpToolResult>;
