import { applyMove, legalMoves, newGame } from '../rules';
import type { GameState, Move, Player } from '../rules';
import { chooseMove } from './choose';
import type { AiOptions } from './choose';

export type Mover = (state: GameState) => Move;

export function randomMover(rand: () => number): Mover {
  return (s) => {
    const moves = legalMoves(s);
    return moves[Math.floor(rand() * moves.length)] as Move;
  };
}

export function aiMover(opts: Partial<AiOptions>): Mover {
  return (s) => chooseMove(s, opts);
}

export interface GameOutcome {
  winner: Player | 'draw';
  reason: string;
  plies: number;
}

/** Plays a full game; player 0 uses movers[0], player 1 uses movers[1]. */
export function playGame(movers: [Mover, Mover], maxPlies = 2000): GameOutcome {
  let s = newGame();
  let plies = 0;
  while (s.result === null) {
    if (plies++ > maxPlies) throw new Error('game did not terminate');
    s = applyMove(s, movers[s.turn](s));
  }
  return { winner: s.result.winner, reason: s.result.reason, plies };
}

export interface Tally {
  win: number;
  draw: number;
  loss: number;
}

/** Tally from the point of view of `subject` (0 or 1). */
export function tally(outcomes: { outcome: GameOutcome; subject: Player }[]): Tally {
  const t: Tally = { win: 0, draw: 0, loss: 0 };
  for (const { outcome, subject } of outcomes) {
    if (outcome.winner === 'draw') t.draw++;
    else if (outcome.winner === subject) t.win++;
    else t.loss++;
  }
  return t;
}
