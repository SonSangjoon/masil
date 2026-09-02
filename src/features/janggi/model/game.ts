export type JanggiSide = "cho" | "han";
export type JanggiPieceKind =
  | "cha"
  | "ma"
  | "sang"
  | "sa"
  | "king"
  | "po"
  | "soldier";

export type JanggiGridPoint = {
  row: number;
  col: number;
};

export type JanggiPiece = JanggiGridPoint & {
  id: string;
  index: number;
  side: JanggiSide;
  kind: JanggiPieceKind;
  label: string;
  active: boolean;
};

export type JanggiMove = {
  id: string;
  pieceId: string;
  pieceIndex: number;
  pieceLabel: string;
  side: JanggiSide;
  from: JanggiGridPoint;
  to: JanggiGridPoint;
  capturedPieceId: string | null;
  spokenMove: string;
  moveNumber: number;
};

export type JanggiGameStatus =
  | "playing"
  | "check"
  | "checkmate"
  | "bikjang";

export type JanggiGameState = {
  pieces: JanggiPiece[];
  turn: JanggiSide;
  moveNumber: number;
  status: JanggiGameStatus;
  lastMove: JanggiMove | null;
  history: JanggiMove[];
};

export type JanggiMoveState = "idle" | "suggested" | "moved";

const INITIAL_PIECES: Omit<JanggiPiece, "index" | "active">[] = [
  { id: "han-cha-left", side: "han", kind: "cha", label: "車", row: 0, col: 0 },
  { id: "han-ma-left", side: "han", kind: "ma", label: "馬", row: 0, col: 1 },
  { id: "han-sang-left", side: "han", kind: "sang", label: "象", row: 0, col: 2 },
  { id: "han-sa-left", side: "han", kind: "sa", label: "士", row: 0, col: 3 },
  { id: "han-king", side: "han", kind: "king", label: "漢", row: 1, col: 4 },
  { id: "han-sa-right", side: "han", kind: "sa", label: "士", row: 0, col: 5 },
  { id: "han-sang-right", side: "han", kind: "sang", label: "象", row: 0, col: 6 },
  { id: "han-ma-right", side: "han", kind: "ma", label: "馬", row: 0, col: 7 },
  { id: "han-cha-right", side: "han", kind: "cha", label: "車", row: 0, col: 8 },
  { id: "han-po-left", side: "han", kind: "po", label: "包", row: 2, col: 1 },
  { id: "han-po-right", side: "han", kind: "po", label: "包", row: 2, col: 7 },
  { id: "han-jol-1", side: "han", kind: "soldier", label: "卒", row: 3, col: 0 },
  { id: "han-jol-2", side: "han", kind: "soldier", label: "卒", row: 3, col: 2 },
  { id: "han-jol-3", side: "han", kind: "soldier", label: "卒", row: 3, col: 4 },
  { id: "han-jol-4", side: "han", kind: "soldier", label: "卒", row: 3, col: 6 },
  { id: "han-jol-5", side: "han", kind: "soldier", label: "卒", row: 3, col: 8 },
  { id: "cho-byeong-1", side: "cho", kind: "soldier", label: "兵", row: 6, col: 0 },
  { id: "cho-byeong-2", side: "cho", kind: "soldier", label: "兵", row: 6, col: 2 },
  { id: "cho-byeong-3", side: "cho", kind: "soldier", label: "兵", row: 6, col: 4 },
  { id: "cho-byeong-4", side: "cho", kind: "soldier", label: "兵", row: 6, col: 6 },
  { id: "cho-byeong-5", side: "cho", kind: "soldier", label: "兵", row: 6, col: 8 },
  { id: "cho-po-left", side: "cho", kind: "po", label: "砲", row: 7, col: 1 },
  { id: "cho-po-right", side: "cho", kind: "po", label: "砲", row: 7, col: 7 },
  { id: "cho-cha-left", side: "cho", kind: "cha", label: "車", row: 9, col: 0 },
  { id: "cho-ma-left", side: "cho", kind: "ma", label: "馬", row: 9, col: 1 },
  { id: "cho-sang-left", side: "cho", kind: "sang", label: "象", row: 9, col: 2 },
  { id: "cho-sa-left", side: "cho", kind: "sa", label: "士", row: 9, col: 3 },
  { id: "cho-king", side: "cho", kind: "king", label: "楚", row: 8, col: 4 },
  { id: "cho-sa-right", side: "cho", kind: "sa", label: "士", row: 9, col: 5 },
  { id: "cho-sang-right", side: "cho", kind: "sang", label: "象", row: 9, col: 6 },
  { id: "cho-ma-right", side: "cho", kind: "ma", label: "馬", row: 9, col: 7 },
  { id: "cho-cha-right", side: "cho", kind: "cha", label: "車", row: 9, col: 8 },
];

