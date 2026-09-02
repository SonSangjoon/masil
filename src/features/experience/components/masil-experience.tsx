"use client";

import {
  Activity as ActivityIcon,
  AudioWaveform,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  LockKeyhole,
  MessageCircle,
  PanelRightClose,
  PanelRightOpen,
  PhoneCall,
  ShieldCheck,
  UserRoundCheck,
  Workflow,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AirCalligraphyCanvas } from "@/features/calligraphy/components/air-calligraphy-canvas";
import { GlassOrbScene } from "@/features/presence/components/glass-orb-scene";
import { JanggiBoard } from "@/features/janggi/components/janggi-board";
import {
  MasilWorldTransition,
  type MasilWorldTransitionHandle,
} from "@/features/transitions/components/masil-world-transition";
import { Button } from "@/components/ui/button";
import {
  createPendingCameraRequest,
  type PendingCameraRequest,
} from "@/features/calligraphy/runtime/camera-source";
import {
  applyJanggiMove,
  createInitialJanggiGame,
  describeJanggiPiece,
  passJanggiTurn,
  previewJanggiMove,
  publicJanggiState,
  type JanggiGameState,
  type JanggiGridPoint,
  type JanggiMove,
  type JanggiMoveState,
} from "@/features/janggi/model/game";

type Language = "ko" | "en";
type Activity = "calligraphy" | "janggi";
type Stage = "home" | "activity" | "private" | "review" | "handoff";
type Presence =
  | "ready"
  | "listening"
  | "receiving"
  | "creating"
  | "speaking"
  | "awaiting"
  | "connected";
type WebMcpStatus = "checking" | "connected" | "demo" | "error";
type ProviderStatus = "waiting" | "needs-info" | "accepted";
type InvocationSource = "webmcp" | "person";
type JanggiActor = "person" | "agent";
type JanggiAnimationResult = "completed" | "timeout" | "cancelled";

type ToolName =
  | "masil_get_capabilities"
  | "masil_get_session_state"
  | "masil_project_agent_presence"
  | "masil_open_activity"
  | "masil_set_calligraphy_reference"
  | "masil_get_janggi_state"
  | "masil_wait_for_person_janggi_move"
  | "masil_move_janggi_piece"
  | "masil_open_support_note"
  | "masil_prepare_support_review"
  | "masil_create_local_handoff"
  | "masil_get_handoff_status"
  | "masil_return_to_activity";

type SupportDraft = {
  summary: string;
  desiredOutcome: string;
  minimumDisclosure: string;
  disclosureConfirmed: boolean;
  actionConfirmed: boolean;
};

type LocalHandoff = {
  id: string;
  status: ProviderStatus;
  owner: string;
  callbackAt: string;
  firstStep: string;
};

type DemoSession = {
  stage: Stage;
  activity: Activity | null;
  revision: number;
  caption: string;
  calligraphy: {
    character: string;
    reading: string;
    meaning: string;
    referenceImageUrl: string | null;
    referenceImageAlt: string;
  };
  janggiMove: JanggiMoveState;
  janggiActiveMove: JanggiMove | null;
  janggiGame: JanggiGameState;
  support: SupportDraft | null;
  handoff: LocalHandoff | null;
};

type DemoEvent = {
  id: string;
  label: string;
  status: "running" | "done" | "human" | "failed";
  source: InvocationSource;
};

type CharacterChoice = {
  character: string;
  label: string;
  reading: string;
  meaning: string;
};

type CharacterChoiceRequest = {
  question: string;
  choices: CharacterChoice[];
};

type CharacterChoiceResolution = {
  choice: CharacterChoice;
  source: "person-gesture" | "agent-reference";
};

type PendingJanggiAnimation = {
  moveId: string;
  timeoutId: number;
  resolve: (result: JanggiAnimationResult) => void;
};

type PersonJanggiMoveResolution = {
  revision: number;
  move: JanggiMove;
  game: JanggiGameState;
  animation: JanggiAnimationResult;
};

type PendingPersonJanggiMove = {
  timeoutId: number;
  resolve: (result: PersonJanggiMoveResolution | null) => void;
};

type ToolDescriptor = Omit<WebMcpTool, "execute" | "name"> & {
  name: ToolName;
};

const INITIAL_SESSION: DemoSession = {
  stage: "home",
  activity: null,
  revision: 0,
  caption: "오늘은 무엇을\n같이 해볼까요?",
  calligraphy: {
    character: "",
    reading: "",
    meaning: "",
    referenceImageUrl: null,
    referenceImageAlt: "",
  },
  janggiMove: "idle",
  janggiActiveMove: null,
  janggiGame: createInitialJanggiGame(),
  support: null,
  handoff: null,
};

const SUPPORT_EXAMPLE = {
  summary:
    "지난주부터 오던 반찬 배달이 끊겼는데, 어디에 물어봐야 할지 모르겠어요.",
  desiredOutcome:
    "주민센터에 직접 가지 않고 먼저 전화로 담당 창구와 다음 단계를 확인하고 싶어요.",
};

const TOOL_COPY: Record<ToolName, string> = {
  masil_get_capabilities: "이 웹이 Agent에게 제공하는 능력 읽기",
  masil_get_session_state: "현재 화면·상태·가능한 다음 행동 읽기",
  masil_project_agent_presence: "Agent의 대화 상태를 Orb와 화면에 투영",
  masil_open_activity: "활동을 열고 사람의 선택 기다리기",
  masil_set_calligraphy_reference: "생성한 서예 글자본을 화면에 배치",
  masil_get_janggi_state: "현재 장기판과 모든 합법 수 읽기",
  masil_wait_for_person_janggi_move: "어르신이 장기판에서 둘 한 수 기다리기",
  masil_move_janggi_piece: "확인한 장기 수를 규칙에 맞게 실행",
  masil_open_support_note: "명시적 요청 뒤 비공개 도움 메모 열기",
  masil_prepare_support_review: "사람에게 보일 최소 내용과 현재 창구 준비",
  masil_create_local_handoff: "두 번 확인한 로컬 데모 작업 카드 만들기",
  masil_get_handoff_status: "담당자·상태·다음 단계 다시 읽기",
  masil_return_to_activity: "작업 결과를 남기고 원래 활동으로 복귀",
};

const SINGLE_AGENT_BOUNDARY = {
  agentCount: 1,
  conversationOwner: "user-agent",
  providerRole: "webmcp-provider-and-visual-projection",
  embeddedAgent: false,
  pageOwnsModel: false,
  pageOwnsStt: false,
  pageOwnsTts: false,
  requiresOpenAiApiKey: false,
} as const;

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function textInput(input: Record<string, unknown>, key: string, fallback = "") {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberInput(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`INVALID_INTEGER:${key}`);
  }
  return value;
}

function toolResult(text: string, structuredContent: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent,
  };
}

function stagePresence(stage: Stage): Presence {
  if (stage === "review") return "awaiting";
  if (stage === "handoff") return "connected";
  return "ready";
}

function validActions(session: DemoSession): ToolName[] {
  const actions: ToolName[] = [
    "masil_get_capabilities",
    "masil_get_session_state",
    "masil_project_agent_presence",
  ];
  if (session.stage === "home") actions.push("masil_open_activity");
  if (session.stage === "activity") {
    actions.push("masil_open_support_note");
    if (session.activity === "calligraphy") {
      actions.push("masil_set_calligraphy_reference");
    }
    if (session.activity === "janggi") {
      actions.push("masil_get_janggi_state", "masil_move_janggi_piece");
      if (session.janggiGame.turn === PERSON_JANGGI_SIDE) {
        actions.push("masil_wait_for_person_janggi_move");
      }
    }
  }
  if (session.stage === "private") {
    actions.push("masil_prepare_support_review", "masil_return_to_activity");
  }
  if (session.stage === "review") {
    if (
      session.support?.disclosureConfirmed &&
      session.support.actionConfirmed
    ) {
      actions.push("masil_create_local_handoff");
    }
    actions.push("masil_return_to_activity");
  }
  if (session.stage === "handoff") {
    actions.push("masil_get_handoff_status", "masil_return_to_activity");
  }
  return actions;
}

function makeEventId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const DEFAULT_CHARACTER_CHOICES: CharacterChoice[] = [
  {
    character: "福",
    label: "복",
    reading: "복 복",
    meaning: "좋은 일이 머무는 마음",
  },
  {
    character: "春",
    label: "봄",
    reading: "봄 춘",
    meaning: "새로 시작하는 계절",
  },
  {
    character: "和",
    label: "편안",
    reading: "화할 화",
    meaning: "서로 어울리는 편안함",
  },
];

const MAX_CALLIGRAPHY_CHARACTERS = 4;
const PERSON_JANGGI_SIDE = "cho" as const;
const AGENT_JANGGI_SIDE = "han" as const;

function characterChoices(input: Record<string, unknown>): CharacterChoice[] {
  const supplied = Array.isArray(input.suggestions) ? input.suggestions : [];
  const parsed = supplied.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const value = candidate as Record<string, unknown>;
    const character = textInput(value, "character").slice(
      0,
      MAX_CALLIGRAPHY_CHARACTERS,
    );
    if (!character) return [];
    return [
      {
        character,
        label: textInput(value, "label", character).slice(0, 18),
        reading: textInput(value, "reading", character).slice(0, 40),
        meaning: textInput(value, "meaning", "").slice(0, 80),
      },
    ];
  });
  return (parsed.length ? parsed : DEFAULT_CHARACTER_CHOICES).slice(0, 3);
}

