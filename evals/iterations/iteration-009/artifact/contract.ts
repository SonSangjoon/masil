import type {
  MasilActivity,
  MasilCalligraphyInputMode,
  MasilStage,
  MasilToolDescriptor,
  MasilToolName,
} from "@/features/webmcp/types";

export const MASIL_WEBMCP_CONTRACT_VERSION = "1.8.0";

export const MASIL_TOOL_NAMES = [
  "masil_get_capabilities",
  "masil_get_session_state",
  "masil_get_execution_log",
  "masil_set_language",
  "masil_set_webmcp_panel",
  "masil_project_agent_presence",
  "masil_go_home",
  "masil_open_activity",
  "masil_set_calligraphy_reference",
  "masil_start_calligraphy_camera",
  "masil_stop_calligraphy_camera",
  "masil_clear_calligraphy",
  "masil_get_janggi_state",
  "masil_wait_for_person_janggi_move",
  "masil_move_janggi_piece",
  "masil_open_support_note",
  "masil_prepare_support_review",
  "masil_create_local_handoff",
  "masil_get_handoff_status",
  "masil_return_to_activity",
] as const satisfies readonly MasilToolName[];

export const MASIL_TOOL_LABELS: Record<MasilToolName, string> = {
  masil_get_capabilities: "이 웹이 Agent에게 제공하는 능력 읽기",
  masil_get_session_state: "현재 화면·상태·가능한 다음 행동 읽기",
  masil_get_execution_log: "WebMCP 실행 기록 읽기",
  masil_set_language: "화면 언어 전환",
  masil_set_webmcp_panel: "WebMCP 패널과 탭 열기·닫기",
  masil_project_agent_presence: "Agent의 대화 상태를 Orb와 화면에 투영",
  masil_go_home: "현재 활동을 끝내고 처음 화면으로 이동",
  masil_open_activity: "활동을 열고 사람의 선택 기다리기",
  masil_set_calligraphy_reference: "생성한 서예 글자본을 화면에 배치",
  masil_start_calligraphy_camera: "명시적 요청으로 공중 쓰기 시작",
  masil_stop_calligraphy_camera: "카메라를 끄고 직접 쓰기로 전환",
  masil_clear_calligraphy: "사람의 확인 뒤 붓 자국 지우기",
  masil_get_janggi_state: "현재 장기판과 모든 합법 수 읽기",
  masil_wait_for_person_janggi_move: "어르신이 장기판에서 둘 한 수 기다리기",
  masil_move_janggi_piece: "확인한 장기 수를 규칙에 맞게 실행",
  masil_open_support_note: "명시적 요청 뒤 비공개 도움 메모 열기",
  masil_prepare_support_review: "사람에게 보일 최소 내용과 현재 창구 준비",
  masil_create_local_handoff: "두 번 확인한 로컬 데모 작업 카드 만들기",
  masil_get_handoff_status: "담당자·상태·다음 단계 다시 읽기",
  masil_return_to_activity: "작업 결과를 남기고 원래 활동으로 복귀",
};

export const MASIL_TOOL_LABELS_EN: Record<MasilToolName, string> = {
  masil_get_capabilities: "Read what MASIL offers the Agent",
  masil_get_session_state: "Read the current screen and valid next actions",
  masil_get_execution_log: "Read the WebMCP execution history",
  masil_set_language: "Change the visible language",
  masil_set_webmcp_panel: "Open, close, or switch the WebMCP panel",
  masil_project_agent_presence: "Project the Agent state into the Orb and page",
  masil_go_home: "End the current activity and return home",
  masil_open_activity: "Open an activity and wait for the person",
  masil_set_calligraphy_reference: "Place a generated calligraphy reference",
  masil_start_calligraphy_camera: "Start air writing after an explicit request",
  masil_stop_calligraphy_camera: "Turn the camera off and use direct drawing",
  masil_clear_calligraphy: "Clear brush strokes after person confirmation",
  masil_get_janggi_state: "Read the board and every legal move",
  masil_wait_for_person_janggi_move: "Wait for the person to make one move",
  masil_move_janggi_piece: "Validate and animate a Janggi move",
  masil_open_support_note: "Open a private note after an explicit request",
  masil_prepare_support_review: "Prepare the minimum support details for review",
  masil_create_local_handoff: "Create a confirmed local demo handoff",
  masil_get_handoff_status: "Read the owner, status, and next step",
  masil_return_to_activity: "Return to the preserved creative activity",
};

