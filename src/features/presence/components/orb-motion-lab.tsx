"use client";

import { ArrowLeft, Pause, Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  GlassOrbScene,
  type OrbForm,
  type OrbLayoutMode,
  type OrbMood,
  type OrbPresence,
  type OrbReactionKind,
} from "./glass-orb-scene";

type MotionSample = {
  id: string;
  index: string;
  group: string;
  title: string;
  tabLabel: string;
  description: string;
  presence: OrbPresence;
  mood: OrbMood;
  mode: OrbLayoutMode;
  form?: OrbForm;
  reaction?: OrbReactionKind;
  calligraphyWriting?: boolean;
  durationMs: number;
};

type LabLanguage = "ko" | "en";
type MotionSampleCopy = Pick<
  MotionSample,
  "group" | "title" | "tabLabel" | "description"
>;

const MOTION_SAMPLES: readonly MotionSample[] = [
  {
    id: "ready",
    index: "01",
    group: "기본",
    title: "살아 있는 호흡",
    tabLabel: "호흡",
    description: "멈춰 있지 않고, 표면과 중심이 서로 다른 박자로 천천히 숨 쉽니다.",
    presence: "ready",
    mood: "idle",
    mode: "hero",
    durationMs: 5600,
  },
  {
    id: "listening",
    index: "02",
    group: "대화",
    title: "귀 기울이기",
    tabLabel: "듣기",
    description: "사용자 쪽으로 몸을 기울이며 길게 팽창해 말이 끝나기를 기다립니다.",
    presence: "listening",
    mood: "idle",
    mode: "hero",
    durationMs: 5000,
  },
  {
    id: "receiving",
    index: "03",
    group: "WebMCP",
    title: "요청 받기",
    tabLabel: "요청 수신",
    description: "빠른 잔물결과 그 아래의 느린 조류가 서로 다른 방향으로 지나갑니다.",
    presence: "receiving",
    mood: "idle",
    mode: "hero",
    durationMs: 5000,
  },
  {
    id: "creating",
    index: "04",
    group: "WebMCP",
    title: "공간 만들기",
    tabLabel: "공간 생성",
    description: "안쪽 흐름이 크게 순환하며 다음 화면을 빚는 에너지를 드러냅니다.",
    presence: "creating",
    mood: "idle",
    mode: "hero",
    durationMs: 5200,
  },
  {
    id: "speaking",
    index: "05",
    group: "대화",
    title: "말하기",
    tabLabel: "말하기",
    description: "한쪽에서 시작한 압력파가 몸을 가로지르며 발화 리듬을 밀어냅니다.",
    presence: "speaking",
    mood: "idle",
    mode: "hero",
    durationMs: 5000,
  },
  {
    id: "awaiting",
    index: "06",
    group: "대화",
    title: "확인 기다리기",
    tabLabel: "확인 대기",
    description: "움직임을 낮추되 완전히 멈추지 않고, 조심스럽게 다음 선택을 지켜봅니다.",
    presence: "awaiting",
    mood: "idle",
    mode: "hero",
    durationMs: 5000,
  },
  {
    id: "transition",
    index: "07",
    group: "화면",
    title: "화면 사이 흐르기",
    tabLabel: "화면 전환",
    description: "같은 오브가 끊기지 않은 채 늘어나고 흘러서 활동 위치로 이동합니다.",
    presence: "creating",
    mood: "idle",
    mode: "hero",
    durationMs: 5200,
  },
  {
    id: "calligraphy-choice",
    index: "08",
    group: "서예",
    title: "글자 고르는 물방울",
    tabLabel: "서예 유체",
    description: "제자리에서 몸 전체를 가로지르는 먹물 파동으로 서예의 시작을 알립니다.",
    presence: "awaiting",
    mood: "ink",
    mode: "calligraphy-choice",
    durationMs: 7200,
  },
  {
    id: "calligraphy-writing",
    index: "09",
    group: "서예",
    title: "붓글씨 곁 지키기",
    tabLabel: "서예 동행",
    description: "필기 공간을 가리지 않는 작은 몸으로 돌아가 잔잔하게 함께 머뭅니다.",
    presence: "ready",
    mood: "ink",
    mode: "prompt",
    calligraphyWriting: true,
    durationMs: 5000,
  },
  {
    id: "connected",
    index: "10",
    group: "WebMCP",
    title: "연결 결과가 맺힐 때",
    tabLabel: "연결 완료",
    description: "빠른 움직임을 풀고, 아래에서 위로 오르는 한 줄기 흐름으로 안정됩니다.",
    presence: "connected",
    mood: "idle",
    mode: "hero",
    durationMs: 5000,
  },
  {
    id: "janggi-recoil",
    index: "11",
    group: "장기",
    title: "Agent 말이 잡혔을 때",
    tabLabel: "Agent 말 사망",
    description: "순간 움츠러든 뒤 몸 전체가 짧게 부르르 떨며 충격을 흘려보냅니다.",
    presence: "ready",
    mood: "janggi",
    mode: "prompt",
    reaction: "recoil",
    durationMs: 4200,
  },
  {
    id: "janggi-celebrate",
    index: "12",
    group: "장기",
    title: "사용자 말이 잡혔을 때",
    tabLabel: "사용자 말 사망",
    description: "위로 통통 뛰며 몇 번 울렁여 Agent의 기쁜 반응을 보여줍니다.",
    presence: "ready",
    mood: "janggi",
    mode: "prompt",
    reaction: "celebrate",
    durationMs: 4600,
  },
] as const;

