import { describe, expect, it } from 'vitest';
import { applyMove, legalMoves, newGame, positionKey } from './index';
import type { GameState, Player } from './index';
import { mulberry32 } from './testHelpers';

const MAX_PLIES = 5000;

/** Cheap assertion (vitest expect() is too slow for ~100k plies). */
function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`invariant violated: ${msg}`);
}

function assertConsistent(s: GameState): void {
  const counts: [number, number] = [0, 0];
  for (const c of s.board) if (c !== null) counts[c] += 1;
  check(s.board.length === 24, 'board length');
  check(counts[0] === s.onBoard[0] && counts[1] === s.onBoard[1], 'onBoard matches board');
  for (const p of [0, 1] as const) {
    check(s.toPlace[p] >= 0, 'toPlace >= 0');
    check(s.onBoard[p] >= 0, 'onBoard >= 0');
    check(s.onBoard[p] + s.toPlace[p] <= 9, 'at most 9 pieces per player');
  }
  check(s.movesSinceCapture >= 0 && s.movesSinceCapture <= 30, 'movesSinceCapture range');
  if (s.result === null && !s.pendingRemoval) {
    check((s.positionCounts[positionKey(s)] ?? 0) >= 1, 'current position recorded');
  }
  if (s.pendingRemoval) check(s.result === null, 'no result while removal pending');
}

describe('randomized playouts', () => {
  it('plays 2000 random games to completion consistently', () => {
    const rand = mulberry32(0xc0ffee);
    const reasons: Record<string, number> = {};
    const seen = { flying: false, removal: false };

    for (let game = 0; game < 2000; game++) {
      let s = newGame();
      let plies = 0;
      while (s.result === null) {
        const moves = legalMoves(s);
        check(moves.length > 0, 'ongoing game has legal moves');
        const mover: Player = s.turn;
        const opp: Player = mover === 0 ? 1 : 0;
        const m = moves[Math.floor(rand() * moves.length)]!;
        const next = applyMove(s, m);
        if (m.type === 'remove') {
          seen.removal = true;
          check(next.onBoard[opp] === s.onBoard[opp] - 1, 'removal lowers onBoard by one');
        }
        if (s.onBoard[mover] === 3 && s.toPlace[mover] === 0 && m.type === 'move') {
          seen.flying = true;
        }
        assertConsistent(next);
        s = next;
        plies++;
        if (plies > MAX_PLIES) throw new Error(`game ${game} did not terminate`);
      }
      const r = s.result;
      reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
      expect(legalMoves(s)).toEqual([]);
      const loser: Player = r.winner === 0 ? 1 : 0;
      if (r.reason === 'fewer-than-three') {
        expect(s.onBoard[loser] + s.toPlace[loser]).toBeLessThan(3);
      }
      if (r.reason === 'blocked') expect(s.turn).toBe(loser);
      if (r.reason === 'no-capture-limit') expect(s.movesSinceCapture).toBe(30);
    }

    expect(seen.removal).toBe(true);
    expect(seen.flying).toBe(true);
    expect(Object.values(reasons).reduce((a, b) => a + b, 0)).toBe(2000);
    console.log('playout reasons', reasons);
  });

  it('is deterministic for a given seed', () => {
    const run = (seed: number): string => {
      const rand = mulberry32(seed);
      let s = newGame();
      const log: string[] = [];
      while (s.result === null) {
        const moves = legalMoves(s);
        const m = moves[Math.floor(rand() * moves.length)]!;
        log.push(JSON.stringify(m));
        s = applyMove(s, m);
      }
      return log.join(',') + JSON.stringify(s.result);
    };
    expect(run(42)).toBe(run(42));
  });
});