export const MASIL_SINGLE_AGENT_BOUNDARY = {
  agentCount: 1,
  conversationOwner: "user-agent",
  providerRole: "webmcp-provider-and-visual-projection",
  embeddedAgent: false,
  pageOwnsModel: false,
  pageOwnsStt: false,
  pageOwnsTts: false,
  requiresOpenAiApiKey: false,
} as const;

export const MASIL_HUMAN_ONLY_ACTIONS = [
  "accept-or-deny-the-browser-camera-permission",
  "author-live-calligraphy-strokes-by-hand-or-pointer",
  "confirm-the-exact-support-disclosure",
  "confirm-the-consequential-support-action",
] as const;

export type MasilActionSnapshot = {
  stage: MasilStage;
  activity: MasilActivity | null;
  hasCalligraphyReference: boolean;
  calligraphyInputMode: MasilCalligraphyInputMode;
  janggiTurn: "cho" | "han";
  supportDisclosureConfirmed: boolean;
  supportActionConfirmed: boolean;
};

export function getValidMasilActions(
  snapshot: MasilActionSnapshot,
): MasilToolName[] {
  const actions: MasilToolName[] = [
    "masil_get_capabilities",
    "masil_get_session_state",
    "masil_get_execution_log",
    "masil_set_language",
    "masil_set_webmcp_panel",
    "masil_project_agent_presence",
  ];

  if (snapshot.stage !== "home") actions.push("masil_go_home");
  if (snapshot.stage === "home" || snapshot.stage === "activity") {
    actions.push("masil_open_activity");
  }
  if (snapshot.stage === "activity") {
    actions.push("masil_open_support_note");
    if (snapshot.activity === "calligraphy") {
      actions.push("masil_set_calligraphy_reference");
      if (snapshot.hasCalligraphyReference) {
        actions.push("masil_start_calligraphy_camera", "masil_clear_calligraphy");
      }
      if (
        snapshot.calligraphyInputMode === "requesting" ||
        snapshot.calligraphyInputMode === "hand"
      ) {
        actions.push("masil_stop_calligraphy_camera");
      }
    }
    if (snapshot.activity === "janggi") {
      actions.push("masil_get_janggi_state", "masil_move_janggi_piece");
      if (snapshot.janggiTurn === "cho") {
        actions.push("masil_wait_for_person_janggi_move");
      }
    }
  }
  if (snapshot.stage === "private") {
    actions.push("masil_prepare_support_review", "masil_return_to_activity");
  }
  if (snapshot.stage === "review") {
    if (
      snapshot.supportDisclosureConfirmed &&
      snapshot.supportActionConfirmed
    ) {
      actions.push("masil_create_local_handoff");
    }
    actions.push("masil_return_to_activity");
  }
  if (snapshot.stage === "handoff") {
    actions.push("masil_get_handoff_status", "masil_return_to_activity");
  }

  return actions;
}

const emptyObjectSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

function tool(
  name: MasilToolName,
  description: string,
  inputSchema: Record<string, unknown>,
  readOnly = false,
  untrustedContent = false,
): MasilToolDescriptor {
  return {
    name,
    description,
    inputSchema,
    annotations: {
      readOnlyHint: readOnly,
      untrustedContentHint: untrustedContent,
    },
  };
}

