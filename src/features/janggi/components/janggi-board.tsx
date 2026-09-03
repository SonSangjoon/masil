"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  createJanggiRenderer,
  projectJanggiPoint,
  type JanggiVisualState,
} from "@/features/janggi/runtime/renderer";
import {
  describeJanggiPiece,
  getLegalJanggiMoves,
  type JanggiGameState,
  type JanggiGridPoint,
  type JanggiMove,
  type JanggiMoveState,
  type JanggiPieceKind,
} from "@/features/janggi/model/game";
import { Button } from "@/components/ui/button";

type Language = "ko" | "en";

type PersonMoveHandler = (
  pieceId: string,
  destination: JanggiGridPoint,
  spokenMove: string,
) => Promise<void>;

type PieceDrag = {
  pieceId: string;
  pointerId: number;
  startX: number;
  startY: number;
  dragging: boolean;
};

const BOARD_SURFACE_OFFSET = -0.19;

function pieceFaceOffset(kind: JanggiPieceKind) {
  if (kind === "king") return 0.02;
  if (kind === "soldier" || kind === "sa") return -0.042;
  return -0.02;
}

function pieceHitSize(kind: JanggiPieceKind, boardWidth: number) {
  const small = kind === "soldier" || kind === "sa";
  const ratio = kind === "king" ? 0.105 : small ? 0.082 : 0.09;
  const minimum = kind === "king" ? 54 : small ? 44 : 48;
  const maximum = kind === "king" ? 72 : small ? 58 : 64;
  return Math.min(maximum, Math.max(minimum, boardWidth * ratio));
}

