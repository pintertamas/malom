import { ADJACENT, MILLS_BY_POINT, POINT_COUNT } from './board';

export type Player = 0 | 1; // 0 = human (white), 1 = AI (black); player 0 moves first
export type Cell = Player | null;
export type Move =
  | { type: 'place'; to: number }
  | { type: 'move'; from: number; to: number } // slide, or fly when that player has exactly 3 pieces on board and nothing left to place
  | { type: 'remove'; at: number }; // only legal right after a mill, as a separate move by the same player
export type GameResult = {
  winner: Player | 'draw';
  reason: 'fewer-than-three' | 'blocked' | 'no-capture-limit' | 'repetition';
};

export interface GameState {
  board: Cell[]; // length 24
  toPlace: [number, number]; // pieces still to be placed, per player (start 9,9)
  onBoard: [number, number];
  turn: Player; // whose move it is (also the player who must remove when pendingRemoval)
  pendingRemoval: boolean;
  /**
   * Number of completed moving-phase turns (slides/flies) since the last capture.
   * DESIGN DECISION: placement turns are NOT counted. Counting them would put 18
   * turns on the clock before the moving phase even starts, leaving only 12 turns
   * to find a capture. Counting only moves means the limit can never trigger
   * during the placing phase, and it is a clean 30-turn (15 per player) window of
   * sliding/flying without a capture. Resets to 0 on a capture.
   */
  movesSinceCapture: number;
  /**
   * Occurrences of positionKey after completed turns, for threefold repetition.
   * Placements and captures are irreversible (toPlace only shrinks, pieces are
   * only removed), so no earlier position can ever recur after them; the table is
   * therefore reset to just the new position on those, which keeps it tiny.
   */
  positionCounts: Record<string, number>;
  result: GameResult | null;
}

export const REPETITION_LIMIT = 3;
export const NO_CAPTURE_LIMIT = 30;

const PIECES_PER_PLAYER = 9;

function other(p: Player): Player {
  return p === 0 ? 1 : 0;
}

export function newGame(): GameState {
  return {
    board: new Array<Cell>(POINT_COUNT).fill(null),
    toPlace: [PIECES_PER_PLAYER, PIECES_PER_PLAYER],
    onBoard: [0, 0],
    turn: 0,
    pendingRemoval: false,
    movesSinceCapture: 0,
    positionCounts: {},
    result: null,
  };
}

export function phase(state: GameState, player: Player): 'placing' | 'moving' | 'flying' {
  if (state.toPlace[player] > 0) return 'placing';
  if (state.onBoard[player] === 3) return 'flying';
  return 'moving';
}

/** True if the (occupied) point is part of a complete mill of its owner's pieces. */
export function isInMill(board: Cell[], point: number): boolean {
  const owner = board[point];
  if (owner === null || owner === undefined) return false;
  const mills = MILLS_BY_POINT[point];
  if (!mills) return false;
  for (const [a, b, c] of mills) {
    if (board[a] === owner && board[b] === owner && board[c] === owner) return true;
  }
  return false;
}

export function positionKey(state: GameState): string {
  let s = '';
  for (const c of state.board) s += c === null ? '.' : c === 0 ? '0' : '1';
  return `${s}|${state.turn}|${state.toPlace[0]},${state.toPlace[1]}|${state.pendingRemoval ? 1 : 0}`;
}

/** Opponent points that the player `by` may remove right now. */
function removablePoints(board: Cell[], by: Player): number[] {
  const opp = other(by);
  const all: number[] = [];
  const unprotected: number[] = [];
  for (let i = 0; i < POINT_COUNT; i++) {
    if (board[i] !== opp) continue;
    all.push(i);
    if (!isInMill(board, i)) unprotected.push(i);
  }
  return unprotected.length > 0 ? unprotected : all;
}

/** Moves available to `player` for a normal (non-removal) turn. */
function turnMoves(
  board: Cell[],
  toPlace: [number, number],
  onBoard: [number, number],
  player: Player,
  firstOnly = false,
): Move[] {
  const moves: Move[] = [];
  if (toPlace[player] > 0) {
    for (let to = 0; to < POINT_COUNT; to++) {
      if (board[to] === null) {
        moves.push({ type: 'place', to });
        if (firstOnly) return moves;
      }
    }
    return moves;
  }
  const flying = onBoard[player] === 3;
  for (let from = 0; from < POINT_COUNT; from++) {
    if (board[from] !== player) continue;
    if (flying) {
      for (let to = 0; to < POINT_COUNT; to++) {
        if (board[to] === null) {
          moves.push({ type: 'move', from, to });
          if (firstOnly) return moves;
        }
      }
    } else {
      for (const to of ADJACENT[from] ?? []) {
        if (board[to] === null) {
          moves.push({ type: 'move', from, to });
          if (firstOnly) return moves;
        }
      }
    }
  }
  return moves;
}

export function legalMoves(state: GameState): Move[] {
  if (state.result !== null) return [];
  if (state.pendingRemoval) {
    return removablePoints(state.board, state.turn).map((at) => ({ type: 'remove', at }));
  }
  return turnMoves(state.board, state.toPlace, state.onBoard, state.turn);
}