const PALACE_DIAGONALS: JanggiGridPoint[][] = [
  [
    { row: 0, col: 3 },
    { row: 1, col: 4 },
    { row: 2, col: 5 },
  ],
  [
    { row: 0, col: 5 },
    { row: 1, col: 4 },
    { row: 2, col: 3 },
  ],
  [
    { row: 7, col: 3 },
    { row: 8, col: 4 },
    { row: 9, col: 5 },
  ],
  [
    { row: 7, col: 5 },
    { row: 8, col: 4 },
    { row: 9, col: 3 },
  ],
];

const ORTHOGONAL_DIRECTIONS = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
] as const;

function samePoint(first: JanggiGridPoint, second: JanggiGridPoint) {
  return first.row === second.row && first.col === second.col;
}

function pointKey(point: JanggiGridPoint) {
  return `${point.row}:${point.col}`;
}

export function isJanggiBoardPoint(point: JanggiGridPoint) {
  return (
    Number.isInteger(point.row) &&
    Number.isInteger(point.col) &&
    point.row >= 0 &&
    point.row <= 9 &&
    point.col >= 0 &&
    point.col <= 8
  );
}

function isInPalace(point: JanggiGridPoint, side?: JanggiSide) {
  const insideColumns = point.col >= 3 && point.col <= 5;
  const hanPalace = point.row >= 0 && point.row <= 2;
  const choPalace = point.row >= 7 && point.row <= 9;
  if (side === "han") return insideColumns && hanPalace;
  if (side === "cho") return insideColumns && choPalace;
  return insideColumns && (hanPalace || choPalace);
}

function diagonalPalaceNeighbors(point: JanggiGridPoint) {
  const neighbors: JanggiGridPoint[] = [];
  for (const line of PALACE_DIAGONALS) {
    const index = line.findIndex((candidate) => samePoint(candidate, point));
    if (index < 0) continue;
    if (line[index - 1]) neighbors.push(line[index - 1]);
    if (line[index + 1]) neighbors.push(line[index + 1]);
  }
  return neighbors;
}

function palaceStepNeighbors(point: JanggiGridPoint, side: JanggiSide) {
  const orthogonal = ORTHOGONAL_DIRECTIONS.map((direction) => ({
    row: point.row + direction.row,
    col: point.col + direction.col,
  })).filter((candidate) => isInPalace(candidate, side));
  return [...orthogonal, ...diagonalPalaceNeighbors(point)].filter((candidate) =>
    isInPalace(candidate, side),
  );
}

function pieceAt(game: JanggiGameState, point: JanggiGridPoint) {
  return game.pieces.find(
    (piece) => piece.active && piece.row === point.row && piece.col === point.col,
  );
}

function canLand(game: JanggiGameState, piece: JanggiPiece, point: JanggiGridPoint) {
  if (!isJanggiBoardPoint(point)) return false;
  return pieceAt(game, point)?.side !== piece.side;
}

function addRayMoves(
  game: JanggiGameState,
  piece: JanggiPiece,
  moves: JanggiGridPoint[],
  direction: JanggiGridPoint,
) {
  let point = { row: piece.row + direction.row, col: piece.col + direction.col };
  while (isJanggiBoardPoint(point)) {
    const occupant = pieceAt(game, point);
    if (!occupant) {
      moves.push(point);
    } else {
      if (occupant.side !== piece.side) moves.push(point);
      break;
    }
    point = { row: point.row + direction.row, col: point.col + direction.col };
  }
}

