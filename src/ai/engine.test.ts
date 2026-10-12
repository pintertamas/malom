import { describe, expect, it } from 'vitest';
import { applyMove, legalMoves, newGame } from '../rules';
import type { GameState, Move } from '../rules';
import { mulberry32 } from '../rules/testHelpers';
import { Position, moveToCode, codeToMove } from './engine';

function assertSame(pos: Position, s: GameState, label: string): void {
  for (let i = 0; i < 24; i++) {
    const c = s.board[i];
    if (pos.board[i] !== (c === null ? -1 : c)) throw new Error(`${label}: board differs at ${i}`);
  }
  if (pos.turn !== s.turn) throw new Error(`${label}: turn`);
  if (pos.pending !== s.pendingRemoval) throw new Error(`${label}: pending`);
  if (pos.toPlace[0] !== s.toPlace[0] || pos.toPlace[1] !== s.toPlace[1]) throw new Error(`${label}: toPlace`);
  if (pos.onBoard[0] !== s.onBoard[0] || pos.onBoard[1] !== s.onBoard[1]) throw new Error(`${label}: onBoard`);
  if (pos.msc !== s.movesSinceCapture) throw new Error(`${label}: msc`);
  const r = s.result === null ? -1 : s.result.winner === 'draw' ? 2 : s.result.winner;
  if (pos.result !== r) throw new Error(`${label}: result ${pos.result} vs ${r}`);
  const [h1, h2] = pos.fullHash();
  if (pos.h1 !== h1 || pos.h2 !== h2) throw new Error(`${label}: incremental hash drifted`);
}

function isBack(m: Move, last: Move | null): boolean {
  return m.type === 'move' && last?.type === 'move' && m.from === last.to && m.to === last.from;
}

function sortedCodes(moves: Move[]): number[] {
  return moves.map(moveToCode).sort((a, b) => a - b);
}

/** Plays a game through both implementations; `shuffle` biases toward undoing the last move. */
function playGame(rand: () => number, shuffle: boolean): { plies: number; reps: number; noCapture: number } {
  let s = newGame();
  const pos = Position.fromState(s);
  const buf = new Int32Array(128);
  let last: Move | null = null;
  let plies = 0;
  let reps = 0;
  let noCapture = 0;
  while (s.result === null) {
    const legal = legalMoves(s);
    const n = pos.generate(buf, 0);
    const mine = Array.from(buf.subarray(0, n)).sort((a, b) => a - b);
    expect(mine).toEqual(sortedCodes(legal));
    let move = legal[Math.floor(rand() * legal.length)] as Move;
    if (shuffle && last && last.type === 'move') {
      const back = legal.find((m) => isBack(m, last));
      if (back && rand() < 0.8) move = back;
    }
    last = move;
    s = applyMove(s, move);
    pos.make(moveToCode(move));
    plies++;
    assertSame(pos, s, `ply ${plies}`);
    if (s.result?.reason === 'repetition') reps++;
    if (s.result?.reason === 'no-capture-limit') noCapture++;
  }
  // unmake everything: must restore the initial position exactly
  for (let i = 0; i < plies; i++) pos.unmake();
  assertSame(pos, newGame(), 'after unmake');
  return { plies, reps, noCapture };
}

describe('engine fast path matches the rules engine', () => {
  it('agrees on moves, state, hash and results over random games', () => {
    const rand = mulberry32(12345);
    let games = 0;
    for (; games < 400; games++) playGame(rand, false);
    expect(games).toBe(400);
  });

  it('agrees on repetition and no-capture draws', () => {
    const rand = mulberry32(777);
    let reps = 0;
    let noCapture = 0;
    for (let g = 0; g < 1500; g++) {
      const r = playGame(rand, true);
      reps += r.reps;
      noCapture += r.noCapture;
    }
    expect(reps).toBeGreaterThan(0);
    expect(noCapture).toBeGreaterThan(0);
  });

  it('seeds repetition history from a mid-game state', () => {
    // Play until a few shuffles happened, then rebuild the Position from the state.
    const rand = mulberry32(99);
    for (let g = 0; g < 50; g++) {
      let s = newGame();
      let last: Move | null = null;
      for (let i = 0; i < 400 && s.result === null; i++) {
        const legal = legalMoves(s);
        let move = legal[Math.floor(rand() * legal.length)] as Move;
        if (last && last.type === 'move') {
          const back = legal.find((m) => isBack(m, last));
          if (back && rand() < 0.8) move = back;
        }
        last = move;
        s = applyMove(s, move);
        if (s.result !== null || s.pendingRemoval) continue;
        // Continue both implementations from here for up to 12 plies.
        const pos = Position.fromState(s);
        let t = s;
        for (let k = 0; k < 12 && t.result === null; k++) {
          const l2 = legalMoves(t);
          let m2 = l2[Math.floor(rand() * l2.length)] as Move;
          if (last.type === 'move' && k % 2 === 0) {
            const b2 = l2.find((m) => isBack(m, last));
            if (b2) m2 = b2;
          }
          last = m2;
          t = applyMove(t, m2);
          pos.make(moveToCode(m2));
          assertSame(pos, t, 'continued');
        }
        s = t;
      }
    }
  });

  it('round-trips move codes', () => {
    const m: Move[] = [
      { type: 'place', to: 23 },
      { type: 'move', from: 5, to: 6 },
      { type: 'remove', at: 0 },
    ];
    for (const x of m) expect(codeToMove(moveToCode(x))).toEqual(x);
  });
});