function illegal(message: string): never {
  throw new Error(`Illegal move: ${message}`);
}

function checkPoint(p: number, what: string): void {
  if (!Number.isInteger(p) || p < 0 || p >= POINT_COUNT) {
    illegal(`${what} ${String(p)} is not a board point`);
  }
}

export function applyMove(state: GameState, move: Move): GameState {
  if (state.result !== null) illegal('game is already over');
  const player = state.turn;
  const opp = other(player);
  const board = state.board.slice();
  const toPlace: [number, number] = [state.toPlace[0], state.toPlace[1]];
  const onBoard: [number, number] = [state.onBoard[0], state.onBoard[1]];

  if (state.pendingRemoval) {
    if (move.type !== 'remove') illegal('a removal is required');
    checkPoint(move.at, 'remove target');
    if (board[move.at] !== opp) illegal(`point ${move.at} does not hold an opponent piece`);
    if (!removablePoints(board, player).includes(move.at)) {
      illegal(`point ${move.at} is protected by a mill`);
    }
    board[move.at] = null;
    onBoard[opp] -= 1;
    return finishTurn(state, board, toPlace, onBoard, player, {
      captured: true,
      irreversible: true,
      counted: false,
    });
  }

  switch (move.type) {
    case 'remove':
      return illegal('no mill was formed, nothing to remove');
    case 'place': {
      if (toPlace[player] <= 0) illegal('no pieces left to place');
      checkPoint(move.to, 'place target');
      if (board[move.to] !== null) illegal(`point ${move.to} is occupied`);
      board[move.to] = player;
      toPlace[player] -= 1;
      onBoard[player] += 1;
      return afterMovement(state, board, toPlace, onBoard, player, move.to, true);
    }
    case 'move': {
      if (toPlace[player] > 0) illegal('must place all pieces before moving');
      checkPoint(move.from, 'move source');
      checkPoint(move.to, 'move target');
      if (board[move.from] !== player) illegal(`point ${move.from} does not hold your piece`);
      if (board[move.to] !== null) illegal(`point ${move.to} is occupied`);
      const flying = onBoard[player] === 3;
      if (!flying && !(ADJACENT[move.from] ?? []).includes(move.to)) {
        illegal(`points ${move.from} and ${move.to} are not adjacent`);
      }
      board[move.from] = null;
      board[move.to] = player;
      return afterMovement(state, board, toPlace, onBoard, player, move.to, false);
    }
  }
}

/** Handles mill detection after a place/move; either awaits removal or finishes the turn. */
function afterMovement(
  prev: GameState,
  board: Cell[],
  toPlace: [number, number],
  onBoard: [number, number],
  player: Player,
  to: number,
  isPlacement: boolean,
): GameState {
  const opp = other(player);
  // A mill with nothing to remove (opponent has no pieces on board) is possible
  // only in odd hand-built positions; the turn then completes without a capture.
  if (isInMill(board, to) && onBoard[opp] > 0) {
    return {
      board,
      toPlace,
      onBoard,
      turn: player,
      pendingRemoval: true,
      movesSinceCapture: prev.movesSinceCapture,
      positionCounts: prev.positionCounts,
      result: null,
    };
  }
  return finishTurn(prev, board, toPlace, onBoard, player, {
    captured: false,
    irreversible: isPlacement,
    counted: !isPlacement,
  });
}

/** Completes a turn: passes play to the opponent and evaluates win/draw conditions. */
function finishTurn(
  prev: GameState,
  board: Cell[],
  toPlace: [number, number],
  onBoard: [number, number],
  mover: Player,
  info: { captured: boolean; irreversible: boolean; counted: boolean },
): GameState {
  const next = other(mover);
  const movesSinceCapture = info.captured ? 0 : prev.movesSinceCapture + (info.counted ? 1 : 0);

  const state: GameState = {
    board,
    toPlace,
    onBoard,
    turn: next,
    pendingRemoval: false,
    movesSinceCapture,
    positionCounts: prev.positionCounts,
    result: null,
  };

  const key = positionKey(state);
  let count: number;
  if (info.irreversible) {
    state.positionCounts = { [key]: 1 };
    count = 1;
  } else {
    count = (prev.positionCounts[key] ?? 0) + 1;
    state.positionCounts = { ...prev.positionCounts, [key]: count };
  }

  // Wins take precedence over draws.
  if (info.captured && onBoard[next] + toPlace[next] < 3) {
    state.result = { winner: mover, reason: 'fewer-than-three' };
  } else if (turnMoves(board, toPlace, onBoard, next, true).length === 0) {
    state.result = { winner: mover, reason: 'blocked' };
  } else if (count >= REPETITION_LIMIT) {
    state.result = { winner: 'draw', reason: 'repetition' };
  } else if (movesSinceCapture >= NO_CAPTURE_LIMIT) {
    state.result = { winner: 'draw', reason: 'no-capture-limit' };
  }
  return state;
}
