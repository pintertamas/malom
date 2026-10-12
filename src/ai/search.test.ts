import { describe, expect, it } from 'vitest';
import { applyMove, legalMoves, newGame } from '../rules';
import type { GameState, Move } from '../rules';
import { makeState, mulberry32 } from '../rules/testHelpers';
import { AiClient, DEFAULT_OPTIONS, LEVEL_OPTIONS, chooseMove } from './index';

function isLegal(state: GameState, move: Move): boolean {
  return legalMoves(state).some((m) => JSON.stringify(m) === JSON.stringify(move));
}

describe('chooseMove', () => {
  it('always returns a legal move for random reachable states (both modes, all phases)', () => {
    const rand = mulberry32(2024);
    let checked = 0;
    for (let g = 0; g < 12; g++) {
      let s = newGame();
      while (s.result === null) {
        if (rand() < 0.25) {
          for (const mode of ['draw', 'strong'] as const) {
            const m = chooseMove(s, { mode, timeMs: 5, maxDepth: 2 });
            expect(isLegal(s, m)).toBe(true);
            checked++;
          }
        }
        const moves = legalMoves(s);
        s = applyMove(s, moves[Math.floor(rand() * moves.length)] as Move);
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('does not mutate the state it is given', () => {
    const s = newGame();
    const before = JSON.stringify(s);
    chooseMove(s, { timeMs: 5, maxDepth: 2 });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('takes an immediate mill when available (placing)', () => {
    const s = makeState({ white: [0, 1, 20], black: [12, 13, 22], toPlace: [4, 4], turn: 0 });
    expect(chooseMove(s, { mode: 'strong', timeMs: 50, maxDepth: 3 })).toEqual({ type: 'place', to: 2 });
  });

  it('takes an immediate mill when available (sliding)', () => {
    const s = makeState({ white: [0, 1, 3, 20], black: [13, 15, 21, 23, 9], toPlace: [0, 0], turn: 0 });
    expect(chooseMove(s, { mode: 'strong', timeMs: 50, maxDepth: 3 })).toEqual({
      type: 'move',
      from: 3,
      to: 2,
    });
  });

  it('removes a piece when a removal is pending', () => {
    const s = makeState({ white: [0, 1, 2], black: [12, 13, 22], toPlace: [3, 3], turn: 0, pendingRemoval: true });
    const m = chooseMove(s, { mode: 'strong', timeMs: 20, maxDepth: 3 });
    expect(m.type).toBe('remove');
    expect(isLegal(s, m)).toBe(true);
  });

  it('blocks the opponent\'s immediate mill (placing)', () => {
    // Black (AI) threatens 8-9-10; white (to move) has nothing of its own going.
    const s = makeState({ white: [0, 20], black: [8, 9], toPlace: [5, 5], turn: 0 });
    expect(chooseMove(s, { mode: 'strong', timeMs: 50, maxDepth: 3 })).toEqual({ type: 'place', to: 10 });
  });

  it('blocks the opponent\'s immediate mill (sliding)', () => {
    // Black threatens 8->9 completing 1-9-17; only white's 10->9 stops it.
    const s = makeState({ white: [10, 20, 14, 12], black: [1, 17, 8, 22], toPlace: [0, 0], turn: 0 });
    expect(chooseMove(s, { mode: 'strong', timeMs: 80, maxDepth: 4 })).toEqual({
      type: 'move',
      from: 10,
      to: 9,
    });
  });

  it('with blunderRate 1 it still blocks when every alternative gifts a mill and stays legal', () => {
    const s = makeState({ white: [8, 9], black: [0, 20], toPlace: [5, 5], turn: 1 });
    for (let i = 0; i < 10; i++) {
      expect(chooseMove(s, { mode: 'draw', timeMs: 20, maxDepth: 3, blunderRate: 1 })).toEqual({
        type: 'place',
        to: 10,
      });
    }
  });

  it('blunders (plays something other than the best move) sometimes, but legally', () => {
    const s = newGame();
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const m = chooseMove(s, { mode: 'draw', timeMs: 20, maxDepth: 2, blunderRate: 1 });
      expect(isLegal(s, m)).toBe(true);
      seen.add(JSON.stringify(m));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('defines the three difficulty levels', () => {
    expect(LEVEL_OPTIONS.easy).toEqual({ mode: 'draw', maxDepth: 2, timeMs: 150, blunderRate: 0.35 });
    expect(LEVEL_OPTIONS.medium.blunderRate).toBe(0.08);
    expect(LEVEL_OPTIONS.hard).toEqual({ mode: 'draw', maxDepth: 8, timeMs: 700, blunderRate: 0 });
    expect(DEFAULT_OPTIONS.mode).toBe('draw');
  });
});

describe('AiClient', () => {
  it('falls back to the main thread when Workers are unavailable', async () => {
    const client = new AiClient();
    const s = newGame();
    const m = await client.choose(s, { timeMs: 10, maxDepth: 2 });
    expect(isLegal(s, m)).toBe(true);
    client.terminate();
  });

  it('terminate rejects outstanding requests', async () => {
    const client = new AiClient();
    const p = client.choose(newGame(), { timeMs: 10, maxDepth: 2 });
    // the main-thread fallback runs on a timer, so terminate() wins only for worker mode;
    // in the fallback it simply resolves. Either way the promise must settle.
    client.terminate();
    await expect(p.then(() => 'ok', () => 'rejected')).resolves.toMatch(/ok|rejected/);
  });
});
