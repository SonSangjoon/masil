"use client";

import { Camera, CameraOff, Hand, MousePointer2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { PendingCameraRequest } from "@/features/calligraphy/runtime/camera-source";
import { CameraUnavailableError } from "@/features/calligraphy/runtime/camera-source";
import {
  createCameraRenderer,
  type CameraRenderer,
} from "@/features/calligraphy/runtime/ort-runtime";
import {
  createPointerRenderer,
  type PointerRenderer,
} from "@/features/calligraphy/runtime/pointer-runtime";

type Language = "ko" | "en";
type InputMode = "idle" | "requesting" | "hand" | "fallback" | "error";

function referenceTextSize(characterCount: number) {
  if (characterCount <= 1) return "text-[clamp(16rem,36vw,40rem)]";
  if (characterCount === 2) return "text-[clamp(10rem,24vw,24rem)]";
  if (characterCount === 3) return "text-[clamp(7.5rem,18vw,17rem)]";
  return "text-[clamp(6rem,14vw,13rem)]";
}

function normalizedPoint(
  canvas: HTMLCanvasElement,
  event: React.PointerEvent<HTMLCanvasElement>,
) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  };
}

export function AirCalligraphyCanvas({
  cameraRequest = null,
  character,
  language,
  onCameraStateChange,
  onRequestCamera,
  referenceImageAlt,
  referenceImageId,
  referenceImageUrl,
}: {
  cameraRequest?: PendingCameraRequest | null;
  character: string;
  language: Language;
  onCameraStateChange?: (
    state: "requesting" | "hand" | "fallback",
    reason?: string,
  ) => void;
  onRequestCamera?: () => void;
  referenceImageAlt?: string;
  referenceImageId?: string;
  referenceImageUrl?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRendererRef = useRef<PointerRenderer | undefined>(undefined);
  const cameraRendererRef = useRef<CameraRenderer | undefined>(undefined);
  const [mode, setMode] = useState<InputMode>(
    cameraRequest ? "requesting" : "idle",
  );
  const [error, setError] = useState("");
  const [failedReferenceUrl, setFailedReferenceUrl] = useState<string>();

  const startPointerRenderer = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    pointerRendererRef.current?.dispose();
    const renderer = createPointerRenderer(canvas);
    pointerRendererRef.current = renderer;
    void renderer.ready.catch((reason: unknown) => {
      setError(
        language === "ko"
          ? "이 브라우저에서 WebGPU 붓을 열 수 없어요."
          : "The WebGPU brush could not start in this browser.",
      );
      setMode("error");
      console.error(reason);
    });
  }, [language]);

  useEffect(() => {
    let active = true;
    pointerRendererRef.current?.dispose();
    pointerRendererRef.current = undefined;
    cameraRendererRef.current?.dispose();
    cameraRendererRef.current = undefined;
    queueMicrotask(() => {
      if (active) setError("");
    });

    const fallBackToPointer = (message: string) => {
      if (!active) return;
      setError(message);
      setMode("fallback");
      onCameraStateChange?.("fallback", message);
      startPointerRenderer();
    };

    if (!cameraRequest) {
      queueMicrotask(() => {
        if (!active) return;
        setMode("idle");
      });
      return () => {
        active = false;
        pointerRendererRef.current?.dispose();
        pointerRendererRef.current = undefined;
      };
    }

    queueMicrotask(() => {
      if (!active) return;
      setMode("requesting");
      onCameraStateChange?.("requesting");
    });

    void cameraRequest.source
      .then(async (camera) => {
        if (!active) {
          camera.dispose();
          return;
        }
        const canvas = canvasRef.current;
        if (!canvas) {
          camera.dispose();
          return;
        }
        const renderer = createCameraRenderer({ canvas, camera });
        cameraRendererRef.current = renderer;
        await renderer.ready;
        if (!active) {
          renderer.dispose();
          return;
        }
        setMode("hand");
        onCameraStateChange?.("hand");
        void renderer.closed.catch((reason: unknown) => console.error(reason));
      })
      .catch((reason: unknown) => {
        if (!active) return;
        const denied =
          reason instanceof CameraUnavailableError && reason.reason === "denied";
        fallBackToPointer(
          language === "ko"
            ? denied
              ? "카메라 사용이 허용되지 않아 화면에 직접 쓸 수 있게 바꿨어요."
              : "손을 찾지 못해 화면에 직접 쓸 수 있게 바꿨어요."
            : denied
              ? "Camera access was declined, so direct drawing is ready."
              : "Hand tracking was unavailable, so direct drawing is ready.",
        );
      });

    return () => {
      active = false;
      pointerRendererRef.current?.dispose();
      pointerRendererRef.current = undefined;
      cameraRendererRef.current?.dispose();
      cameraRendererRef.current = undefined;
    };
  }, [cameraRequest, language, onCameraStateChange, startPointerRenderer]);

  const stopHands = () => {
    cameraRequest?.abort();
    cameraRendererRef.current?.dispose();
    cameraRendererRef.current = undefined;
    setMode("fallback");
    setError(
      language === "ko"
        ? "카메라를 껐어요. 화면에 직접 이어서 쓸 수 있어요."
        : "Camera off. You can continue directly on the screen.",
    );
    onCameraStateChange?.("fallback", "person-stopped-camera");
    startPointerRenderer();
  };

  const clear = () => {
    pointerRendererRef.current?.clear();
    cameraRendererRef.current?.clear();
  };

  const pointerActive = mode === "fallback" || mode === "error";

  return (
    <div className="relative h-full min-h-[520px] overflow-hidden bg-[#f8f4ed] lg:min-h-[660px]">
      <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center overflow-hidden">
        {referenceImageUrl && failedReferenceUrl !== referenceImageUrl ? (
          // The source can be a page-local blob URL created from WebMCP data.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={referenceImageId ?? referenceImageUrl}
            src={referenceImageUrl}
            alt={referenceImageAlt ?? `${character} 서예 글자본`}
            className="h-[72%] w-[88%] translate-y-[1%] select-none object-contain opacity-[0.16] grayscale contrast-125 mix-blend-multiply"
            draggable={false}
            onError={() => setFailedReferenceUrl(referenceImageUrl)}
          />
        ) : character ? (
          <span
            aria-hidden="true"
            className={`max-w-[92vw] translate-y-[2%] select-none whitespace-nowrap leading-none font-semibold tracking-[-0.08em] text-[#7d4638]/[0.055] ${referenceTextSize(character.length)}`}
            style={{
              fontFamily:
                "STKaiti, KaiTi, Kaiti SC, Noto Serif CJK KR, Noto Serif KR, serif",
            }}
          >
            {character}
          </span>
        ) : null}
      </div>

      <canvas
        ref={canvasRef}
        className={`relative z-0 block h-full min-h-[520px] w-full touch-none lg:min-h-[660px] ${
          pointerActive ? "cursor-crosshair" : "cursor-default"
        }`}
        aria-label={
          language === "ko"
            ? `${character} 글자를 공중의 손동작으로 쓰는 WebGPU 서예 공간`
            : `WebGPU air-calligraphy space for writing ${character}`
        }
        onPointerDown={(event) => {
          if (!pointerActive) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pointerRendererRef.current?.begin(
            normalizedPoint(event.currentTarget, event),
          );
        }}
        onPointerMove={(event) => {
          if (!pointerActive) return;
          pointerRendererRef.current?.move(
            normalizedPoint(event.currentTarget, event),
          );
        }}
        onPointerUp={(event) => {
          if (!pointerActive) return;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          pointerRendererRef.current?.end();
        }}
        onPointerCancel={() => pointerRendererRef.current?.end()}
      />

      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 p-5 sm:p-7">
        <div className="inline-flex h-10 items-center gap-2 text-xs font-medium text-[#5f5852] sm:text-sm">
          {mode === "idle" || mode === "requesting" ? (
            <Camera aria-hidden="true" className="size-4 animate-pulse text-[#b75e49]" />
          ) : mode === "hand" ? (
            <Hand aria-hidden="true" className="size-4 text-[#b75e49]" />
          ) : (
            <MousePointer2 aria-hidden="true" className="size-4 text-[#b75e49]" />
          )}
          {language === "ko"
            ? mode === "idle"
              ? "공중 쓰기 준비"
              : mode === "requesting"
              ? "카메라를 여는 중"
              : mode === "hand"
                ? "공중에서 쓰는 중"
                : "화면에 직접 쓰는 중"
            : mode === "idle"
              ? "Ready for air writing"
              : mode === "requesting"
              ? "Opening camera"
              : mode === "hand"
                ? "Writing in the air"
                : "Drawing on screen"}
        </div>

        <div className="flex items-center gap-2">
          {mode === "hand" || mode === "requesting" ? (
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              className="size-10 rounded-full border-transparent bg-transparent shadow-none hover:bg-black/[0.035]"
              onClick={stopHands}
              aria-label={language === "ko" ? "카메라 끄기" : "Turn camera off"}
            >
              <CameraOff aria-hidden="true" className="size-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            className="size-10 rounded-full border-transparent bg-transparent shadow-none hover:bg-black/[0.035]"
            onClick={clear}
            aria-label={language === "ko" ? "서예 지우기" : "Clear calligraphy"}
          >
            <RotateCcw aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>

      {mode === "idle" && onRequestCamera ? (
        <div className="absolute inset-x-0 bottom-24 z-20 flex justify-center px-5 sm:bottom-28">
          <Button
            type="button"
            className="h-12 rounded-full bg-[#211c19] px-6 text-[0.95rem] font-medium text-[#fffaf5] shadow-[0_18px_45px_rgba(39,27,21,0.16)] hover:bg-[#352a25]"
            onClick={onRequestCamera}
          >
            <Camera aria-hidden="true" className="mr-2 size-4" />
            {language === "ko" ? "공중에서 쓰기 시작" : "Start air writing"}
          </Button>
        </div>
      ) : null}

      <span className="sr-only" role="status">
        {error ||
          (language === "ko"
            ? "화면은 저장하지 않아요. 손의 위치만 이 기기 안에서 붓 자국으로 바뀝니다."
            : "Video is never stored. Only local hand positions become brush marks.")}
      </span>
    </div>
  );
}