function addPalaceRayMoves(
  game: JanggiGameState,
  piece: JanggiPiece,
  moves: JanggiGridPoint[],
) {
  for (const line of PALACE_DIAGONALS) {
    const originIndex = line.findIndex((point) => samePoint(point, piece));
    if (originIndex < 0) continue;
    for (const step of [-1, 1]) {
      for (let index = originIndex + step; index >= 0 && index < line.length; index += step) {
        const point = line[index];
        const occupant = pieceAt(game, point);
        if (!occupant) moves.push(point);
        else {
          if (occupant.side !== piece.side) moves.push(point);
          break;
        }
      }
    }
  }
}

function addCannonLine(
  game: JanggiGameState,
  piece: JanggiPiece,
  orderedPoints: JanggiGridPoint[],
  moves: JanggiGridPoint[],
) {
  let foundScreen = false;
  for (const point of orderedPoints) {
    const occupant = pieceAt(game, point);
    if (!foundScreen) {
      if (!occupant) continue;
      if (occupant.kind === "po") break;
      foundScreen = true;
      continue;
    }
    if (!occupant) {
      moves.push(point);
      continue;
    }
    if (occupant.side !== piece.side && occupant.kind !== "po") moves.push(point);
    break;
  }
}

function cannonMoves(game: JanggiGameState, piece: JanggiPiece) {
  const moves: JanggiGridPoint[] = [];
  for (const direction of ORTHOGONAL_DIRECTIONS) {
    const points: JanggiGridPoint[] = [];
    let point = { row: piece.row + direction.row, col: piece.col + direction.col };
    while (isJanggiBoardPoint(point)) {
      points.push(point);
      point = { row: point.row + direction.row, col: point.col + direction.col };
    }
    addCannonLine(game, piece, points, moves);
  }
  for (const line of PALACE_DIAGONALS) {
    const originIndex = line.findIndex((point) => samePoint(point, piece));
    if (originIndex < 0) continue;
    for (const step of [-1, 1]) {
      const points: JanggiGridPoint[] = [];
      for (let index = originIndex + step; index >= 0 && index < line.length; index += step) {
        points.push(line[index]);
      }
      addCannonLine(game, piece, points, moves);
    }
  }
  return moves;
}

function horseMoves(game: JanggiGameState, piece: JanggiPiece) {
  const patterns = [
    { block: [-1, 0], destinations: [[-2, -1], [-2, 1]] },
    { block: [1, 0], destinations: [[2, -1], [2, 1]] },
    { block: [0, -1], destinations: [[-1, -2], [1, -2]] },
    { block: [0, 1], destinations: [[-1, 2], [1, 2]] },
  ] as const;
  const moves: JanggiGridPoint[] = [];
  for (const pattern of patterns) {
    const block = { row: piece.row + pattern.block[0], col: piece.col + pattern.block[1] };
    if (pieceAt(game, block)) continue;
    for (const destination of pattern.destinations) {
      const point = { row: piece.row + destination[0], col: piece.col + destination[1] };
      if (canLand(game, piece, point)) moves.push(point);
    }
  }
  return moves;
}

function elephantMoves(game: JanggiGameState, piece: JanggiPiece) {
  const patterns = [
    { first: [-1, 0], second: [-2, -1], destination: [-3, -2] },
    { first: [-1, 0], second: [-2, 1], destination: [-3, 2] },
    { first: [1, 0], second: [2, -1], destination: [3, -2] },
    { first: [1, 0], second: [2, 1], destination: [3, 2] },
    { first: [0, -1], second: [-1, -2], destination: [-2, -3] },
    { first: [0, -1], second: [1, -2], destination: [2, -3] },
    { first: [0, 1], second: [-1, 2], destination: [-2, 3] },
    { first: [0, 1], second: [1, 2], destination: [2, 3] },
  ] as const;
  const moves: JanggiGridPoint[] = [];
  for (const pattern of patterns) {
    const first = { row: piece.row + pattern.first[0], col: piece.col + pattern.first[1] };
    const second = { row: piece.row + pattern.second[0], col: piece.col + pattern.second[1] };
    if (pieceAt(game, first) || pieceAt(game, second)) continue;
    const point = {
      row: piece.row + pattern.destination[0],
      col: piece.col + pattern.destination[1],
    };
    if (canLand(game, piece, point)) moves.push(point);
  }
  return moves;
}