function VgpuJanggiBoard({
  activeMove,
  game,
  language,
  moveState,
  onMoveAnimationComplete,
  onPersonMove,
}: {
  activeMove: JanggiMove | null;
  game: JanggiGameState;
  language: Language;
  moveState: JanggiMoveState;
  onMoveAnimationComplete?: (moveId: string) => void;
  onPersonMove?: PersonMoveHandler;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ReturnType<typeof createJanggiRenderer> | null>(
    null,
  );
  const animationRef = useRef({ moveId: "", sawMotion: false });
  const dragRef = useRef<PieceDrag | null>(null);
  const suppressClickRef = useRef(false);
  const [size, setSize] = useState({ width: 640, height: 640 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [visualState, setVisualState] = useState<JanggiVisualState>({
    cameraFocus: 0,
    moveProgress: 0,
  });
  const [selection, setSelection] = useState<{
    pieceId: string;
    moveNumber: number;
  } | null>(null);
  const [personMovePending, setPersonMovePending] = useState(false);
  const selectedPieceId =
    selection?.moveNumber === game.moveNumber ? selection.pieceId : null;
  const moveAnimating =
    moveState === "moved" && visualState.moveProgress < 0.999;
  const interactionEnabled =
    status === "ready" &&
    game.status !== "checkmate" &&
    game.turn === "cho" &&
    !moveAnimating &&
    !personMovePending;
  const selectedPiece = selectedPieceId
    ? game.pieces.find(
        (piece) =>
          piece.id === selectedPieceId &&
          piece.active &&
          piece.side === game.turn,
      ) ?? null
    : null;
  const legalDestinations = selectedPiece
    ? getLegalJanggiMoves(game, selectedPiece.id)
    : [];

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const update = () => {
      const rect = board.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const nextSize = { width: rect.width, height: rect.height };
        setSize(nextSize);
      }
    };
    const observer = new ResizeObserver(update);
    observer.observe(board);
    update();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const renderer = createJanggiRenderer({
      canvas,
      game,
      onVisualState: setVisualState,
    });
    rendererRef.current = renderer;
    void renderer.ready
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("MASIL vGPU Janggi scene could not start", error);
        setStatus("error");
      });
    return () => {
      cancelled = true;
      rendererRef.current = null;
      renderer.dispose();
    };
    // The renderer owns subsequent game updates; recreating it would interrupt a move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rendererRef.current?.setBoardState(game, moveState, activeMove);
  }, [activeMove, game, moveState]);

  useEffect(() => {
    if (moveState !== "moved" || !activeMove) {
      animationRef.current = { moveId: "", sawMotion: false };
      return;
    }

    if (animationRef.current.moveId !== activeMove.id) {
      // A new move can render once with the previous move's final progress.
      // Require one frame from the new animation before reporting completion.
      animationRef.current = { moveId: activeMove.id, sawMotion: false };
      return;
    }

    if (visualState.moveProgress < 0.999) {
      animationRef.current.sawMotion = true;
      return;
    }

    if (!animationRef.current.sawMotion) return;
    animationRef.current.sawMotion = false;
    onMoveAnimationComplete?.(activeMove.id);
  }, [activeMove, moveState, onMoveAnimationComplete, visualState.moveProgress]);

  const projected = (col: number, row: number, lift = 0) =>
    projectJanggiPoint({
      width: size.width,
      height: size.height,
      col,
      row,
      lift,
      cameraFocus: visualState.cameraFocus,
      move: activeMove,
      moveProgress: visualState.moveProgress,
    });

  const commitPersonMove = useCallback(
    async (pieceId: string, destination: JanggiGridPoint) => {
      if (!onPersonMove || personMovePending) return;
      const piece = game.pieces.find(
        (candidate) =>
          candidate.id === pieceId &&
          candidate.active &&
          candidate.side === game.turn,
      );
      if (!piece) return;
      const spokenMove = `${describeJanggiPiece(piece)}을 손으로 ${destination.row}행 ${destination.col}열에 둠`;
      setPersonMovePending(true);
      setSelection(null);
      try {
        await onPersonMove(pieceId, destination, spokenMove);
      } catch (error) {
        console.error("MASIL direct Janggi move failed", error);
        setSelection({ pieceId, moveNumber: game.moveNumber });
      } finally {
        setPersonMovePending(false);
      }
    }, [
      game.moveNumber,
      game.pieces,
      game.turn,
      onPersonMove,
      personMovePending,
    ]);

  const beginPieceDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    pieceId: string,
  ) => {
    if (!interactionEnabled) return;
    event.stopPropagation();
    const next: PieceDrag = {
      pieceId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    setSelection({ pieceId, moveNumber: game.moveNumber });
    dragRef.current = next;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updatePieceDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const distance = Math.hypot(
      event.clientX - current.startX,
      event.clientY - current.startY,
    );
    const next = {
      ...current,
      dragging: current.dragging || distance > 7,
    };
    if (next.dragging) event.preventDefault();
    dragRef.current = next;
  };

  const endPieceDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!current.dragging) return;

    event.preventDefault();
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const dragLegalDestinations = getLegalJanggiMoves(game, current.pieceId);
    const nearest = dragLegalDestinations
      .map((destination) => {
        const point = projected(
          destination.col,
          destination.row,
          BOARD_SURFACE_OFFSET,
        );
        const x = rect.left + (point.left / 100) * rect.width;
        const y = rect.top + (point.top / 100) * rect.height;
        return {
          destination,
          distance: Math.hypot(event.clientX - x, event.clientY - y),
        };
      })
      .sort((first, second) => first.distance - second.distance)[0];
    const hitRadius = Math.max(34, Math.min(rect.width, rect.height) * 0.055);
    if (nearest && nearest.distance <= hitRadius) {
      void commitPersonMove(current.pieceId, nearest.destination);
    }
  };

  const cancelPieceDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
  };

  return (
    <div
      ref={boardRef}
      className="relative aspect-square w-full touch-none overflow-hidden [contain:layout_paint]"
      role="group"
      aria-label={
        language === "ko"
          ? `Agent와 함께 두는 입체 장기판. 현재 ${game.turn === "cho" ? "초" : "한"}의 차례.`
          : `A shared 3D Janggi board. It is ${game.turn === "cho" ? "Cho" : "Han"}'s turn.`
      }
      data-testid="janggi-vgpu-board"
      onClick={() => setSelection(null)}
    >
      <div className="pointer-events-none absolute inset-x-[12%] bottom-[5%] h-[17%] rounded-[50%] bg-[#8d6b45]/14 blur-3xl" />
      <canvas
        ref={canvasRef}
        className={`pointer-events-none absolute inset-0 block h-full w-full bg-transparent transition-opacity duration-700 ${
          status === "ready" ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      />

      {status === "loading" ? (
        <p className="absolute inset-0 grid place-items-center text-sm text-[#756b63]">
          {language === "ko" ? "장기판을 놓는 중…" : "Setting the board…"}
        </p>
      ) : null}

      {status === "error" ? (
        <p className="absolute inset-0 grid place-items-center px-8 text-center text-sm leading-6 text-[#756b63]">
          {language === "ko"
            ? "이 브라우저에서는 입체 장기판을 열 수 없어요. WebGPU를 지원하는 브라우저에서 다시 시도해 주세요."
            : "The 3D board needs a browser with WebGPU support."}
        </p>
      ) : null}

      {interactionEnabled
        ? game.pieces
            .filter((piece) => piece.active && piece.side === "cho")
            .map((piece) => {
              const point = projected(
                piece.col,
                piece.row,
                pieceFaceOffset(piece.kind),
              );
              const hitSize = pieceHitSize(piece.kind, size.width);
              const isSelected = piece.id === selectedPieceId;
              return (
                <Button
                  key={`hit-${piece.id}`}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute z-30 touch-none rounded-[32%] border border-transparent bg-transparent p-0 hover:bg-transparent focus-visible:ring-[#d78a62]/70 focus-visible:ring-offset-2"
                  style={{
                    left: `${point.left}%`,
                    top: `${point.top}%`,
                    width: hitSize,
                    height: hitSize,
                    transform: `translate(-50%, -50%) scale(${Math.max(0.82, point.scale)})`,
                  }}
                  aria-label={
                    language === "ko"
                      ? `${describeJanggiPiece(piece)} 선택`
                      : `Select ${describeJanggiPiece(piece)}`
                  }
                  aria-pressed={isSelected}
                  data-testid={`janggi-piece-${piece.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (suppressClickRef.current) return;
                    setSelection({
                      pieceId: piece.id,
                      moveNumber: game.moveNumber,
                    });
                  }}
                  onPointerDown={(event) => beginPieceDrag(event, piece.id)}
                  onPointerMove={updatePieceDrag}
                  onPointerUp={endPieceDrag}
                  onPointerCancel={cancelPieceDrag}
                />
              );
            })
        : null}

      {interactionEnabled && selectedPiece
        ? legalDestinations.map((destination) => {
            const point = projected(
              destination.col,
              destination.row,
              BOARD_SURFACE_OFFSET,
            );
            return (
              <Button
                key={`destination-${destination.row}-${destination.col}`}
                type="button"
                variant="ghost"
                size="icon"
                className="group/destination absolute z-40 grid size-[clamp(2.7rem,4.7vw,4rem)] place-items-center rounded-full p-0 hover:bg-transparent focus-visible:ring-[#bd684d]/65 focus-visible:ring-offset-2"
                style={{
                  left: `${point.left}%`,
                  top: `${point.top}%`,
                  transform: `translate(-50%, -50%) scale(${Math.max(0.82, point.scale)})`,
                }}
                aria-label={
                  language === "ko"
                    ? `${destination.row}행 ${destination.col}열로 이동`
                    : `Move to row ${destination.row}, column ${destination.col}`
                }
                data-testid={`janggi-destination-${destination.row}-${destination.col}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void commitPersonMove(selectedPiece.id, destination);
                }}
              >
                <span className="size-[clamp(0.72rem,1.4vw,1rem)] rounded-full border border-[#bc765b]/65 bg-[#f8dcc5]/55 shadow-[0_0_0_7px_rgba(188,118,91,0.11),0_4px_14px_rgba(98,52,31,0.18)] transition-transform duration-200 group-hover/destination:scale-125" />
              </Button>
            );
          })
        : null}

    </div>
  );
}

export function JanggiBoard({
  activeMove,
  game,
  language,
  moveState,
  onMoveAnimationComplete,
  onPersonMove,
}: {
  activeMove: JanggiMove | null;
  game: JanggiGameState;
  language: Language;
  moveState: JanggiMoveState;
  onMoveAnimationComplete?: (moveId: string) => void;
  onPersonMove?: PersonMoveHandler;
}) {
  const movedPiece = activeMove
    ? game.pieces.find((piece) => piece.id === activeMove.pieceId)
    : null;
  const movedName = movedPiece ? describeJanggiPiece(movedPiece) : "";

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-transparent px-4 pb-5 pt-[5.25rem] sm:px-8 sm:pb-6 sm:pt-[5.75rem] lg:px-10 lg:pb-8 lg:pt-8">
      <div className="mx-auto grid h-full min-h-0 max-w-[86rem] grid-rows-[minmax(0,1fr)_auto] content-center items-center gap-2 sm:gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,18rem)] lg:grid-rows-1 lg:gap-8 xl:gap-12">
        <div className="relative mx-auto w-[min(88vw,calc(100svh-18rem),50rem)] max-w-full lg:w-[min(78vh,58vw,54rem)]">
          <VgpuJanggiBoard
            activeMove={activeMove}
            game={game}
            language={language}
            moveState={moveState}
            onMoveAnimationComplete={onMoveAnimationComplete}
            onPersonMove={onPersonMove}
          />
        </div>

        <aside className="relative z-10 mx-auto w-full max-w-[26rem] pb-1 text-center lg:mx-0 lg:max-w-[18rem] lg:pb-0 lg:text-left">
          <h2 className="masil-balance whitespace-nowrap text-[clamp(1.45rem,2.8vw,2.55rem)] leading-[1.08] font-medium tracking-[-0.06em] text-[#1d1a18]">
            {moveState === "moved" && movedName
              ? language === "ko"
                ? `${movedName}, 이렇게 두었어요.`
                : "The piece is moving."
              : moveState === "suggested"
                ? language === "ko"
                  ? "이 수를 볼까요?"
                  : "Shall we look at this move?"
                : language === "ko"
                  ? "수를 말씀해 주세요."
                  : "Tell me your move."}
          </h2>
          <p className="mt-2 text-xs tracking-[-0.015em] text-[#716963] sm:text-sm lg:mt-4 lg:text-base">
            {language === "ko"
              ? game.turn === "cho"
                ? "어르신 차례"
                : "제가 둘 차례"
              : `${game.turn === "cho" ? "Cho" : "Han"} to move`}
          </p>
        </aside>
      </div>
    </div>
  );
}

export type { JanggiMoveState } from "@/features/janggi/model/game";