export const MASIL_TOOL_DESCRIPTORS: readonly MasilToolDescriptor[] = [
  tool(
    "masil_get_capabilities",
    "Read MASIL's versioned activities, workflows, valid actions, and person-control boundaries. Use for capability questions or a genuinely unknown workflow—not before a direct request that already matches a named tool. MASIL is a provider and visual projection, never a second Agent.",
    emptyObjectSchema,
    true,
  ),
  tool(
    "masil_get_session_state",
    "Read the exact visible scene, revision, and currently valid next actions when the current scene is ambiguous. A successful action result already confirms its own completed state.",
    emptyObjectSchema,
    true,
  ),
  tool(
    "masil_get_execution_log",
    "Read sanitized, timed semantic invocations and revisions when the person asks for history or a state mismatch needs diagnosis. Successful action results already confirm visible completion.",
    emptyObjectSchema,
    true,
  ),
  tool(
    "masil_set_language",
    "Switch MASIL's visible interface between Korean and English without changing calligraphy text.",
    {
      type: "object",
      properties: { language: { type: "string", enum: ["ko", "en"] } },
      required: ["language"],
      additionalProperties: false,
    },
  ),
  tool(
    "masil_set_webmcp_panel",
    "Open or close the visible WebMCP inspector and select history or tools. Activity state is unchanged.",
    {
      type: "object",
      properties: {
        open: { type: "boolean" },
        tab: { type: "string", enum: ["history", "tools"] },
      },
      required: ["open"],
      additionalProperties: false,
    },
  ),
  tool(
    "masil_project_agent_presence",
    "Project a real phase of the same user Agent into the Orb and a short caption. Never send audio, transcripts, token deltas, private memory, or inferred emotion.",
    {
      type: "object",
      properties: {
        phase: {
          type: "string",
          enum: [
            "ready",
            "listening",
            "receiving",
            "creating",
            "speaking",
            "awaiting",
            "connected",
          ],
        },
        caption: { type: "string", maxLength: 180 },
      },
      required: ["phase"],
      additionalProperties: false,
    },
    false,
    true,
  ),
  tool(
    "masil_go_home",
    "Return home and discard current in-memory activity state. Requires personConfirmed=true for this exact loss.",
    {
      type: "object",
      properties: { personConfirmed: { type: "boolean" } },
      required: ["personConfirmed"],
      additionalProperties: false,
    },
  ),
  tool(
    "masil_open_activity",
    "First call from home: open the requested calligraphy or Janggi space. For calligraphy, include suggestions only when the person asks for ideas or has not named what to write. A later spoken choice is exact authored text: preserve its script and wording (for example 쉼 stays 쉼, not 休) unless the person explicitly asks for translation or Hanja. If they already named text, omit suggestions, then generate and place the resolved exact text with masil_set_calligraphy_reference; a suggestion is not a finished reference. For Janggi, open first and then read the board. Camera and moves are separate actions.",
    {
      type: "object",
      properties: {
        activity: { type: "string", enum: ["calligraphy", "janggi"] },
        caption: { type: "string", maxLength: 180 },
        question: { type: "string", maxLength: 180 },
        suggestions: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              character: {
                type: "string",
                minLength: 1,
                maxLength: 4,
                description:
                  "Candidate text shown exactly as the person may choose it. Do not silently replace Hangul with Hanja or Hanja with Hangul.",
              },
              label: { type: "string", maxLength: 18 },
              reading: { type: "string", maxLength: 40 },
              meaning: { type: "string", maxLength: 80 },
            },
            required: ["character", "label"],
            additionalProperties: false,
          },
        },
      },
      required: ["activity"],
      additionalProperties: false,
    },
  ),
  tool(
    "masil_set_calligraphy_reference",
    "Place the person's resolved exact 1-4 character text. Preserve their latest script and wording: 쉼 stays 쉼. Convert only when explicitly requested: '무병장수를 한자로' is 無病長壽 and '추석 한자로' is 秋夕. Generator text, character, image, caption, and alt must agree. Submit each newly generated image here once; never pre-reject or regenerate it from its URL, filename, or metadata. MASIL is the pixel-validation authority. Only after an actual REFERENCE_IMAGE_* rejection, regenerate with that exact defect and resubmit. Success means the reference is visible, not that drawing input is active: tell the person what is visible and leave the next input choice to them. Start camera only on explicit request; use the stop tool only for an active camera request.",
    {
      type: "object",
      properties: {
        character: {
          type: "string",
          minLength: 1,
          maxLength: 4,
          description:
            "Exact text visible on the reference. Preserve the person's chosen script; translate to Hanja only when explicitly requested.",
        },
        reading: { type: "string" },
        meaning: { type: "string" },
        caption: { type: "string", maxLength: 180 },
        referenceImageUrl: {
          type: "string",
          description:
            "PNG/WebP data URL, same-origin URL, or CORS-readable HTTPS URL meeting the 3:2 real-alpha black-ink contract. JPEG, filesystem/blob paths, opaque backgrounds, and checkerboards fail.",
        },
        referenceImageAlt: { type: "string", maxLength: 240 },
      },
      required: ["character", "referenceImageUrl"],
      additionalProperties: false,
    },
    false,
    true,
  ),
  tool(
    "masil_start_calligraphy_camera",
    "Start camera-first air writing only after this explicit person request. Native browser permission remains human-controlled; denial falls back to direct drawing. Never infer consent.",
    {
      type: "object",
      properties: { personExplicitlyAsked: { type: "boolean" } },
      required: ["personExplicitlyAsked"],
      additionalProperties: false,
    },
  ),
  tool(
    "masil_stop_calligraphy_camera",
    "Honor an explicit no-camera or stop-camera request and enter direct touch/pointer writing while preserving the reference and strokes. Use after placing the reference even when camera never started. Never call without the person's explicit preference.",
    {
      type: "object",
      properties: { personExplicitlyAsked: { type: "boolean" } },
      required: ["personExplicitlyAsked"],
      additionalProperties: false,
    },
  ),
  tool(
    "masil_clear_calligraphy",
    "Clear only human-authored strokes and preserve the already-visible generated reference. Preconditions: the exact reference is visibly placed and the person explicitly asked to clear their strokes. Call once with personConfirmed=true; do not reopen calligraphy, replace the reference, or clear anything else.",
    {
      type: "object",
      properties: { personConfirmed: { type: "boolean" } },
      required: ["personConfirmed"],
      additionalProperties: false,
    },
  ),
  tool(
    "masil_get_janggi_state",
    "Open Janggi first, then read its exact turn, position, coordinates, and legal destinations. Reading is not a visible preview: if the person asks where a piece can go, follow with one masil_move_janggi_piece preview and wait for their choice. Acknowledge a returned Cho lastMove before an explicitly requested Han reply. MASIL is the rules authority.",
    emptyObjectSchema,
    true,
  ),
  tool(
    "masil_wait_for_person_janggi_move",
    "After opening Janggi, wait for one Cho board gesture only when the person said they will move directly. The result is their validated visible move. Reply with exactly one Han move only when explicitly requested, then acknowledge both moves. Never wait for future speech.",
    emptyObjectSchema,
  ),
  tool(
    "masil_move_janggi_piece",
    "After reading state, submit one rules-authoritative action. To show where a piece can go, call preview with one legal destination, actor=person, personConfirmed=false; listing coordinates is not a visible preview. For a requested move, submit the person's exact destination with actor=person and personConfirmed=true, including an apparently illegal request so MASIL can reject it without substitution. Never play Han after a person move unless they explicitly requested an immediate reply; then use actor=agent once and acknowledge their move before naming yours. Move success resolves after visible animation.",
    {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["preview", "move", "pass", "reset"],
          description:
            "preview must be called to show one legal route on the visible board and does not change turn; move commits one exact move; pass/reset are consequential and require the person's explicit request.",
        },
        actor: {
          type: "string",
          enum: ["person", "agent"],
          description:
            "person plays Cho; the calling Agent plays Han.",
        },
        pieceId: {
          type: "string",
          description:
            "Stable piece id returned by masil_get_janggi_state.",
        },
        toRow: { type: "integer", minimum: 0, maximum: 9 },
        toCol: { type: "integer", minimum: 0, maximum: 8 },
        spokenMove: {
          type: "string",
          description:
            "Short person phrase or Agent reply description for the visible log.",
        },
        personConfirmed: {
          type: "boolean",
          description:
            "Required on every call. True only for the person's exact confirmed move, pass, or reset; false for preview and Agent actions.",
        },
      },
      required: ["action", "actor", "personConfirmed"],
      additionalProperties: false,
    },
  ),
  tool(
    "masil_open_support_note",
    "Open a private no-action support note only after explicit request. Silence, mood, or activity is never consent.",
    {
      type: "object",
      properties: {
        personExplicitlyAsked: { type: "boolean" },
        summary: { type: "string" },
        desiredOutcome: { type: "string" },
      },
      required: ["personExplicitlyAsked", "summary", "desiredOutcome"],
      additionalProperties: false,
    },
  ),
  tool(
    "masil_prepare_support_review",
    "Prepare the minimum disclosure and local-demo route for person review. This creates no request.",
    {
      type: "object",
      properties: { minimumDisclosure: { type: "string", minLength: 1 } },
      required: ["minimumDisclosure"],
      additionalProperties: false,
    },
  ),
  tool(
    "masil_create_local_handoff",
    "Create an in-memory demo handoff only after two confirmations at the exact visible revision. Nothing is sent externally.",
    {
      type: "object",
      properties: { seenRevision: { type: "number" } },
      required: ["seenRevision"],
      additionalProperties: false,
    },
  ),
  tool(
    "masil_get_handoff_status",
    "Read the local owner, status, callback time, and next step.",
    emptyObjectSchema,
    true,
  ),
  tool(
    "masil_return_to_activity",
    "Return to the exact preserved activity without deleting the handoff result.",
    emptyObjectSchema,
  ),
];

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export const MASIL_WEBMCP_CONTRACT_HASH = `fnv1a:${fnv1a(
  stableStringify({
    version: MASIL_WEBMCP_CONTRACT_VERSION,
    descriptors: MASIL_TOOL_DESCRIPTORS,
    labels: MASIL_TOOL_LABELS,
    labelsEn: MASIL_TOOL_LABELS_EN,
  }),
)}`;