const MOTION_SAMPLE_COPY_EN: Record<MotionSample["id"], MotionSampleCopy> = {
  ready: {
    group: "Foundation",
    title: "Living breath",
    tabLabel: "Breathing",
    description:
      "Its surface and center breathe at different, gentle rhythms instead of standing still.",
  },
  listening: {
    group: "Conversation",
    title: "Leaning in",
    tabLabel: "Listening",
    description:
      "It leans toward the person and lengthens while waiting for them to finish.",
  },
  receiving: {
    group: "WebMCP",
    title: "Receiving a request",
    tabLabel: "Receiving",
    description:
      "Quick ripples and a slower current pass through it in different directions.",
  },
  creating: {
    group: "WebMCP",
    title: "Shaping a space",
    tabLabel: "Creating",
    description:
      "A broad inner current circles through the Orb as it shapes the next screen.",
  },
  speaking: {
    group: "Conversation",
    title: "Speaking",
    tabLabel: "Speaking",
    description:
      "A pressure wave crosses its body to carry the rhythm of speech.",
  },
  awaiting: {
    group: "Conversation",
    title: "Waiting for confirmation",
    tabLabel: "Awaiting",
    description:
      "Its movement quiets without stopping as it watches for the next choice.",
  },
  transition: {
    group: "Screen",
    title: "Flowing between screens",
    tabLabel: "Transition",
    description:
      "The same Orb stretches and flows into its activity position without breaking continuity.",
  },
  "calligraphy-choice": {
    group: "Calligraphy",
    title: "Choosing-text droplet",
    tabLabel: "Ink current",
    description:
      "An ink-like wave travels through its whole body to open the calligraphy experience.",
  },
  "calligraphy-writing": {
    group: "Calligraphy",
    title: "Staying beside the brush",
    tabLabel: "Writing companion",
    description:
      "It settles into a smaller body beside the work without covering the writing space.",
  },
  connected: {
    group: "WebMCP",
    title: "Connection taking shape",
    tabLabel: "Connected",
    description:
      "Fast motion releases into one rising current as the result settles.",
  },
  "janggi-recoil": {
    group: "Janggi",
    title: "When an Agent piece is captured",
    tabLabel: "Agent capture",
    description:
      "It contracts on impact, then lets the shock pass through its whole body in a brief shiver.",
  },
  "janggi-celebrate": {
    group: "Janggi",
    title: "When a person’s piece is captured",
    tabLabel: "Person capture",
    description:
      "It bounces upward and wobbles with the Agent’s delighted reaction.",
  },
};

