import { chooseMove } from './choose';
import type { AiOptions } from './choose';
import type { GameState, Move } from '../rules';

interface Request {
  id: number;
  state: GameState;
  opts?: Partial<AiOptions>;
}

// The DOM lib types `self` as Window; narrow it to the dedicated-worker surface we use.
const ctx = self as unknown as {
  onmessage: ((e: { data: Request }) => void) | null;
  postMessage(message: { id: number; move?: Move; error?: string }): void;
};

ctx.onmessage = (e) => {
  const { id, state, opts } = e.data;
  try {
    ctx.postMessage({ id, move: chooseMove(state, opts) });
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