export function MasilExperience() {
  const [language, setLanguage] = useState<Language>("ko");
  const [session, setSession] = useState<DemoSession>(INITIAL_SESSION);
  const [presence, setPresence] = useState<Presence>("ready");
  const [webMcpStatus, setWebMcpStatus] =
    useState<WebMcpStatus>("checking");
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [characterRequest, setCharacterRequest] =
    useState<CharacterChoiceRequest | null>(null);
  const [cameraRequest, setCameraRequest] =
    useState<PendingCameraRequest | null>(null);
  const sessionRef = useRef(session);
  const worldTransitionRef = useRef<MasilWorldTransitionHandle | null>(null);
  const cameraRequestRef = useRef<PendingCameraRequest | null>(null);
  const cameraEventRef = useRef<string | null>(null);
  const pendingCharacterChoiceRef = useRef<{
    resolve: (resolution: CharacterChoiceResolution) => void;
    reject: (reason: Error) => void;
  } | null>(null);
  const pendingJanggiAnimationRef = useRef<PendingJanggiAnimation | null>(
    null,
  );
  const pendingPersonJanggiMoveRef = useRef<PendingPersonJanggiMove | null>(
    null,
  );

  const updateSession = useCallback(
    (updater: (current: DemoSession) => DemoSession) => {
      const next = updater(sessionRef.current);
      sessionRef.current = next;
      setSession(next);
      return next;
    },
    [],
  );

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const addEvent = useCallback(
    (
      label: string,
      status: DemoEvent["status"] = "running",
      source: InvocationSource = "person",
    ) => {
      const id = makeEventId();
      setEvents((current) =>
        [{ id, label, status, source }, ...current].slice(0, 6),
      );
      return id;
    },
    [],
  );

  const finishEvent = useCallback(
    (id: string, status: "done" | "failed", label?: string) => {
      setEvents((current) =>
        current.map((event) =>
          event.id === id
            ? { ...event, status, label: label ?? event.label }
            : event,
        ),
      );
    },
    [],
  );

  const waitForCharacterChoice = useCallback(
    (request: CharacterChoiceRequest) =>
      new Promise<CharacterChoiceResolution | null>((resolve, reject) => {
        pendingCharacterChoiceRef.current?.reject(
          new Error("CHARACTER_CHOICE_REPLACED"),
        );
        let timeout = 0;
        const settle = (resolution: CharacterChoiceResolution) => {
          window.clearTimeout(timeout);
          resolve(resolution);
        };
        const fail = (reason: Error) => {
          window.clearTimeout(timeout);
          reject(reason);
        };
        timeout = window.setTimeout(() => {
          if (pendingCharacterChoiceRef.current?.resolve !== settle) return;
          pendingCharacterChoiceRef.current = null;
          resolve(null);
        }, 10_000);
        pendingCharacterChoiceRef.current = { resolve: settle, reject: fail };
        setCharacterRequest(request);
      }),
    [],
  );

  const cancelPendingJanggiAnimation = useCallback(
    (result: JanggiAnimationResult = "cancelled") => {
      const pending = pendingJanggiAnimationRef.current;
      if (!pending) return;
      window.clearTimeout(pending.timeoutId);
      pendingJanggiAnimationRef.current = null;
      pending.resolve(result);
    },
    [],
  );

  const waitForJanggiAnimation = useCallback(
    (moveId: string) =>
      new Promise<JanggiAnimationResult>((resolve) => {
        cancelPendingJanggiAnimation();
        const timeoutId = window.setTimeout(() => {
          const pending = pendingJanggiAnimationRef.current;
          if (!pending || pending.moveId !== moveId) return;
          pendingJanggiAnimationRef.current = null;
          resolve("timeout");
        }, 4_500);
        pendingJanggiAnimationRef.current = {
          moveId,
          timeoutId,
          resolve,
        };
      }),
    [cancelPendingJanggiAnimation],
  );

  const completeJanggiAnimation = useCallback((moveId: string) => {
    const pending = pendingJanggiAnimationRef.current;
    if (!pending || pending.moveId !== moveId) return;
    window.clearTimeout(pending.timeoutId);
    pendingJanggiAnimationRef.current = null;
    pending.resolve("completed");
  }, []);

  const cancelPendingPersonJanggiMove = useCallback(() => {
    const pending = pendingPersonJanggiMoveRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timeoutId);
    pendingPersonJanggiMoveRef.current = null;
    pending.resolve(null);
  }, []);

  const waitForPersonJanggiMove = useCallback(
    () =>
      new Promise<PersonJanggiMoveResolution | null>((resolve) => {
        cancelPendingPersonJanggiMove();
        const timeoutId = window.setTimeout(() => {
          const pending = pendingPersonJanggiMoveRef.current;
          if (!pending || pending.resolve !== resolve) return;
          pendingPersonJanggiMoveRef.current = null;
          resolve(null);
        }, 45_000);
        pendingPersonJanggiMoveRef.current = { timeoutId, resolve };
      }),
    [cancelPendingPersonJanggiMove],
  );

  const resolvePendingPersonJanggiMove = useCallback(
    (result: PersonJanggiMoveResolution) => {
      const pending = pendingPersonJanggiMoveRef.current;
      if (!pending) return false;
      window.clearTimeout(pending.timeoutId);
      pendingPersonJanggiMoveRef.current = null;
      pending.resolve(result);
      return true;
    },
    [],
  );

  const chooseCharacter = useCallback(
    (choice: CharacterChoice) => {
      const pending = pendingCharacterChoiceRef.current;

      // getUserMedia begins synchronously inside this exact person gesture.
      cameraRequestRef.current?.abort();
      const nextCameraRequest = createPendingCameraRequest();
      cameraRequestRef.current = nextCameraRequest;
      setCameraRequest(nextCameraRequest);

      pendingCharacterChoiceRef.current = null;
      setCharacterRequest(null);
      addEvent(`사람이 ${choice.character} 글자를 선택`, "human");
      if (pending) {
        pending.resolve({ choice, source: "person-gesture" });
      } else {
        updateSession((state) => ({
          ...state,
          revision: state.revision + 1,
          caption: `${choice.label} 좋네요. 카메라를 열고 손을 찾을게요.`,
          calligraphy: {
            character: choice.character,
            reading: choice.reading,
            meaning: choice.meaning,
            referenceImageUrl: null,
            referenceImageAlt: `${choice.character} 서예 글자본`,
          },
        }));
      }
    },
    [addEvent, updateSession],
  );

  const requestCameraFromCanvas = useCallback(() => {
    cameraRequestRef.current?.abort();
    const nextCameraRequest = createPendingCameraRequest();
    cameraRequestRef.current = nextCameraRequest;
    setCameraRequest(nextCameraRequest);
    addEvent("사람이 공중 쓰기 시작을 선택", "human");
  }, [addEvent]);

  const handleCameraStateChange = useCallback(
    (
      state: "requesting" | "hand" | "fallback",
      reason?: string,
    ) => {
      if (state === "requesting") {
        cameraEventRef.current = addEvent(
          "사람의 선택으로 카메라 권한 요청",
          "running",
        );
      } else if (state === "hand") {
        if (cameraEventRef.current) {
          finishEvent(
            cameraEventRef.current,
            "done",
            "카메라 허용 · 공중 쓰기 시작",
          );
          cameraEventRef.current = null;
        }
        updateSession((current) => ({
          ...current,
          caption: "손을 들어 공중에 천천히 써보세요.",
        }));
      } else {
        const label =
          reason === "person-stopped-camera"
            ? "사람이 카메라를 끄고 직접 쓰기로 전환"
            : "카메라 불가 · 직접 쓰기로 안전 전환";
        if (cameraEventRef.current) {
          finishEvent(cameraEventRef.current, "done", label);
          cameraEventRef.current = null;
        } else {
          addEvent(label, "human");
        }
        updateSession((current) => ({
          ...current,
          caption:
            reason === "person-stopped-camera"
              ? "카메라를 껐어요. 화면에 직접 이어서 써보세요."
              : "카메라를 열 수 없어 화면에 직접 쓸 수 있게 바꿨어요.",
        }));
      }
    },
    [addEvent, finishEvent, updateSession],
  );

  useEffect(
    () => () => {
      cameraRequestRef.current?.abort();
      pendingCharacterChoiceRef.current?.reject(
        new Error("CHARACTER_CHOICE_CANCELLED"),
      );
      cancelPendingJanggiAnimation();
      cancelPendingPersonJanggiMove();
    },
    [cancelPendingJanggiAnimation, cancelPendingPersonJanggiMove],
  );

  const executeTool = useCallback(
    async (
      name: ToolName,
      input: Record<string, unknown>,
      source: InvocationSource = "person",
    ): Promise<WebMcpToolResult> => {
      const eventId = addEvent(TOOL_COPY[name], "running", source);
      const readOnly =
        name === "masil_get_capabilities" ||
        name === "masil_get_session_state" ||
        name === "masil_get_janggi_state" ||
        name === "masil_get_handoff_status";

      try {
        if (
          source === "webmcp" &&
          !readOnly &&
          name !== "masil_project_agent_presence"
        ) {
          setPresence("receiving");
          await sleep(220);
          setPresence("creating");
          await sleep(220);
        }

        const current = sessionRef.current;

        if (name === "masil_get_capabilities") {
          finishEvent(eventId, "done");
          return toolResult("Read MASIL's declared WebMCP capabilities.", {
            provider: "MASIL",
            purpose:
              "Turn ordinary speech into person-controlled visual activities and explicit, reviewable help workflows.",
            ...SINGLE_AGENT_BOUNDARY,
            tools: Object.entries(TOOL_COPY).map(([toolName, label]) => ({
              name: toolName,
              label,
            })),
            scenarios: {
              calligraphy: {
                discoverAndAsk: "masil_open_activity",
                generateAndPlaceReference:
                  "masil_set_calligraphy_reference",
                referenceAssetContract: {
                  textLength: "1-4 characters",
                  format: "PNG, JPEG, or WebP URL readable by the page",
                  preferredFormat: "PNG with real transparent alpha",
                  foreground: "solid black brush-calligraphy only",
                  background:
                    "fully transparent; no paper, checkerboard, seal, or decoration",
                  composition:
                    "the complete phrase in one image with safe margins; MASIL fits it on one screen with contain",
                },
                cameraBoundary:
                  "A fresh person click on the visible page is required before camera access.",
              },
              janggi: {
                open: "masil_open_activity",
                readBoardAndLegalMoves: "masil_get_janggi_state",
                waitForPersonBoardGesture:
                  "masil_wait_for_person_janggi_move",
                previewOrExecuteMove: "masil_move_janggi_piece",
                turnContract: {
                  personSide: PERSON_JANGGI_SIDE,
                  agentSide: AGENT_JANGGI_SIDE,
                  interaction:
                    "Each move tool call stays pending until its visible vGPU animation completes. A person move returns shouldAgentReply=true so the same user Agent can choose and play Han's reply. After the Agent reply, the next spoken move begins a new user-Agent turn.",
                  futureSpeechBoundary:
                    "The page does not keep a WebMCP call open while waiting for a future voice utterance owned by the user Agent.",
                },
                rules:
                  "The provider validates turn, blocking paths, palace lines, cannon screens and cannon restrictions, check, captures, bikjang, and pass eligibility before changing the board.",
              },
              support: {
                openPrivateDraft: "masil_open_support_note",
                preparePersonReview: "masil_prepare_support_review",
                createConfirmedDemoHandoff: "masil_create_local_handoff",
              },
            },
          });
        }

        if (name === "masil_get_session_state") {
          const janggiGame = current.janggiGame ?? createInitialJanggiGame();
          finishEvent(eventId, "done");
          return toolResult("Read the exact shared MASIL page state.", {
            ...current,
            awaitingCharacterChoice:
              current.stage === "activity" &&
              current.activity === "calligraphy" &&
              !current.calligraphy.character,
            janggi:
              current.activity === "janggi"
                ? {
                    ...publicJanggiState(janggiGame),
                    personSide: PERSON_JANGGI_SIDE,
                    agentSide: AGENT_JANGGI_SIDE,
                    turnOwner:
                      janggiGame.turn === PERSON_JANGGI_SIDE
                        ? "person"
                        : "agent",
                  }
                : null,
            validNextActions: validActions(current),
            localDemoOnly: true,
          });
        }

        if (name === "masil_project_agent_presence") {
          const phase = textInput(input, "phase", "ready");
          const allowed: Presence[] = [
            "ready",
            "listening",
            "receiving",
            "creating",
            "speaking",
            "awaiting",
            "connected",
          ];
          if (!allowed.includes(phase as Presence)) {
            throw new Error("INVALID_AGENT_PHASE");
          }
          const caption = textInput(input, "caption", current.caption).slice(
            0,
            180,
          );
          const next = updateSession((state) => ({
            ...state,
            revision: state.revision + 1,
            caption,
          }));
          setPresence(phase as Presence);
          finishEvent(eventId, "done", `화면 투영 · ${caption}`);
          return toolResult("Projected Agent presence into MASIL.", {
            revision: next.revision,
            phase,
            caption,
            conversationOwner: SINGLE_AGENT_BOUNDARY.conversationOwner,
            embeddedAgent: SINGLE_AGENT_BOUNDARY.embeddedAgent,
            audioCapturedByPage: false,
            speechSynthesizedByPage: false,
          });
        }

        if (name === "masil_open_activity") {
          if (current.stage !== "home" && current.stage !== "activity") {
            throw new Error("ACTIVITY_SWITCH_NOT_AVAILABLE");
          }
          const activity = textInput(input, "activity") as Activity;
          if (activity !== "calligraphy" && activity !== "janggi") {
            throw new Error("INVALID_ACTIVITY");
          }
          const caption =
            activity === "calligraphy"
              ? textInput(
                  input,
                  "question",
                  "어떤 글자를 써볼까요?",
                )
              : textInput(input, "caption", "좋아요. 장기판을 같이 볼게요.");
          let next: DemoSession | null = null;
          const revealActivity = () => {
            if (next) return;
            next = updateSession((state) => ({
              ...state,
              stage: "activity",
              activity,
              revision: state.revision + 1,
              caption,
              calligraphy:
                activity === "calligraphy"
                  ? {
                      character: "",
                      reading: "",
                      meaning: "",
                      referenceImageUrl: null,
                      referenceImageAlt: "",
                    }
                  : state.calligraphy,
            }));
          };
          const transition = worldTransitionRef.current;
          if (transition) {
            await transition.play(activity, revealActivity);
          } else {
            revealActivity();
          }
          revealActivity();
          const opened = sessionRef.current;

          if (activity === "calligraphy") {
            setPresence("awaiting");
            const resolution = await waitForCharacterChoice({
              question: caption,
              choices: characterChoices(input),
            });
            if (!resolution) {
              setPresence("awaiting");
              finishEvent(
                eventId,
                "done",
                "글자 선택을 화면에서 계속 기다리는 중",
              );
              return toolResult(
                "Projected the character question. The active tool window ended, but the person can choose at their own pace; read session state on the next Agent turn.",
                {
                  stage: opened.stage,
                  activity,
                  revision: opened.revision,
                  interactionPending: true,
                  choicesRemainVisible: true,
                  cameraPermissionRequested: false,
                  validNextActions: validActions(opened),
                },
              );
            }
            const { choice, source } = resolution;
            if (source === "agent-reference") {
              const selected = sessionRef.current;
              setPresence("ready");
              finishEvent(
                eventId,
                "done",
                `${choice.character} Agent 글자본으로 서예를 열었어요`,
              );
              return toolResult(
                "Opened the Agent-generated reference without claiming a browser user gesture.",
                {
                  stage: selected.stage,
                  activity,
                  revision: selected.revision,
                  selectedCharacter: choice,
                  selectionSource: source,
                  userGestureReceived: false,
                  cameraPermissionRequestedFromGesture: false,
                  cameraStartRequiresFreshPersonGesture: true,
                  validNextActions: validActions(selected),
                },
              );
            }
            const selected = updateSession((state) => ({
              ...state,
              revision: state.revision + 1,
              caption: `${choice.label} 좋네요. 카메라를 열고 손을 찾을게요.`,
              calligraphy: {
                character: choice.character,
                reading: choice.reading,
                meaning: choice.meaning,
                referenceImageUrl: null,
                referenceImageAlt: `${choice.character} 서예 글자본`,
              },
            }));
            setPresence("creating");
            await sleep(180);
            setPresence("ready");
            finishEvent(eventId, "done", `${choice.character} 공중 서예를 열었어요`);
            return toolResult(
              "Opened air calligraphy after the person's visible choice.",
              {
                stage: selected.stage,
                activity,
                revision: selected.revision,
                selectedCharacter: choice,
                userGestureReceived: true,
                cameraPermissionRequestedFromGesture: true,
                validNextActions: validActions(selected),
              },
            );
          }

          setPresence("speaking");
          await sleep(260);
          setPresence("ready");
          finishEvent(eventId, "done", "장기판을 열었어요");
          return toolResult("Opened the chosen shared activity.", {
            stage: opened.stage,
            activity,
            revision: opened.revision,
            validNextActions: validActions(opened),
          });
        }

        if (name === "masil_set_calligraphy_reference") {
          if (
            current.stage !== "activity" ||
            current.activity !== "calligraphy"
          ) {
            throw new Error("CALLIGRAPHY_NOT_OPEN");
          }
          const character = textInput(
            input,
            "character",
            current.calligraphy.character,
          ).slice(0, MAX_CALLIGRAPHY_CHARACTERS);
          if (!character) {
            throw new Error("CALLIGRAPHY_TEXT_REQUIRED");
          }
          const suppliedUrl = textInput(input, "referenceImageUrl");
          if (!suppliedUrl) {
            throw new Error("AGENT_REFERENCE_IMAGE_REQUIRED");
          }
          const parsed = new URL(suppliedUrl, window.location.href);
          const safeDataUrl = /^data:image\/(png|jpeg|webp);base64,/i.test(
            suppliedUrl,
          );
          const sameOrigin = parsed.origin === window.location.origin;
          if (!safeDataUrl && !sameOrigin && parsed.protocol !== "https:") {
            throw new Error("REFERENCE_IMAGE_MUST_BE_SAFE_URL");
          }
          const next = updateSession((state) => ({
            ...state,
            revision: state.revision + 1,
            caption: textInput(
              input,
              "caption",
              `${character} 글자본을 만들었어요. 손으로 따라 써보세요.`,
            ),
            calligraphy: {
              character,
              reading: textInput(
                input,
                "reading",
                state.calligraphy.reading,
              ),
              meaning: textInput(
                input,
                "meaning",
                state.calligraphy.meaning,
              ),
              referenceImageUrl: suppliedUrl || null,
              referenceImageAlt: textInput(
                input,
                "referenceImageAlt",
                `${character} 서예 글자본`,
              ),
            },
          }));
          const pending = pendingCharacterChoiceRef.current;
          pendingCharacterChoiceRef.current = null;
          setCharacterRequest(null);
          cameraRequestRef.current?.abort();
          cameraRequestRef.current = null;
          setCameraRequest(null);
          pending?.resolve({
            choice: {
              character,
              label: character,
              reading: next.calligraphy.reading || character,
              meaning: next.calligraphy.meaning,
            },
            source: "agent-reference",
          });
          setPresence("ready");
          finishEvent(eventId, "done", `${character} 글자본을 배치했어요`);
          return toolResult("Updated the Agent-created reference layer.", {
            revision: next.revision,
            calligraphy: next.calligraphy,
            acceptedCharacterCount: character.length,
            generatedByAgent: true,
            imageTransport: suppliedUrl ? "referenceImageUrl" : "text-fallback",
            cameraPermissionRequested: false,
            cameraStartRequiresFreshPersonGesture: true,
            humanStrokeLayer: "separate-and-preserved",
          });
        }

        if (name === "masil_get_janggi_state") {
          if (current.stage !== "activity" || current.activity !== "janggi") {
            throw new Error("JANGGI_NOT_OPEN");
          }
          const janggiGame = current.janggiGame ?? createInitialJanggiGame();
          finishEvent(eventId, "done", "현재 판과 합법 수를 읽었어요");
          return toolResult("Read the live Janggi position and legal moves.", {
            revision: current.revision,
            personSide: PERSON_JANGGI_SIDE,
            agentSide: AGENT_JANGGI_SIDE,
            turnOwner:
              janggiGame.turn === PERSON_JANGGI_SIDE ? "person" : "agent",
            ...publicJanggiState(janggiGame),
          });
        }

        if (name === "masil_wait_for_person_janggi_move") {
          if (current.stage !== "activity" || current.activity !== "janggi") {
            throw new Error("JANGGI_NOT_OPEN");
          }
          if (current.janggiGame.turn !== PERSON_JANGGI_SIDE) {
            throw new Error("JANGGI_PERSON_TURN_NOT_ACTIVE");
          }
          setPresence("awaiting");
          const resolution = await waitForPersonJanggiMove();
          if (!resolution) {
            setPresence("ready");
            finishEvent(eventId, "done", "손으로 둘 수를 기다리다 멈췄어요");
            return toolResult(
              "The bounded wait ended without a board gesture.",
              {
                timedOutOrCancelled: true,
                personSide: PERSON_JANGGI_SIDE,
                turn: sessionRef.current.janggiGame.turn,
                idleAgentWasNotWoken: true,
              },
            );
          }
          setPresence("creating");
          finishEvent(
            eventId,
            "done",
            `${resolution.move.spokenMove} · 손으로 둔 수를 Agent가 받았어요`,
          );
          return toolResult(
            "Received one person-controlled board move after its visible animation completed.",
            {
              revision: resolution.revision,
              move: resolution.move,
              game: publicJanggiState(resolution.game),
              animation: resolution.animation,
              shouldAgentReply: resolution.game.status !== "checkmate",
              nextTurnOwner:
                resolution.game.turn === PERSON_JANGGI_SIDE
                  ? "person"
                  : "agent",
              gesture: "click-tap-or-drag",
              idleAgentWasNotWoken: true,
            },
          );
        }

        if (name === "masil_move_janggi_piece") {
          if (current.stage !== "activity" || current.activity !== "janggi") {
            throw new Error("JANGGI_NOT_OPEN");
          }
          const janggiGame = current.janggiGame ?? createInitialJanggiGame();
          const action = textInput(input, "action", "preview");
          const actor = textInput(input, "actor", "person") as JanggiActor;
          if (actor !== "person" && actor !== "agent") {
            throw new Error("INVALID_JANGGI_ACTOR");
          }
          if (!["preview", "move", "pass", "reset"].includes(action)) {
            throw new Error("INVALID_JANGGI_ACTION");
          }
          if (action === "reset") {
            const next = updateSession((state) => ({
              ...state,
              revision: state.revision + 1,
              janggiMove: "idle",
              janggiActiveMove: null,
              janggiGame: createInitialJanggiGame(),
              caption: "장기판을 처음 상태로 되돌렸어요.",
            }));
            setPresence("ready");
            finishEvent(eventId, "done", "장기판을 처음 상태로 복원했어요");
            return toolResult("Reset the Janggi board.", {
              revision: next.revision,
              personSide: PERSON_JANGGI_SIDE,
              agentSide: AGENT_JANGGI_SIDE,
              turnOwner: "person",
              ...publicJanggiState(next.janggiGame),
            });
          }
          const actorSide =
            actor === "person" ? PERSON_JANGGI_SIDE : AGENT_JANGGI_SIDE;
          if (janggiGame.turn !== actorSide) {
            throw new Error(
              `JANGGI_ACTOR_OUT_OF_TURN:${actor}:${janggiGame.turn}`,
            );
          }
          if (action === "pass") {
            if (actor === "person" && input.personConfirmed !== true) {
              throw new Error("PERSON_CONFIRMATION_REQUIRED");
            }
            const nextGame = passJanggiTurn(janggiGame);
            const next = updateSession((state) => ({
              ...state,
              revision: state.revision + 1,
              janggiMove: "idle",
              janggiActiveMove: null,
              janggiGame: nextGame,
              caption:
                actor === "person"
                  ? "한 수 쉬었어요. 이제 제가 둘게요."
                  : "저도 한 수 쉬었어요. 이제 어르신 차례예요.",
            }));
            setPresence("ready");
            finishEvent(
              eventId,
              "done",
              `${actor === "person" ? "사람" : "Agent"} 한수쉼 · 규칙 검증 후 실행`,
            );
            return toolResult("Validated and executed a Janggi pass.", {
              revision: next.revision,
              action,
              actor,
              game: publicJanggiState(next.janggiGame),
              rulesValidated: true,
              shouldAgentReply:
                actor === "person" && next.janggiGame.status !== "checkmate",
              awaitingPersonSpeech:
                actor === "agent" && next.janggiGame.status !== "checkmate",
              nextTurnOwner:
                next.janggiGame.turn === PERSON_JANGGI_SIDE
                  ? "person"
                  : "agent",
            });
          }

          const pieceId = textInput(input, "pieceId");
          const destination = {
            row: numberInput(input, "toRow"),
            col: numberInput(input, "toCol"),
          };
          const spokenMove = textInput(input, "spokenMove", pieceId);
          const preview = previewJanggiMove(
            janggiGame,
            pieceId,
            destination,
            spokenMove,
          );
          if (
            action === "move" &&
            actor === "person" &&
            input.personConfirmed !== true
          ) {
            throw new Error("PERSON_CONFIRMATION_REQUIRED");
          }
          const nextGame =
            action === "move"
              ? applyJanggiMove(
                  janggiGame,
                  pieceId,
                  destination,
                  spokenMove,
                )
              : janggiGame;
          const movedPiece = nextGame.pieces.find(
            (piece) => piece.id === pieceId,
          );
          const moveLabel = movedPiece
            ? describeJanggiPiece(movedPiece)
            : pieceId;
          const animationPromise =
            action === "move" && nextGame.lastMove
              ? waitForJanggiAnimation(nextGame.lastMove.id)
              : null;
          const next = updateSession((state) => ({
            ...state,
            revision: state.revision + 1,
            janggiMove: action === "move" ? "moved" : "suggested",
            janggiActiveMove: action === "move" ? nextGame.lastMove : preview,
            janggiGame: nextGame,
            caption:
              action === "preview"
                ? `${moveLabel}의 길을 보여드릴게요.`
                : actor === "person"
                  ? `${moveLabel}을 옮겼어요. 이제 제가 둘게요.`
                  : `${moveLabel}을 두었어요. 이제 어르신 차례예요.`,
          }));
          const animation = animationPromise
            ? await animationPromise
            : ("completed" as const);
          if (
            source === "person" &&
            actor === "person" &&
            action === "move" &&
            next.janggiActiveMove
          ) {
            resolvePendingPersonJanggiMove({
              revision: next.revision,
              move: next.janggiActiveMove,
              game: next.janggiGame,
              animation,
            });
          }
          setPresence("ready");
          finishEvent(
            eventId,
            "done",
            `${actor === "person" ? "사람" : "Agent"} · ${spokenMove} · 규칙 검증 ${
              action === "move"
                ? animation === "completed"
                  ? "· 화면 완료"
                  : animation === "timeout"
                    ? "· 화면 대기 만료"
                    : "· 화면 전환 취소"
                : "완료"
            }`,
          );
          return toolResult(
            action === "move"
              ? "Validated and executed the confirmed Janggi move."
              : "Validated and projected the Janggi move without changing the position.",
            {
              revision: next.revision,
              action,
              actor,
              move: next.janggiActiveMove,
              game: publicJanggiState(next.janggiGame),
              rulesValidated: true,
              animation,
              toolResolvedAfterVisibleAnimation:
                action === "move" && animation === "completed",
              shouldAgentReply:
                action === "move" &&
                actor === "person" &&
                next.janggiGame.status !== "checkmate",
              awaitingPersonSpeech:
                action === "move" &&
                actor === "agent" &&
                next.janggiGame.status !== "checkmate",
              nextTurnOwner:
                next.janggiGame.turn === PERSON_JANGGI_SIDE
                  ? "person"
                  : "agent",
              futureSpeechStartsNewAgentTurn: true,
            },
          );
        }

        if (name === "masil_open_support_note") {
          if (current.stage !== "activity" || !current.activity) {
            throw new Error("ACTIVE_ACTIVITY_REQUIRED");
          }
          if (input.personExplicitlyAsked !== true) {
            throw new Error("EXPLICIT_REQUEST_REQUIRED");
          }
          const next = updateSession((state) => ({
            ...state,
            stage: "private",
            revision: state.revision + 1,
            caption:
              "말씀하신 내용을 먼저 어르신에게만 보이는 메모로 정리했어요.",
            support: {
              summary: textInput(
                input,
                "summary",
                SUPPORT_EXAMPLE.summary,
              ),
              desiredOutcome: textInput(
                input,
                "desiredOutcome",
                SUPPORT_EXAMPLE.desiredOutcome,
              ),
              minimumDisclosure: "",
              disclosureConfirmed: false,
              actionConfirmed: false,
            },
          }));
          setPresence(stagePresence(next.stage));
          finishEvent(eventId, "done", "비공개 도움 메모를 열었어요");
          return toolResult("Opened a private, no-action support note.", {
            stage: next.stage,
            revision: next.revision,
            providerPayloadCreated: false,
            externalTransmissionOccurred: false,
          });
        }

        if (name === "masil_prepare_support_review") {
          if (current.stage !== "private" || !current.support) {
            throw new Error("PRIVATE_NOTE_NOT_OPEN");
          }
          const minimumDisclosure = textInput(
            input,
            "minimumDisclosure",
            "반찬 배달이 중단되어 주민센터 담당 창구와 다음 단계를 전화로 확인하고 싶습니다.",
          );
          const next = updateSession((state) => ({
            ...state,
            stage: "review",
            revision: state.revision + 1,
            caption: "보일 문장과 실제 행동을 따로 확인해 주세요.",
            support: state.support
              ? {
                  ...state.support,
                  minimumDisclosure,
                  disclosureConfirmed: false,
                  actionConfirmed: false,
                }
              : null,
          }));
          setPresence("awaiting");
          finishEvent(eventId, "done", "최소 공개 내용과 창구를 준비했어요");
          return toolResult("Prepared a visible support review.", {
            stage: next.stage,
            revision: next.revision,
            recipient: "주민센터 복지 상담 창구 · 로컬 데모",
            minimumDisclosure,
            requestCreated: false,
          });
        }

        if (name === "masil_create_local_handoff") {
          if (current.stage !== "review" || !current.support) {
            throw new Error("SUPPORT_REVIEW_NOT_OPEN");
          }
          if (
            !current.support.disclosureConfirmed ||
            !current.support.actionConfirmed
          ) {
            throw new Error("TWO_CONFIRMATIONS_REQUIRED");
          }
          if (input.seenRevision !== current.revision) {
            throw new Error(`STALE_REVISION:${current.revision}`);
          }
          const handoff: LocalHandoff = {
            id: `MASIL-${String(1042 + current.revision).padStart(4, "0")}`,
            status: "waiting",
            owner: "김하늘 생활지원 매니저 · 데모",
            callbackAt: "오늘 오후 4시 30분",
            firstStep: "상황을 다시 처음부터 묻지 않고, 중단된 반찬 배달부터 확인",
          };
          const next = updateSession((state) => ({
            ...state,
            stage: "handoff",
            revision: state.revision + 1,
            caption: "정리한 내용이 로컬 담당자 화면에 도착했어요.",
            handoff,
          }));
          setPresence("connected");
          finishEvent(eventId, "done", "로컬 작업 카드를 만들었어요");
          return toolResult("Created a local-only handoff card.", {
            stage: next.stage,
            revision: next.revision,
            handoff,
            localDemoOnly: true,
            externalTransmissionOccurred: false,
            governmentRequestCreated: false,
          });
        }

        if (name === "masil_get_handoff_status") {
          if (current.stage !== "handoff" || !current.handoff) {
            throw new Error("NO_HANDOFF");
          }
          finishEvent(eventId, "done", "담당자와 다음 단계를 읽었어요");
          return toolResult("Read the local handoff status.", {
            revision: current.revision,
            handoff: current.handoff,
          });
        }

        if (name === "masil_return_to_activity") {
          if (!current.activity || current.stage === "home") {
            throw new Error("NO_ACTIVITY_TO_RETURN_TO");
          }
          const next = updateSession((state) => ({
            ...state,
            stage: "activity",
            revision: state.revision + 1,
            caption:
              state.activity === "calligraphy"
                ? "서예는 그대로 남아 있어요. 이어서 써볼까요?"
                : "장기판은 그대로 남아 있어요. 이어서 둘까요?",
          }));
          setPresence("ready");
          finishEvent(eventId, "done", "원래 활동으로 돌아왔어요");
          return toolResult("Returned to the preserved activity.", {
            stage: next.stage,
            activity: next.activity,
            revision: next.revision,
            handoff: next.handoff,
          });
        }

        throw new Error(`UNKNOWN_TOOL:${name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Tool failed";
        finishEvent(eventId, "failed", message);
        setPresence(stagePresence(sessionRef.current.stage));
        throw error;
      }
    },
    [
      addEvent,
      finishEvent,
      updateSession,
      resolvePendingPersonJanggiMove,
      waitForCharacterChoice,
      waitForJanggiAnimation,
      waitForPersonJanggiMove,
    ],
  );

  const toolDescriptors = useMemo<ToolDescriptor[]>(() => {
    const tool = (
      name: ToolName,
      description: string,
      inputSchema: Record<string, unknown>,
      readOnly = false,
      untrustedContent = false,
    ): ToolDescriptor => ({
      name,
      description,
      inputSchema,
      annotations: {
        readOnlyHint: readOnly,
        untrustedContentHint: untrustedContent,
      },
    });

    return [
      tool(
        "masil_get_capabilities",
        "Read MASIL's exact activities, state, permissions, and person-control boundaries. MASIL is only a WebMCP provider and visual projection: the one calling user Agent owns conversation, voice, reasoning, and private context; this page contains no embedded Agent, model, STT, or TTS.",
        { type: "object", properties: {}, additionalProperties: false },
        true,
      ),
      tool(
        "masil_get_session_state",
        "Read the exact visible scene and valid next actions before acting.",
        { type: "object", properties: {}, additionalProperties: false },
        true,
      ),
      tool(
        "masil_project_agent_presence",
        "Project coarse phase changes from the same single user Agent into MASIL's Orb and short caption. Use only at real turn boundaries such as listening, creating, or speaking; do not send raw audio, transcripts, token deltas, or private memory. MASIL never captures speech, synthesizes speech, calls a model, or creates another Agent.",
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
        "masil_open_activity",
        "Open calligraphy or janggi after the person expresses that intent. For calligraphy, project a visible question and up to three Agent-supplied choices of one to four characters, then wait during one bounded active-turn window. A visible selection requests the camera from that fresh person gesture. If the person instead names another phrase to the Agent, call masil_set_calligraphy_reference with its generated image URL.",
        {
          type: "object",
          properties: {
            activity: {
              type: "string",
              enum: ["calligraphy", "janggi"],
            },
            caption: { type: "string", maxLength: 180 },
            question: { type: "string", maxLength: 180 },
            suggestions: {
              type: "array",
              minItems: 1,
              maxItems: 3,
              items: {
                type: "object",
                properties: {
                  character: { type: "string", minLength: 1, maxLength: 4 },
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
        "Accept a one-to-four-character phrase and an Agent-generated raster image URL, close any pending character prompt, and place the complete reference in the calligraphy space without changing the person's strokes. Camera access still requires a fresh person gesture on the page.",
        {
          type: "object",
          properties: {
            character: { type: "string", minLength: 1, maxLength: 4 },
            reading: { type: "string" },
            meaning: { type: "string" },
            caption: { type: "string", maxLength: 180 },
            referenceImageUrl: {
              type: "string",
              description:
                "Required Agent-generated image transport. Supply a PNG, JPEG, or WebP data URL, same-origin URL, or HTTPS URL readable by this page. Generate the complete 1-4 character phrase as solid black Korean or Hanja brush-calligraphy cut out on real transparent alpha, centered in one image with generous margins. Do not include paper, a baked checkerboard, seal, signature, decoration, translation, or any extra text; MASIL displays the whole image with object-fit contain.",
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
        "masil_get_janggi_state",
        "Read the exact live Janggi position, whose turn it is, the coordinate convention, and every legal destination for each piece on move. Always read this before resolving a natural-language move. The page is the rules authority; do not guess blocked paths or cannon screens.",
        { type: "object", properties: {}, additionalProperties: false },
        true,
      ),
      tool(
        "masil_wait_for_person_janggi_move",
        "During one active Agent turn, wait up to 45 seconds for the person to make exactly one Cho move directly on the shared board by clicking or touching a piece and destination, or by dragging it onto a displayed legal destination. The page exposes only legal destinations, validates the chosen move with the same Janggi rules engine, and resolves this async call only after the same vGPU move and camera animation finishes. The result returns shouldAgentReply=true so the calling user Agent can play Han with masil_move_janggi_piece. This bounded gesture wait cannot wake an idle Agent and must not be used to wait for future speech.",
        { type: "object", properties: {}, additionalProperties: false },
      ),
      tool(
        "masil_move_janggi_piece",
        "Validate and visibly animate one semantic Janggi action in the shared turn loop. The person always plays Cho and the calling user Agent plays Han. Read masil_get_janggi_state first, convert words into a pieceId and destination, then call actor=person for the explicitly requested Cho move with personConfirmed=true. This async tool resolves only after that move's vGPU animation completes and returns shouldAgentReply=true. In the same Agent turn, choose a legal Han response and call again with actor=agent; when its animation completes the result returns awaitingPersonSpeech=true. Do not leave a site-tool call open waiting for the person's future voice—the next utterance starts a new Agent turn. Use action=preview to show a legal move without changing the game. Use action=pass for 한수쉼; the provider rejects it while in check. The provider enforces turns, horse and elephant blocks, palace movement and diagonals, cannon screens and cannon restrictions, captures, check, mate, and the non-chess bikjang rule. For '초 왕 오른쪽 대각선' from the initial position use cho-king to row 7, col 5.",
        {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["preview", "move", "pass", "reset"],
            },
            actor: {
              type: "string",
              enum: ["person", "agent"],
              description:
                "Use person for Cho moves spoken by the person, and agent for Han replies selected by the same calling user Agent.",
            },
            pieceId: {
              type: "string",
              description:
                "Stable piece id returned by masil_get_janggi_state, such as cho-king or cho-po-left.",
            },
            toRow: { type: "integer", minimum: 0, maximum: 9 },
            toCol: { type: "integer", minimum: 0, maximum: 8 },
            spokenMove: {
              type: "string",
              description:
                "For actor=person, the person's short original phrase. For actor=agent, a short natural-language description of the Agent reply for the visible log.",
            },
            personConfirmed: {
              type: "boolean",
              description:
                "Required true only for actor=person with action=move or pass. It means the person explicitly told the Agent to make this exact Cho action.",
            },
          },
          required: ["action", "actor"],
          additionalProperties: false,
        },
      ),
      tool(
        "masil_open_support_note",
        "Open a private no-action support note only after an explicit request. Activity, mood, silence, or conversation alone is never consent.",
        {
          type: "object",
          properties: {
            personExplicitlyAsked: { type: "boolean" },
            summary: { type: "string" },
            desiredOutcome: { type: "string" },
          },
          required: [
            "personExplicitlyAsked",
            "summary",
            "desiredOutcome",
          ],
          additionalProperties: false,
        },
      ),
      tool(
        "masil_prepare_support_review",
        "Prepare the smallest exact sentence and current local support capacity for the person to review. This creates no request.",
        {
          type: "object",
          properties: {
            minimumDisclosure: { type: "string", minLength: 1 },
          },
          required: ["minimumDisclosure"],
          additionalProperties: false,
        },
      ),
      tool(
        "masil_create_local_handoff",
        "Create only an in-memory demo handoff after separate disclosure and action confirmations at the exact visible revision.",
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
        { type: "object", properties: {}, additionalProperties: false },
        true,
      ),
      tool(
        "masil_return_to_activity",
        "Return to the exact preserved activity without deleting the handoff result.",
        { type: "object", properties: {}, additionalProperties: false },
      ),
    ];
  }, []);

  useEffect(() => {
    const modelContext = document.modelContext;
    if (!modelContext?.registerTool) {
      const timer = window.setTimeout(() => setWebMcpStatus("demo"), 0);
      return () => window.clearTimeout(timer);
    }

    let active = true;
    const registered: ToolName[] = [];

    const start = async () => {
      await Promise.resolve();
      if (!active) return;
      try {
        for (const descriptor of toolDescriptors) {
          const webMcpTool: WebMcpTool = {
            ...descriptor,
            execute: (input) =>
              executeTool(descriptor.name, input, "webmcp"),
          };
          await Promise.resolve(modelContext.registerTool(webMcpTool));
          registered.push(descriptor.name);
          if (!active) break;
        }
        if (active) setWebMcpStatus("connected");
      } catch {
        if (active) setWebMcpStatus("error");
      }
    };

    void start();
    return () => {
      active = false;
      for (const name of registered) {
        if (modelContext.unregisterTool) {
          void Promise.resolve(modelContext.unregisterTool(name));
        }
      }
    };
  }, [executeTool, toolDescriptors]);

  const prepareReview = () =>
    executeTool("masil_prepare_support_review", {
      minimumDisclosure:
        "반찬 배달이 중단되어 주민센터 담당 창구와 다음 단계를 전화로 확인하고 싶습니다.",
    });

  const confirmDisclosure = () => {
    const next = updateSession((current) => ({
      ...current,
      revision: current.revision + 1,
      support: current.support
        ? {
            ...current.support,
            disclosureConfirmed: true,
            actionConfirmed: false,
          }
        : null,
    }));
    addEvent(`사람이 공개 문장만 확인 · revision ${next.revision}`, "human");
  };

  const confirmAction = () => {
    const next = updateSession((current) => ({
      ...current,
      revision: current.revision + 1,
      support: current.support
        ? { ...current.support, actionConfirmed: true }
        : null,
    }));
    addEvent(`사람이 작업 카드 생성도 확인 · revision ${next.revision}`, "human");
  };

  const updateDisclosure = (minimumDisclosure: string) => {
    updateSession((current) => ({
      ...current,
      revision: current.revision + 1,
      support: current.support
        ? {
            ...current.support,
            minimumDisclosure,
            disclosureConfirmed: false,
            actionConfirmed: false,
          }
        : null,
    }));
  };

  const createHandoff = () =>
    executeTool("masil_create_local_handoff", {
      seenRevision: sessionRef.current.revision,
    });

  const setProviderStatus = (status: ProviderStatus) => {
    const next = updateSession((current) => ({
      ...current,
      revision: current.revision + 1,
      caption:
        status === "accepted"
          ? "담당자가 오늘 오후 첫 전화를 맡았어요. 이제 원래 활동으로 돌아가도 돼요."
          : "담당자가 확인할 질문 하나를 남겼어요.",
      handoff: current.handoff
        ? { ...current.handoff, status }
        : current.handoff,
    }));
    addEvent(
      status === "accepted"
        ? `담당자가 첫 통화를 수락 · revision ${next.revision}`
        : `담당자가 추가 질문 표시 · revision ${next.revision}`,
      "human",
    );
  };

  const returnToActivity = () => executeTool("masil_return_to_activity", {});

  const reset = () => {
    worldTransitionRef.current?.cancel();
    cancelPendingJanggiAnimation();
    cancelPendingPersonJanggiMove();
    cameraRequestRef.current?.abort();
    cameraRequestRef.current = null;
    setCameraRequest(null);
    pendingCharacterChoiceRef.current?.reject(
      new Error("CHARACTER_CHOICE_CANCELLED"),
    );
    pendingCharacterChoiceRef.current = null;
    setCharacterRequest(null);
    sessionRef.current = INITIAL_SESSION;
    setSession(INITIAL_SESSION);
    setPresence("ready");
    setEvents([]);
  };

  const moveJanggiByPersonGesture = useCallback(
    async (
      pieceId: string,
      destination: JanggiGridPoint,
      spokenMove: string,
    ) => {
      await executeTool(
        "masil_move_janggi_piece",
        {
          action: "move",
          actor: "person",
          pieceId,
          toRow: destination.row,
          toCol: destination.col,
          spokenMove,
          personConfirmed: true,
        },
        "person",
      );
    },
    [executeTool],
  );

  const isHome = session.stage === "home";
  const keepsAgentSeed = session.stage === "activity";
  return (
    <main
      className="masil-shell relative min-h-[100svh] overflow-hidden bg-[#f7f4ed] text-[#171513]"
      data-testid="masil-flow-demo"
      data-stage={session.stage}
      data-activity={session.activity ?? "none"}
    >
      <MasilWorldTransition ref={worldTransitionRef} />
      {isHome ? (
        <GlassOrbScene mood="idle" presence={presence} mode="hero" />
      ) : null}
      {keepsAgentSeed ? (
        <GlassOrbScene
          mood={session.activity === "janggi" ? "janggi" : "ink"}
          presence={presence}
          mode="prompt"
        />
      ) : null}

      <header className="absolute inset-x-0 top-0 z-[70] flex h-[76px] items-center justify-between px-6 sm:px-10 lg:px-12">
        <button
          type="button"
          className="text-[0.8rem] font-semibold tracking-[0.42em] text-[#b85f47] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b65f49]/25 focus-visible:ring-offset-4"
          onClick={reset}
          aria-label={language === "ko" ? "MASIL 처음 화면" : "MASIL home"}
        >
          MASIL
        </button>

        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-4 text-[0.78rem]">
            {(["ko", "en"] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={`transition-colors ${
                  language === item
                    ? "font-semibold text-[#211e1b]"
                    : "text-[#8a837c] hover:text-[#4f4944]"
                }`}
                onClick={() => setLanguage(item)}
                aria-pressed={language === item}
              >
                {item === "ko" ? "한국어" : "English"}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="grid size-9 place-items-center text-[#756d67] transition-colors hover:text-[#211e1b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b65f49]/25"
            onClick={() => setLogsOpen(true)}
            aria-label={language === "ko" ? "WebMCP 실행 로그 열기" : "Open WebMCP activity log"}
            data-testid="open-event-log"
          >
            <PanelRightOpen aria-hidden="true" className="size-[1rem]" />
          </button>
        </div>
      </header>

      {isHome ? (
        <HomeScreen
          language={language}
          caption={session.caption}
          presence={presence}
        />
      ) : (
        <section
          className="masil-world-enter relative z-10 h-[100svh] pt-[76px]"
          data-testid={`stage-${session.stage}`}
        >
          <ActivityWorld
            activity={session.activity ?? "calligraphy"}
            cameraRequest={cameraRequest}
            characterRequest={characterRequest}
            language={language}
            session={session}
            onCharacterChoice={chooseCharacter}
            onCameraStateChange={handleCameraStateChange}
            onJanggiMoveAnimationComplete={completeJanggiAnimation}
            onJanggiPersonMove={moveJanggiByPersonGesture}
            onRequestCamera={requestCameraFromCanvas}
          />

          {session.stage === "activity" && !characterRequest ? (
            <AgentSceneCaption
              caption={session.caption}
              language={language}
              presence={presence}
            />
          ) : null}

          {session.stage !== "activity" ? (
            <SupportOverlay
              language={language}
              session={session}
              onClose={() => void returnToActivity()}
              onPrepare={() => void prepareReview()}
              onUpdateDisclosure={updateDisclosure}
              onConfirmDisclosure={confirmDisclosure}
              onConfirmAction={confirmAction}
              onCreateHandoff={() => void createHandoff()}
              onProviderStatus={setProviderStatus}
              onReturn={() => void returnToActivity()}
            />
          ) : null}

        </section>
      )}

      <EventLogDrawer
        events={events}
        language={language}
        onClose={() => setLogsOpen(false)}
        open={logsOpen}
        status={webMcpStatus}
        toolCount={toolDescriptors.length}
      />

    </main>
  );
}

function HomeScreen({
  language,
  caption,
  presence,
}: {
  language: Language;
  caption: string;
  presence: Presence;
}) {
  const headline =
    caption === INITIAL_SESSION.caption
      ? language === "ko"
        ? INITIAL_SESSION.caption
        : "What would you like\nto do together?"
      : caption;

  return (
    <section className="relative z-10 min-h-[100svh] px-5 pt-[76px] text-center sm:px-8">
      <div className="masil-copy-enter absolute inset-x-5 top-[54%] mx-auto flex -translate-y-1/2 flex-col items-center sm:inset-x-8 sm:top-[55%]">
        <h1 className="masil-balance max-w-[15ch] whitespace-pre-line text-[clamp(2.85rem,4.8vw,4.75rem)] leading-[1.04] font-medium tracking-[-0.07em] text-[#191715]">
          {headline}
        </h1>
        <AgentProjection language={language} presence={presence} />
      </div>
    </section>
  );
}

function ActivityWorld({
  activity,
  cameraRequest,
  characterRequest,
  language,
  session,
  onCameraStateChange,
  onCharacterChoice,
  onJanggiMoveAnimationComplete,
  onJanggiPersonMove,
  onRequestCamera,
}: {
  activity: Activity;
  cameraRequest: PendingCameraRequest | null;
  characterRequest: CharacterChoiceRequest | null;
  language: Language;
  session: DemoSession;
  onCameraStateChange: (
    state: "requesting" | "hand" | "fallback",
    reason?: string,
  ) => void;
  onCharacterChoice: (choice: CharacterChoice) => void;
  onJanggiMoveAnimationComplete: (moveId: string) => void;
  onJanggiPersonMove: (
    pieceId: string,
    destination: JanggiGridPoint,
    spokenMove: string,
  ) => Promise<void>;
  onRequestCamera: () => void;
}) {
  if (activity === "janggi") {
    return (
      <JanggiBoard
        activeMove={session.janggiActiveMove ?? null}
        game={session.janggiGame ?? createInitialJanggiGame()}
        language={language}
        moveState={session.janggiMove}
        onMoveAnimationComplete={onJanggiMoveAnimationComplete}
        onPersonMove={onJanggiPersonMove}
      />
    );
  }

  if (characterRequest || !session.calligraphy.character) {
    return (
      <CalligraphyCharacterPrompt
        language={language}
        request={
          characterRequest ?? {
            question:
              language === "ko"
                ? "어떤 글자를 써볼까요?"
                : "What shall we write?",
            choices: DEFAULT_CHARACTER_CHOICES,
          }
        }
        onChoose={onCharacterChoice}
      />
    );
  }

  return (
    <AirCalligraphyCanvas
      cameraRequest={cameraRequest}
      character={session.calligraphy.character}
      language={language}
      onCameraStateChange={onCameraStateChange}
      onRequestCamera={onRequestCamera}
      referenceImageAlt={session.calligraphy.referenceImageAlt}
      referenceImageUrl={session.calligraphy.referenceImageUrl ?? undefined}
    />
  );
}

function CalligraphyCharacterPrompt({
  language,
  request,
  onChoose,
}: {
  language: Language;
  request: CharacterChoiceRequest;
  onChoose: (choice: CharacterChoice) => void;
}) {
  return (
    <div className="relative grid h-full min-h-[calc(100svh-76px)] place-items-center overflow-hidden bg-transparent px-5 pb-10 text-center sm:px-8">
      <div className="masil-copy-enter relative z-10 mt-[5.5rem] flex w-full max-w-5xl flex-col items-center sm:mt-[6.5rem]">
        <h2 className="masil-balance max-w-[14ch] text-[clamp(2.75rem,5.5vw,5.35rem)] leading-[1.04] font-medium tracking-[-0.07em] text-[#191715]">
          {request.question}
        </h2>

        <div className="mt-12 flex w-full items-start justify-center gap-10 sm:mt-16 sm:gap-20">
          {request.choices.map((choice) => (
            <button
              key={`${choice.character}-${choice.label}`}
              type="button"
              className="group flex min-w-[4.75rem] flex-col items-center text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b65f49]/25 focus-visible:ring-offset-8"
              onClick={() => onChoose(choice)}
              data-testid={`choose-character-${choice.character}`}
              aria-label={`${choice.character} ${choice.label}${choice.meaning ? `, ${choice.meaning}` : ""}`}
            >
              <span
                className="text-[clamp(3.75rem,7.2vw,6.75rem)] leading-none text-[#9f4c38] transition duration-500 group-hover:-translate-y-1 group-hover:text-[#7f392b]"
                style={{
                  fontFamily:
                    "STKaiti, KaiTi, Kaiti SC, Noto Serif CJK KR, Noto Serif KR, serif",
                }}
              >
                {choice.character}
              </span>
              <span className="mt-5 border-t border-[#9f4c38]/18 pt-3">
                <span className="block text-[0.78rem] font-medium tracking-[-0.01em] text-[#6f6761] sm:text-[0.88rem]">
                  {choice.label}
                </span>
              </span>
            </button>
          ))}
        </div>

        <AgentProjection
          language={language}
          presence="awaiting"
          readyCopy={
            language === "ko"
              ? "다른 글자는 에이전트에게 말씀하세요"
              : "Tell your Agent if you want another character"
          }
        />
      </div>
    </div>
  );
}

function AgentProjection({
  caption,
  compact = false,
  language,
  presence,
  readyCopy,
}: {
  caption?: string;
  compact?: boolean;
  language: Language;
  presence: Presence;
  readyCopy?: string;
}) {
  const active = presence !== "ready" && presence !== "connected";
  const copy =
    caption ||
    (readyCopy ??
        (language === "ko"
          ? "에이전트에게 평소처럼 말씀하세요"
          : "Speak naturally to your Agent"));

  return (
    <div
      className={`${compact ? "mt-0" : "mt-10 sm:mt-12"} inline-flex max-w-[36rem] items-center justify-center gap-3 text-[#756d67]`}
      role="status"
      aria-live="polite"
    >
      <AudioWaveform
        aria-hidden="true"
        className={`size-[1.05rem] shrink-0 text-[#b65f49] ${active ? "animate-pulse" : "opacity-75"}`}
        strokeWidth={1.6}
      />
      <span className="masil-balance text-[0.9rem] leading-6 tracking-[-0.015em] sm:text-[0.96rem]">
        {copy}
      </span>
    </div>
  );
}

function AgentSceneCaption({
  caption,
  language,
  presence,
}: {
  caption: string;
  language: Language;
  presence: Presence;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-5 bottom-6 z-40 flex justify-center sm:bottom-8">
      <div className="bg-[#f7f4ed]/56 px-4 py-2 backdrop-blur-sm">
        <AgentProjection
          caption={caption}
          compact
          language={language}
          presence={presence}
        />
      </div>
    </div>
  );
}

function EventLogDrawer({
  events,
  language,
  onClose,
  open,
  status,
  toolCount,
}: {
  events: DemoEvent[];
  language: Language;
  onClose: () => void;
  open: boolean;
  status: WebMcpStatus;
  toolCount: number;
}) {
  return (
    <div
      className={`fixed inset-0 z-[100] transition ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        className={`absolute inset-0 bg-black/10 backdrop-blur-[2px] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-label={language === "ko" ? "로그 닫기" : "Close log"}
        tabIndex={open ? 0 : -1}
      />
      <aside
        className={`absolute inset-y-0 right-0 w-[min(92vw,25rem)] border-l border-black/[0.055] bg-[#faf7f1]/96 p-6 shadow-[-24px_0_70px_rgba(44,31,24,0.1)] backdrop-blur-2xl transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] ${open ? "translate-x-0" : "translate-x-full"}`}
        aria-label={language === "ko" ? "WebMCP 실행 로그" : "WebMCP activity log"}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[0.68rem] font-semibold tracking-[0.14em] text-[#a55340] uppercase">
              WebMCP
            </p>
            <h2 className="mt-1 text-xl font-medium tracking-[-0.04em]">
              {language === "ko" ? "실행 기록" : "Activity log"}
            </h2>
          </div>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full text-[#6f6761] hover:bg-black/[0.04]"
            onClick={onClose}
            aria-label={language === "ko" ? "로그 닫기" : "Close log"}
          >
            <PanelRightClose aria-hidden="true" className="size-[1.05rem]" />
          </button>
        </div>

        <div className="mt-7 flex items-center justify-between border-y border-black/[0.055] py-4 text-xs text-[#746c66]">
          <span className="inline-flex items-center gap-2">
            <span
              className={`size-2 rounded-full ${
                status === "connected"
                  ? "bg-emerald-600"
                  : status === "error"
                    ? "bg-red-600"
                    : "bg-[#b65f49]"
              }`}
            />
            {status === "connected" ? "LIVE" : "LOCAL DEMO"}
          </span>
          <span>1 USER AGENT · {toolCount} tools</span>
        </div>

        <div className="mt-6 space-y-1">
          {events.length ? (
            events.map((event) => (
              <div
                key={event.id}
                data-event-source={event.source}
                className="flex items-start gap-3 rounded-xl px-2 py-3"
              >
                <ActivityIcon
                  aria-hidden="true"
                  className={`mt-0.5 size-4 shrink-0 ${
                    event.status === "failed"
                      ? "text-red-600"
                      : event.status === "human"
                        ? "text-[#a55340]"
                        : event.status === "done"
                          ? "text-emerald-600"
                          : "animate-pulse text-[#a55340]"
                  }`}
                />
                <div>
                  <p className="text-sm leading-5 text-[#393430]">{event.label}</p>
                  <p className="mt-1 text-[0.66rem] tracking-[0.08em] text-[#918983] uppercase">
                    {event.source === "webmcp" ? "WEBMCP" : "PERSON"} · {event.status}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="px-2 py-8 text-sm leading-6 text-[#817973]">
              {language === "ko"
                ? "아직 실행된 도구가 없어요. 활동을 시작하면 여기에만 기록됩니다."
                : "No tools have run yet. Activity will appear only here."}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function SupportOverlay({
  language,
  session,
  onClose,
  onPrepare,
  onUpdateDisclosure,
  onConfirmDisclosure,
  onConfirmAction,
  onCreateHandoff,
  onProviderStatus,
  onReturn,
}: {
  language: Language;
  session: DemoSession;
  onClose: () => void;
  onPrepare: () => void;
  onUpdateDisclosure: (value: string) => void;
  onConfirmDisclosure: () => void;
  onConfirmAction: () => void;
  onCreateHandoff: () => void;
  onProviderStatus: (status: ProviderStatus) => void;
  onReturn: () => void;
}) {
  const support = session.support;
  const handoff = session.handoff;
  const wide = session.stage === "handoff";

  return (
    <div className="absolute inset-x-0 bottom-0 top-[72px] z-50 flex items-end justify-center bg-[#2e241e]/16 p-3 pb-24 backdrop-blur-[4px] sm:items-center sm:p-6 sm:pb-24">
      <aside
        className={`masil-support-panel max-h-[calc(100svh-178px)] w-full overflow-y-auto rounded-[1.8rem] border border-white/70 bg-[#fbf9f4]/96 shadow-[0_32px_110px_rgba(40,28,21,0.24)] backdrop-blur-2xl ${
          wide ? "max-w-[1040px]" : "max-w-[610px]"
        }`}
        data-testid={`support-${session.stage}`}
      >
        {session.stage === "private" && support ? (
          <div className="p-5 sm:p-8">
            <PanelEyebrow
              icon={LockKeyhole}
              label={language === "ko" ? "비공개 대화" : "Private conversation"}
            />
            <h2 className="mt-5 text-2xl font-medium tracking-[-0.045em] sm:text-3xl">
              {language === "ko"
                ? "제가 이렇게 이해했어요. 맞나요?"
                : "Here is what I understood. Is it right?"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#716963]">
              {language === "ko"
                ? "평소 대화에서 몰래 뽑아낸 정보가 아닙니다. 방금 어르신이 도움을 요청해서 열린 메모예요."
                : "This was not inferred secretly. It opened only after your explicit request for help."}
            </p>

            <div className="mt-6 space-y-3">
              <SummaryBlock
                label={language === "ko" ? "지금 겪는 일" : "What happened"}
                value={support.summary}
              />
              <SummaryBlock
                label={language === "ko" ? "원하는 결과" : "What you want"}
                value={support.desiredOutcome}
              />
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-black/[0.06] pt-5 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                className="h-11 rounded-full px-4 text-[#6f6761]"
                onClick={onClose}
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                {language === "ko" ? "그냥 더 이야기할래" : "Just keep talking"}
              </Button>
              <Button
                type="button"
                className="h-11 rounded-full bg-[#1d1a18] px-5 text-[#fbf7f1] hover:bg-[#1d1a18]/90"
                onClick={onPrepare}
                data-testid="prepare-review"
              >
                {language === "ko" ? "사람 도움을 알아봐줘" : "Show me human help"}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}

        {session.stage === "review" && support ? (
          <div className="p-5 sm:p-8">
            <PanelEyebrow
              icon={ShieldCheck}
              label={language === "ko" ? "당사자 확인" : "Person review"}
            />
            <h2 className="mt-5 text-2xl font-medium tracking-[-0.045em] sm:text-3xl">
              {language === "ko"
                ? "보일 말과 실제 행동을 따로 확인해요."
                : "Confirm the words and the action separately."}
            </h2>

            <div className="mt-6 grid gap-3 sm:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl bg-[#1d1a18] p-5 text-[#fbf7f1]">
                <p className="text-[0.64rem] tracking-[0.13em] text-white/48 uppercase">
                  {language === "ko" ? "현재 가능한 창구" : "Available route"}
                </p>
                <p className="mt-2 text-lg font-medium">
                  {language === "ko"
                    ? "주민센터 복지 상담 창구"
                    : "Community welfare desk"}
                </p>
                <p className="mt-3 text-xs leading-5 text-white/58">
                  {language === "ko"
                    ? "오늘 오후 4시 30분 · 생활지원 매니저가 먼저 전화"
                    : "4:30 PM today · support manager calls first"}
                </p>
                <p className="mt-5 flex items-start gap-2 border-t border-white/10 pt-4 text-xs leading-5 text-white/52">
                  <Workflow aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  {language === "ko"
                    ? "MASIL 제공자가 Agent에게 실제 가능한 창구·시간·입력 형식을 구조적으로 알려줍니다."
                    : "MASIL declares the available route, time, and input shape directly to the Agent."}
                </p>
              </div>

              <label className="rounded-2xl border border-black/[0.07] bg-white/55 p-4">
                <span className="text-[0.64rem] font-semibold tracking-[0.12em] text-[#92503f] uppercase">
                  {language === "ko" ? "보이는 문장 전부" : "Everything shared"}
                </span>
                <textarea
                  className="mt-3 min-h-28 w-full resize-none rounded-xl border border-black/[0.08] bg-[#fbf9f4] p-3 text-sm leading-6 outline-none transition focus:border-[#b65f49]/40 focus:ring-2 focus:ring-[#b65f49]/12"
                  value={support.minimumDisclosure}
                  onChange={(event) => onUpdateDisclosure(event.target.value)}
                  aria-label={
                    language === "ko" ? "공개할 문장 수정" : "Edit shared sentence"
                  }
                />
                <span className="mt-2 block text-xs leading-5 text-[#7b736d]">
                  {language === "ko"
                    ? "수정하면 이전 확인은 자동으로 취소됩니다."
                    : "Editing invalidates earlier confirmations."}
                </span>
              </label>
            </div>

            <div className="mt-4 space-y-2.5">
              <ConfirmationRow
                checked={support.disclosureConfirmed}
                disabled={support.disclosureConfirmed}
                onClick={onConfirmDisclosure}
                title={
                  language === "ko"
                    ? "이 문장만 보여줘도 괜찮아요"
                    : "You may share only this sentence"
                }
                description={language === "ko" ? "공개 내용 확인" : "Confirm words"}
              />
              <ConfirmationRow
                checked={support.actionConfirmed}
                disabled={
                  !support.disclosureConfirmed || support.actionConfirmed
                }
                onClick={onConfirmAction}
                title={
                  language === "ko"
                    ? "로컬 담당자 작업 카드를 만들어 주세요"
                    : "Create a local staff work card"
                }
                description={language === "ko" ? "행동 확인" : "Confirm action"}
              />
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                className="h-11 rounded-full px-4 text-[#6f6761]"
                onClick={onClose}
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                {language === "ko" ? "아무것도 만들지 않기" : "Create nothing"}
              </Button>
              <Button
                type="button"
                className="h-11 rounded-full bg-[#b65f49] px-5 text-white hover:bg-[#a6523f] disabled:bg-[#bdb3ac]"
                disabled={
                  !support.disclosureConfirmed || !support.actionConfirmed
                }
                onClick={onCreateHandoff}
                data-testid="create-handoff"
              >
                {language === "ko" ? "확인한 내용으로 연결" : "Connect with confirmed details"}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}

        {session.stage === "handoff" && support && handoff ? (
          <div className="grid lg:grid-cols-[0.88fr_1.12fr]">
            <div className="border-b border-black/[0.06] p-5 sm:p-8 lg:border-b-0 lg:border-r">
              <PanelEyebrow
                icon={PhoneCall}
                label={language === "ko" ? "어르신 화면" : "Person view"}
                tone="green"
              />
              <h2 className="mt-5 text-2xl font-medium tracking-[-0.045em] sm:text-3xl">
                {handoff.status === "accepted"
                  ? language === "ko"
                    ? "오늘 첫 전화를 맡을 사람이 정해졌어요."
                    : "Someone now owns the first call today."
                  : language === "ko"
                    ? "담당자가 볼 작업 카드가 준비됐어요."
                    : "A staff work card is ready."}
              </h2>
              <div className="mt-6 space-y-3 rounded-2xl border border-black/[0.065] bg-white/55 p-5">
                <ResultRow
                  label={language === "ko" ? "상태" : "Status"}
                  value={
                    handoff.status === "accepted"
                      ? language === "ko"
                        ? "첫 전화 수락"
                        : "First call accepted"
                      : handoff.status === "needs-info"
                        ? language === "ko"
                          ? "질문 1개 확인 필요"
                          : "One question needed"
                        : language === "ko"
                          ? "담당자 확인 대기"
                          : "Waiting for staff"
                  }
                />
                <ResultRow
                  label={language === "ko" ? "담당자" : "Owner"}
                  value={handoff.owner}
                />
                <ResultRow
                  label={language === "ko" ? "예정" : "Time"}
                  value={handoff.callbackAt}
                />
                <ResultRow
                  label={language === "ko" ? "번호" : "ID"}
                  value={handoff.id}
                  mono
                />
              </div>
              <div className="mt-4 flex items-start gap-2 rounded-2xl bg-[#e7f0e8] p-4 text-sm leading-6 text-[#295238]">
                <ShieldCheck
                  aria-hidden="true"
                  className="mt-1 size-4 shrink-0"
                />
                <p>
                  {language === "ko"
                    ? "해커톤 로컬 데모입니다. 외부 기관 전송이나 실제 민원 생성은 전혀 일어나지 않았어요."
                    : "This is a local hackathon demo. Nothing was sent and no real case was created."}
                </p>
              </div>

              <Button
                type="button"
                className="mt-5 h-11 w-full rounded-full bg-[#1d1a18] text-[#fbf7f1] hover:bg-[#1d1a18]/90"
                onClick={onReturn}
                data-testid="return-to-activity"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                {session.activity === "calligraphy"
                  ? language === "ko"
                    ? "서예로 돌아가기"
                    : "Return to calligraphy"
                  : language === "ko"
                    ? "장기로 돌아가기"
                    : "Return to janggi"}
              </Button>
            </div>

            <div className="bg-[#f0ebe3] p-5 sm:p-8">
              <PanelEyebrow
                icon={UserRoundCheck}
                label={language === "ko" ? "담당자 화면 · 데모" : "Staff view · demo"}
              />
              <div className="mt-5 flex items-start justify-between gap-5">
                <div>
                  <h3 className="text-xl font-medium tracking-[-0.035em]">
                    {language === "ko"
                      ? "처음부터 다시 듣지 않아도 되는 작업 카드"
                      : "A work card without starting the story over"}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#716963]">
                    {language === "ko"
                      ? "Agent가 대화를 요약한 것이 아니라, 당사자가 직접 확인한 최소 내용만 도착합니다."
                      : "This contains only the minimum details the person reviewed—not a hidden transcript summary."}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#dcd3c8] px-3 py-1.5 text-[0.65rem] font-semibold text-[#655c55]">
                  LOCAL ONLY
                </span>
              </div>

              <div className="mt-5 rounded-2xl bg-[#fbf9f4] p-5 shadow-[0_12px_40px_rgba(52,36,27,0.06)]">
                <WorkItem
                  label={language === "ko" ? "당사자가 확인한 말" : "Confirmed words"}
                  value={support.minimumDisclosure}
                />
                <WorkItem
                  label={language === "ko" ? "원하는 결과" : "Desired result"}
                  value={support.desiredOutcome}
                />
                <WorkItem
                  label={language === "ko" ? "선호 연락 방식" : "Contact preference"}
                  value={
                    language === "ko"
                      ? "방문 전, 오늘 오후 전화"
                      : "Phone first this afternoon"
                  }
                />
                <WorkItem
                  label={language === "ko" ? "첫 업무" : "First task"}
                  value={handoff.firstStep}
                  last
                />
              </div>

              {handoff.status === "accepted" ? (
                <div className="masil-confirm-ready mt-4 flex items-start gap-3 rounded-2xl bg-[#dfece2] p-4 text-[#285238]">
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0"
                  />
                  <div>
                    <p className="text-sm font-semibold">
                      {language === "ko"
                        ? "김하늘 매니저가 첫 전화를 수락했습니다."
                        : "Kim Haneul accepted the first call."}
                    </p>
                    <p className="mt-1 text-xs leading-5 opacity-75">
                      {language === "ko"
                        ? "이 상태는 WebMCP로 다시 읽혀 어르신 화면에도 같은 결과가 보입니다."
                        : "WebMCP exposes the same status back to the person's screen."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-full border-black/10 bg-white/45 px-4 shadow-none"
                    onClick={() => onProviderStatus("needs-info")}
                  >
                    <MessageCircle aria-hidden="true" className="size-4" />
                    {language === "ko" ? "질문 1개 요청" : "Ask one question"}
                  </Button>
                  <Button
                    type="button"
                    className="h-11 rounded-full bg-[#b65f49] px-5 text-white hover:bg-[#a6523f]"
                    onClick={() => onProviderStatus("accepted")}
                    data-testid="provider-accept"
                  >
                    <Check aria-hidden="true" className="size-4" />
                    {language === "ko" ? "첫 전화 수락" : "Accept first call"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function PanelEyebrow({
  icon: Icon,
  label,
  tone = "terracotta",
}: {
  icon: typeof LockKeyhole;
  label: string;
  tone?: "terracotta" | "green";
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.66rem] font-semibold tracking-[0.1em] uppercase ${
        tone === "green"
          ? "bg-[#dfece2] text-[#2e6840]"
          : "bg-[#ead9cf] text-[#934936]"
      }`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </div>
  );
}

function SummaryBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/[0.065] bg-white/55 p-4">
      <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-[#8b827b] uppercase">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-[#37322e]">{value}</p>
    </div>
  );
}

function ConfirmationRow({
  checked,
  disabled,
  onClick,
  title,
  description,
}: {
  checked: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b65f49]/35 disabled:cursor-default ${
        checked
          ? "border-emerald-700/15 bg-emerald-50"
          : disabled
            ? "border-black/[0.05] bg-black/[0.025] opacity-45"
            : "border-black/[0.08] bg-white/62 hover:border-[#b65f49]/20"
      }`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={checked}
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-full ${
          checked
            ? "bg-emerald-700 text-white"
            : "border border-black/10 bg-[#fbf9f4] text-transparent"
        }`}
      >
        <Check aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-[0.68rem] text-[#807871]">
          {description}
        </span>
      </span>
    </button>
  );
}

function ResultRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-black/[0.055] pb-3 last:border-0 last:pb-0">
      <span className="text-xs text-[#807871]">{label}</span>
      <span
        className={`max-w-[70%] text-right text-sm font-medium ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function WorkItem({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div className={last ? "" : "mb-4 border-b border-black/[0.06] pb-4"}>
      <p className="text-[0.63rem] font-semibold tracking-[0.11em] text-[#928981] uppercase">
        {label}
      </p>
      <p className="mt-1.5 text-sm leading-6 text-[#3d3733]">{value}</p>
    </div>
  );
}
