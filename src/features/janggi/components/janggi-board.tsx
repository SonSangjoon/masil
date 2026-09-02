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
  clientX: number;
  clientY: number;
  localX: number;
  localY: number;
  dragging: boolean;
};

const BOARD_SURFACE_OFFSET = -0.19;

function piecesFor(
  game: JanggiGameState,
  state: JanggiMoveState,
  move: JanggiMove | null,
  moveProgress: number,
) {
  return game.pieces
    .filter((piece) => piece.active)
    .map((piece) => {
      if (state !== "moved" || !move || piece.id !== move.pieceId) return piece;
      const travel = Math.min(1, Math.max(0, (moveProgress - 0.16) / 0.66));
      const eased = travel * travel * (3 - 2 * travel);
      return {
        ...piece,
        col: move.from.col + (move.to.col - move.from.col) * eased,
        row: move.from.row + (move.to.row - move.from.row) * eased,
      };
    });
}

function pieceLabelSize(kind: JanggiPieceKind, boardWidth: number) {
  const sizes: Record<
    JanggiPieceKind,
    { minimum: number; ratio: number; maximum: number }
  > = {
    king: { minimum: 26, ratio: 0.058, maximum: 38 },
    cha: { minimum: 22, ratio: 0.05, maximum: 33 },
    po: { minimum: 22, ratio: 0.05, maximum: 33 },
    ma: { minimum: 21, ratio: 0.047, maximum: 31 },
    sang: { minimum: 21, ratio: 0.047, maximum: 31 },
    soldier: { minimum: 18, ratio: 0.0425, maximum: 27 },
    sa: { minimum: 18, ratio: 0.041, maximum: 26 },
  };
  const size = sizes[kind];
  return `${Math.min(size.maximum, Math.max(size.minimum, boardWidth * size.ratio))}px`;
}

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
  const [drag, setDrag] = useState<PieceDrag | null>(null);
  const [personMovePending, setPersonMovePending] = useState(false);
  const pieces = piecesFor(game, moveState, activeMove, visualState.moveProgress);
  const suggested = moveState === "suggested";
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
        setSize({ width: rect.width, height: rect.height });
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

  const target = activeMove
    ? projected(
        activeMove.to.col,
        activeMove.to.row,
        BOARD_SURFACE_OFFSET,
      )
    : null;

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
    const rect = boardRef.current?.getBoundingClientRect();
    const next: PieceDrag = {
      pieceId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      localX: event.clientX - (rect?.left ?? 0),
      localY: event.clientY - (rect?.top ?? 0),
      dragging: false,
    };
    setSelection({ pieceId, moveNumber: game.moveNumber });
    dragRef.current = next;
    setDrag(next);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updatePieceDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const distance = Math.hypot(
      event.clientX - current.startX,
      event.clientY - current.startY,
    );
    const rect = boardRef.current?.getBoundingClientRect();
    const next = {
      ...current,
      clientX: event.clientX,
      clientY: event.clientY,
      localX: event.clientX - (rect?.left ?? 0),
      localY: event.clientY - (rect?.top ?? 0),
      dragging: current.dragging || distance > 7,
    };
    if (next.dragging) event.preventDefault();
    dragRef.current = next;
    setDrag(next);
  };

  const endPieceDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDrag(null);
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
    setDrag(null);
  };

  const dragPiece = drag
    ? game.pieces.find((piece) => piece.id === drag.pieceId) ?? null
    : null;

  return (
    <div
      ref={boardRef}
      className="relative aspect-square w-full touch-none overflow-hidden"
      role="group"
      aria-label={
        language === "ko"
          ? `Agent와 함께 두는 입체 장기판. 현재 ${game.turn === "cho" ? "초" : "한"}의 차례.`
          : `A shared 3D Janggi board. It is ${game.turn === "cho" ? "Cho" : "Han"}'s turn.`
      }
      data-testid="janggi-vgpu-board"
      onClick={() => setSelection(null)}
    >
      <div className="pointer-events-none absolute inset-x-[9%] bottom-[7%] h-[18%] rounded-[50%] bg-[#6b4632]/13 blur-3xl" />
      <canvas
        ref={canvasRef}
        className={`pointer-events-none absolute inset-0 block h-full w-full transition-opacity duration-700 ${
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

      {status === "ready"
        ? pieces.map((piece) => {
            const selected = suggested && piece.id === activeMove?.pieceId;
            const moving =
              moveState === "moved" &&
              piece.id === activeMove?.pieceId &&
              visualState.moveProgress < 0.999;
            const pickup = Math.min(
              1,
              Math.max(0, visualState.moveProgress / 0.16),
            );
            const landing =
              1 -
              Math.min(
                1,
                Math.max(0, (visualState.moveProgress - 0.82) / 0.18),
              );
            const motionLift = selected
              ? 0.11
              : moving
                ? Math.min(pickup, landing) * 0.62
                : 0;
            const point = projected(
              piece.col,
              piece.row,
              pieceFaceOffset(piece.kind) + motionLift,
            );
            const style = {
              left: `${point.left}%`,
              top: `${point.top}%`,
              transform: `translate(-50%, -50%) scale(${point.scale}) scaleY(0.92)`,
              fontSize: pieceLabelSize(piece.kind, size.width),
              width: "1em",
              height: "1em",
              lineHeight: 1,
              fontFamily:
                "STKaiti, KaiTi, Kaiti SC, Noto Serif CJK KR, Noto Serif KR, serif",
              fontWeight: 800,
              WebkitTextStroke: "0.45px rgba(26, 15, 8, 0.78)",
              textShadow:
                "0 1px 1px rgba(20,12,5,.9), 0 0 3px rgba(20,12,5,.4), 0 0 8px rgba(247,213,137,.22)",
            };
            return (
              <span
                key={piece.id}
                className={`pointer-events-none absolute z-10 grid place-items-center font-serif font-bold leading-none select-none ${
                  piece.side === "cho" ? "text-[#a44935]" : "text-[#d9b86f]"
                }`}
                style={style}
                aria-hidden="true"
                data-testid={`janggi-label-${piece.id}`}
              >
                {piece.label}
              </span>
            );
          })
        : null}

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
                  className={`absolute z-30 touch-none rounded-full border p-0 transition-[border-color,background-color,box-shadow] duration-200 hover:bg-transparent focus-visible:ring-[#d78a62]/70 focus-visible:ring-offset-2 ${
                    isSelected
                      ? "border-[#d8a56e]/85 bg-[#f3c5a2]/16 shadow-[0_0_0_7px_rgba(216,165,110,0.12),0_10px_28px_rgba(78,45,28,0.16)]"
                      : "border-transparent bg-transparent hover:border-[#d8a56e]/40"
                  }`}
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

      {drag?.dragging && dragPiece ? (
        <div
          className={`pointer-events-none absolute z-50 grid size-[clamp(3rem,5.2vw,4.6rem)] -translate-x-1/2 -translate-y-1/2 place-items-center border border-white/55 bg-[#9bc3aa]/70 font-serif font-bold shadow-[0_18px_35px_rgba(44,35,24,0.28),inset_0_0_18px_rgba(255,255,255,0.38)] backdrop-blur-[2px] ${
            dragPiece.side === "cho" ? "text-[#a44935]" : "text-[#d9b86f]"
          }`}
          style={{
            left: drag.localX,
            top: drag.localY,
            clipPath:
              "polygon(29% 0,71% 0,100% 29%,100% 71%,71% 100%,29% 100%,0 71%,0 29%)",
            fontFamily:
              "STKaiti, KaiTi, Kaiti SC, Noto Serif CJK KR, Noto Serif KR, serif",
          }}
          aria-hidden="true"
        >
          {dragPiece.label}
        </div>
      ) : null}

      {status === "ready" && suggested && target ? (
        <span
          className="pointer-events-none absolute z-20 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#d7a341] shadow-[0_0_0_7px_rgba(255,238,184,0.5)]"
          style={{ left: `${target.left}%`, top: `${target.top}%` }}
          aria-hidden="true"
        />
      ) : null}
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
    <div className="relative h-full min-h-[620px] overflow-hidden bg-transparent px-4 pb-20 pt-6 sm:px-8 sm:pt-8 lg:px-10">
      <div className="mx-auto grid h-full min-h-[calc(100svh-122px)] max-w-[88rem] grid-rows-[auto_auto] content-center items-center gap-4 lg:grid-cols-[minmax(600px,1fr)_minmax(220px,0.28fr)] lg:grid-rows-1">
        <div className="relative mx-auto w-full max-w-[min(84vh,900px)]">
          <VgpuJanggiBoard
            activeMove={activeMove}
            game={game}
            language={language}
            moveState={moveState}
            onMoveAnimationComplete={onMoveAnimationComplete}
            onPersonMove={onPersonMove}
          />
        </div>

        <aside className="relative z-10 mx-auto w-full max-w-[18rem] pb-5 text-center lg:mx-0 lg:pb-0 lg:text-left">
          <h2 className="masil-balance text-[clamp(2.35rem,3.9vw,4.2rem)] leading-[1.02] font-medium tracking-[-0.075em] text-[#1d1a18]">
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
          <p className="mt-5 text-sm tracking-[-0.02em] text-[#716963] sm:text-base">
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