function soldierMoves(game: JanggiGameState, piece: JanggiPiece) {
  const forward = piece.side === "cho" ? -1 : 1;
  const candidates = [
    { row: piece.row + forward, col: piece.col },
    { row: piece.row, col: piece.col - 1 },
    { row: piece.row, col: piece.col + 1 },
  ];
  for (const neighbor of diagonalPalaceNeighbors(piece)) {
    if (neighbor.row - piece.row === forward) candidates.push(neighbor);
  }
  return candidates.filter((point) => canLand(game, piece, point));
}

function pseudoMoves(game: JanggiGameState, piece: JanggiPiece) {
  if (!piece.active) return [];
  if (piece.kind === "ma") return horseMoves(game, piece);
  if (piece.kind === "sang") return elephantMoves(game, piece);
  if (piece.kind === "po") return cannonMoves(game, piece);
  if (piece.kind === "soldier") return soldierMoves(game, piece);
  if (piece.kind === "king" || piece.kind === "sa") {
    return palaceStepNeighbors(piece, piece.side).filter((point) =>
      canLand(game, piece, point),
    );
  }
  const moves: JanggiGridPoint[] = [];
  for (const direction of ORTHOGONAL_DIRECTIONS) {
    addRayMoves(game, piece, moves, direction);
  }
  addPalaceRayMoves(game, piece, moves);
  return moves;
}

export function isJanggiBikjang(game: JanggiGameState) {
  const choKing = game.pieces.find((piece) => piece.active && piece.id === "cho-king");
  const hanKing = game.pieces.find((piece) => piece.active && piece.id === "han-king");
  if (!choKing || !hanKing || choKing.col !== hanKing.col) return false;
  const start = Math.min(choKing.row, hanKing.row) + 1;
  const end = Math.max(choKing.row, hanKing.row);
  for (let row = start; row < end; row += 1) {
    if (pieceAt(game, { row, col: choKing.col })) return false;
  }
  return true;
}

export function isJanggiInCheck(game: JanggiGameState, side: JanggiSide) {
  const king = game.pieces.find(
    (piece) => piece.active && piece.side === side && piece.kind === "king",
  );
  if (!king) return true;
  return game.pieces
    .filter((piece) => piece.active && piece.side !== side)
    .some((piece) => pseudoMoves(game, piece).some((point) => samePoint(point, king)));
}

function simulateMove(
  game: JanggiGameState,
  piece: JanggiPiece,
  destination: JanggiGridPoint,
) {
  const captured = pieceAt(game, destination);
  return {
    ...game,
    pieces: game.pieces.map((candidate) => {
      if (candidate.id === piece.id) return { ...candidate, ...destination };
      if (captured && candidate.id === captured.id) return { ...candidate, active: false };
      return candidate;
    }),
  };
}

export function getLegalJanggiMoves(
  game: JanggiGameState,
  pieceId: string,
  enforceTurn = true,
) {
  const piece = game.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece || !piece.active) return [];
  if (enforceTurn && piece.side !== game.turn) return [];
  const unique = new Map<string, JanggiGridPoint>();
  for (const destination of pseudoMoves(game, piece)) {
    const target = pieceAt(game, destination);
    if (target?.kind === "king") continue;
    const simulated = simulateMove(game, piece, destination);
    if (!isJanggiInCheck(simulated, piece.side)) {
      unique.set(pointKey(destination), destination);
    }
  }
  return [...unique.values()].sort((first, second) =>
    first.row === second.row ? first.col - second.col : first.row - second.row,
  );
}

function hasAnyLegalMove(game: JanggiGameState, side: JanggiSide) {
  const sideGame = { ...game, turn: side };
  return sideGame.pieces
    .filter((piece) => piece.active && piece.side === side)
    .some((piece) => getLegalJanggiMoves(sideGame, piece.id).length > 0);
}

export function createInitialJanggiGame(): JanggiGameState {
  return {
    pieces: INITIAL_PIECES.map((piece, index) => ({ ...piece, index, active: true })),
    turn: "cho",
    moveNumber: 1,
    status: "playing",
    lastMove: null,
    history: [],
  };
}

