import { legalMoves } from '../rules';
import type { GameState, Move } from '../rules';
import { Position, codeToMove } from './engine';
import { searchRoot } from './search';
import type { AiMode } from './search';

export type { AiMode };

export interface AiOptions {
  mode: AiMode;
  timeMs: number;
  maxDepth: number;
  /** 0..1: chance per decision of playing a worse-but-plausible move instead of the best one. 0 = off. */
  blunderRate?: number;
}

export const DEFAULT_OPTIONS: AiOptions = { mode: 'draw', timeMs: 700, maxDepth: 8 };

export type AiLevel = 'easy' | 'medium' | 'hard';

/** Difficulty presets; pass `LEVEL_OPTIONS[level]` as the options of chooseMove / AiClient.choose. */
export const LEVEL_OPTIONS: Record<AiLevel, Partial<AiOptions>> = {
  easy: { mode: 'draw', maxDepth: 2, timeMs: 150, blunderRate: 0.35 },
  medium: { mode: 'draw', maxDepth: 4, timeMs: 400, blunderRate: 0.08 },
  hard: { mode: 'draw', maxDepth: 8, timeMs: 700, blunderRate: 0 },
};

function sameMove(a: Move, b: Move): boolean {
  if (a.type === 'place' && b.type === 'place') return a.to === b.to;
  if (a.type === 'move' && b.type === 'move') return a.from === b.from && a.to === b.to;
  if (a.type === 'remove' && b.type === 'remove') return a.at === b.at;
  return false;
}

/** Statistics of the last search (depth reached, nodes); handy for tests and tuning. */
export const lastSearch = { depth: 0, nodes: 0, score: 0 };

/**
 * Picks ONE move for `state.turn` (a capture is a separate `remove` move, so
 * callers loop while the AI is still on turn). Sync and pure with respect to `state`.
 */
export function chooseMove(state: GameState, opts: Partial<AiOptions> = {}): Move {
  const o: AiOptions = { ...DEFAULT_OPTIONS, ...opts };
  const legal = legalMoves(state);
  const first = legal[0];
  if (first === undefined) throw new Error('No legal moves');
  if (legal.length === 1) return first;

  const pos = Position.fromState(state);
  const res = searchRoot(pos, {
    mode: o.mode,
    timeMs: o.timeMs,
    maxDepth: o.maxDepth,
    blunderRate: o.blunderRate ?? 0,
    rnd: Math.random,
  });
  lastSearch.depth = res.depth;
  lastSearch.nodes = res.nodes;
  lastSearch.score = res.score;
  const move = codeToMove(res.code);
  // Safety net: never hand back something the rules engine would reject.
  if (legal.some((m) => sameMove(m, move))) return move;
  return legal[Math.floor(Math.random() * legal.length)] ?? first;
}
