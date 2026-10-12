import { positionKey } from './game';
import type { Cell, GameState, Player } from './game';

/** Deterministic seeded PRNG (mulberry32) returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MakeStateOptions {
  white?: number[]; // points occupied by player 0
  black?: number[]; // points occupied by player 1
  toPlace?: [number, number];
  turn?: Player;
  pendingRemoval?: boolean;
  movesSinceCapture?: number;
}

/** Builds a hand-crafted state (counts derived from the board). */
export function makeState(opts: MakeStateOptions): GameState {
  const board: Cell[] = new Array<Cell>(24).fill(null);
  for (const p of opts.white ?? []) board[p] = 0;
  for (const p of opts.black ?? []) board[p] = 1;
  const state: GameState = {
    board,
    toPlace: opts.toPlace ?? [0, 0],
    onBoard: [(opts.white ?? []).length, (opts.black ?? []).length],
    turn: opts.turn ?? 0,
    pendingRemoval: opts.pendingRemoval ?? false,
    movesSinceCapture: opts.movesSinceCapture ?? 0,
    positionCounts: {},
    result: null,
  };
  state.positionCounts = { [positionKey(state)]: 1 };
  return state;
}

/** Recursively freezes a value so any accidental mutation throws (modules are strict). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}