export function applyJanggiMove(
  game: JanggiGameState,
  pieceId: string,
  destination: JanggiGridPoint,
  spokenMove: string,
) {
  const preview = previewJanggiMove(game, pieceId, destination, spokenMove);
  const move = { ...preview, id: preview.id.replace("preview-", "move-") };
  const piece = game.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) throw new Error("JANGGI_PIECE_NOT_FOUND");
  const nextTurn: JanggiSide = game.turn === "cho" ? "han" : "cho";
  let next: JanggiGameState = {
    ...simulateMove(game, piece, destination),
    turn: nextTurn,
    moveNumber: game.moveNumber + 1,
    lastMove: move,
    history: [...game.history, move],
    status: "playing",
  };
  const check = isJanggiInCheck(next, nextTurn);
  const canMove = check ? hasAnyLegalMove(next, nextTurn) : true;
  next = {
    ...next,
    status: check
      ? canMove
        ? "check"
        : "checkmate"
      : isJanggiBikjang(next)
        ? "bikjang"
        : "playing",
  };
  return next;
}

export function passJanggiTurn(game: JanggiGameState) {
  if (isJanggiInCheck(game, game.turn)) {
    throw new Error("JANGGI_PASS_NOT_ALLOWED_IN_CHECK");
  }
  if (game.status === "checkmate") {
    throw new Error("JANGGI_GAME_ALREADY_FINISHED");
  }
  const nextTurn: JanggiSide = game.turn === "cho" ? "han" : "cho";
  return {
    ...game,
    turn: nextTurn,
    moveNumber: game.moveNumber + 1,
    status: isJanggiBikjang(game) ? "bikjang" : "playing",
    lastMove: null,
  } satisfies JanggiGameState;
}

export function previewJanggiMove(
  game: JanggiGameState,
  pieceId: string,
  destination: JanggiGridPoint,
  spokenMove: string,
) {
  const piece = game.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece || !piece.active) throw new Error("JANGGI_PIECE_NOT_FOUND");
  if (piece.side !== game.turn) throw new Error(`JANGGI_WRONG_TURN:${game.turn}`);
  if (!isJanggiBoardPoint(destination)) throw new Error("JANGGI_DESTINATION_OUT_OF_BOUNDS");
  const legal = getLegalJanggiMoves(game, pieceId);
  if (!legal.some((point) => samePoint(point, destination))) {
    throw new Error("JANGGI_ILLEGAL_MOVE");
  }
  const captured = pieceAt(game, destination);
  return {
    id: `preview-${game.moveNumber}-${piece.id}-${destination.row}-${destination.col}`,
    pieceId: piece.id,
    pieceIndex: piece.index,
    pieceLabel: piece.label,
    side: piece.side,
    from: { row: piece.row, col: piece.col },
    to: destination,
    capturedPieceId: captured?.id ?? null,
    spokenMove,
    moveNumber: game.moveNumber,
  } satisfies JanggiMove;
}

export function describeJanggiPiece(piece: JanggiPiece) {
  const side = piece.side === "cho" ? "초" : "한";
  const names: Record<JanggiPieceKind, string> = {
    cha: "차",
    ma: "마",
    sang: "상",
    sa: "사",
    king: "왕",
    po: "포",
    soldier: piece.side === "cho" ? "병" : "졸",
  };
  return `${side} ${names[piece.kind]}`;
}

export function publicJanggiState(game: JanggiGameState) {
  return {
    coordinateSystem: {
      rows: "0 (한 진영) to 9 (초 진영)",
      columns: "0 (화면 왼쪽) to 8 (화면 오른쪽)",
      choForward: "row - 1",
      hanForward: "row + 1",
    },
    ruleProfile: {
      name: "common-janggi",
      choMovesFirst: true,
      passAllowedWhenNotInCheck: true,
      bikjangIsNotCheck: true,
      noChessStyleStalemate: true,
    },
    canPass: !isJanggiInCheck(game, game.turn) && game.status !== "checkmate",
    turn: game.turn,
    moveNumber: game.moveNumber,
    status: game.status,
    lastMove: game.lastMove,
    pieces: game.pieces
      .filter((piece) => piece.active)
      .map((piece) => ({
        id: piece.id,
        name: describeJanggiPiece(piece),
        label: piece.label,
        side: piece.side,
        kind: piece.kind,
        row: piece.row,
        col: piece.col,
        legalMoves:
          piece.side === game.turn ? getLegalJanggiMoves(game, piece.id) : [],
      })),
  };
}