export function OrbMotionLab() {
  const [language, setLanguage] = useState<LabLanguage>("ko");
  const [activeIndex, setActiveIndex] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [replayVersion, setReplayVersion] = useState(0);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const transitionProgressRef = useRef(0);
  const replayTransitionRef = useRef(false);
  const activeSample = MOTION_SAMPLES[activeIndex];
  const activeCopy =
    language === "ko" ? activeSample : MOTION_SAMPLE_COPY_EN[activeSample.id];

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("masil.language");
      if (stored === "ko" || stored === "en") {
        queueMicrotask(() => setLanguage(stored));
      }
    } catch {
      // The lab remains usable in Korean when storage is unavailable.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title =
      language === "ko" ? "MASIL — 오브 동작 연구실" : "MASIL — Orb motion lab";
  }, [language]);

  useEffect(() => {
    if (!autoAdvance) return;
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % MOTION_SAMPLES.length);
      setReplayVersion((current) => current + 1);
    }, activeSample.durationMs);
    return () => window.clearTimeout(timer);
  }, [activeSample.durationMs, activeIndex, autoAdvance]);

  useEffect(() => {
    let frame = 0;
    let cancelled = false;
    const shouldReplayTransition =
      activeSample.id === "transition" && replayTransitionRef.current;
    replayTransitionRef.current = false;

    const updateProgress = (value: number) => {
      transitionProgressRef.current = value;
      setTransitionProgress(value);
    };

    const animateTo = (target: 0 | 1, fullDurationMs: number) =>
      new Promise<void>((resolve) => {
        const start = transitionProgressRef.current;
        const distance = Math.abs(target - start);
        if (distance < 0.001) {
          updateProgress(target);
          resolve();
          return;
        }

        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        if (reducedMotion) {
          updateProgress(target);
          resolve();
          return;
        }

        const startedAt = performance.now();
        const duration = Math.max(240, fullDurationMs * distance);
        const animate = (now: number) => {
          if (cancelled) {
            resolve();
            return;
          }
          const rawProgress = Math.min(1, (now - startedAt) / duration);
          const easedProgress =
            rawProgress * rawProgress * (3 - 2 * rawProgress);
          updateProgress(start + (target - start) * easedProgress);
          if (rawProgress < 1) {
            frame = window.requestAnimationFrame(animate);
          } else {
            resolve();
          }
        };
        frame = window.requestAnimationFrame(animate);
      });

    const runTransition = async () => {
      if (shouldReplayTransition) {
        await animateTo(0, 1280);
        if (cancelled) return;
      }
      await animateTo(
        activeSample.id === "transition" ? 1 : 0,
        activeSample.id === "transition" ? 2600 : 1480,
      );
    };

    void runTransition();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [activeSample.id, replayVersion]);

  const reaction = useMemo(
    () =>
      activeSample.reaction
        ? {
            id: `${activeSample.id}:${replayVersion}`,
            kind: activeSample.reaction,
          }
        : null,
    [activeSample.id, activeSample.reaction, replayVersion],
  );

  const selectSample = (index: number) => {
    setActiveIndex(index);
    setReplayVersion((current) => current + 1);
  };

  const replay = () => {
    if (activeSample.id === "transition") {
      replayTransitionRef.current = true;
    }
    setReplayVersion((current) => current + 1);
  };

  return (
    <main className="masil-shell relative min-h-[100svh] overflow-x-hidden bg-[#f7f4ed] text-[#171513]">
      <GlassOrbScene
        calligraphyWriting={activeSample.calligraphyWriting}
        connected
        form={activeSample.form ?? "body"}
        language={language}
        mood={activeSample.mood}
        presence={activeSample.presence}
        reaction={reaction}
        mode={activeSample.mode}
        showcase
        transitionTargetMode="prompt"
        transitionProgress={transitionProgress}
      />

      <header className="relative z-[120] flex h-[76px] items-center justify-between px-6 sm:px-10 lg:px-12">
        <Link
          href="/"
          className="group inline-flex items-center gap-3 text-[0.72rem] font-semibold tracking-[0.3em] text-[#b85f47] outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-[#b65f49]/25 focus-visible:ring-offset-4"
        >
          <ArrowLeft
            aria-hidden="true"
            className="size-3.5 transition-transform group-hover:-translate-x-0.5"
            strokeWidth={1.7}
          />
          MASIL
        </Link>
        <p className="text-[0.66rem] font-medium tracking-[0.22em] text-[#716963]">
          ORB MOTION LAB
        </p>
      </header>

      <section className="relative z-[110] mx-auto flex min-h-[calc(100svh-76px)] max-w-[1120px] flex-col justify-end px-5 pb-7 sm:px-8 sm:pb-9 lg:px-10">
        <div className="mx-auto mb-7 w-full max-w-[660px] text-center sm:mb-9">
          <p className="mb-3 text-[0.68rem] font-semibold tracking-[0.24em] text-[#b65f49]">
            {activeCopy.group} · {activeSample.index} / {MOTION_SAMPLES.length}
          </p>
          <h1 className="masil-balance text-[clamp(1.65rem,4vw,2.65rem)] font-medium tracking-[-0.045em]">
            {activeCopy.title}
          </h1>
          <p className="masil-balance mx-auto mt-3 max-w-[560px] text-[0.88rem] leading-6 text-[#716963] sm:text-[0.94rem] sm:leading-7">
            {activeCopy.description}
          </p>
        </div>

        <div className="rounded-[1.5rem] border border-black/[0.055] bg-white/45 p-2.5 shadow-[0_22px_70px_rgb(95_55_39_/_0.07)] backdrop-blur-xl sm:rounded-[1.75rem] sm:p-3">
          <div className="flex items-center justify-between gap-3 px-2 pb-2.5 sm:px-3 sm:pb-3">
            <p className="text-[0.67rem] font-medium tracking-[0.08em] text-[#716963]">
              {language === "ko"
                ? "동작은 확대 · 화면 전환은 실제 비율"
                : "Motion enlarged · transitions shown at actual scale"}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAutoAdvance((current) => !current)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-black/[0.06] bg-white/65 px-3 text-[0.68rem] font-medium text-[#4f4944] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b65f49]/25"
                aria-pressed={autoAdvance}
              >
                {autoAdvance ? (
                  <Pause aria-hidden="true" className="size-3" strokeWidth={1.8} />
                ) : (
                  <Play aria-hidden="true" className="size-3" strokeWidth={1.8} />
                )}
                {language === "ko"
                  ? autoAdvance
                    ? "자동 넘김 멈춤"
                    : "자동 넘김 시작"
                  : autoAdvance
                    ? "Pause auto-play"
                    : "Start auto-play"}
              </button>
              <button
                type="button"
                onClick={replay}
                className="grid size-8 place-items-center rounded-full border border-black/[0.06] bg-white/65 text-[#4f4944] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b65f49]/25"
                aria-label={
                  language === "ko" ? "현재 동작 다시 보기" : "Replay motion"
                }
                title={language === "ko" ? "현재 동작 다시 보기" : "Replay motion"}
              >
                <RotateCcw aria-hidden="true" className="size-3.5" strokeWidth={1.7} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
            {MOTION_SAMPLES.map((sample, index) => {
              const isActive = index === activeIndex;
              const copy =
                language === "ko" ? sample : MOTION_SAMPLE_COPY_EN[sample.id];
              return (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => selectSample(index)}
                  className={`relative min-h-[3.7rem] overflow-hidden rounded-[1rem] px-3 py-2.5 text-left outline-none transition-[background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-[#b65f49]/25 ${
                    isActive
                      ? "bg-[#b65f49] text-white shadow-[0_8px_22px_rgb(145_69_48_/_0.18)]"
                      : "bg-[#f7f4ed]/75 text-[#4f4944] hover:bg-white"
                  }`}
                  aria-current={isActive ? "true" : undefined}
                >
                  <span
                    className={`block text-[0.58rem] font-semibold tracking-[0.12em] ${
                      isActive ? "text-white/65" : "text-[#9a8f87]"
                    }`}
                  >
                    {sample.index} · {copy.group}
                  </span>
                  <span className="mt-1 block text-[0.72rem] font-medium tracking-[-0.015em] sm:text-[0.75rem]">
                    {copy.tabLabel}
                  </span>
                  {isActive && autoAdvance ? (
                    <span
                      key={`${sample.id}:${replayVersion}`}
                      className="masil-motion-progress absolute inset-x-0 bottom-0 h-[2px] origin-left bg-white/75"
                      style={{ animationDuration: `${sample.durationMs}ms` }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
