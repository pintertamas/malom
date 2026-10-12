import { legalMoves } from '../rules';
import type { GameState, Move } from '../rules';

export type AiMode = 'draw' | 'strong';

export interface AiOptions {
  mode: AiMode;
  timeMs: number;
  maxDepth: number;
}

export const DEFAULT_OPTIONS: AiOptions = { mode: 'draw', timeMs: 700, maxDepth: 8 };

// Placeholder: replaced by the real search. Picks one move per call
// (a capture is a separate `remove` move, so callers loop while the AI is on turn).
export function chooseMove(state: GameState, opts: Partial<AiOptions> = {}): Move {
  void opts;
  const moves = legalMoves(state);
  const move = moves[Math.floor(Math.random() * moves.length)];
  if (!move) throw new Error('No legal moves');
  return move;
}

export class AiClient {
  choose(state: GameState, opts: Partial<AiOptions> = {}): Promise<Move> {
    return Promise.resolve(chooseMove(state, opts));
  }
  terminate(): void {}
}
