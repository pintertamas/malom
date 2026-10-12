import { describe, expect, it } from 'vitest';
import {
  NO_CAPTURE_LIMIT,
  REPETITION_LIMIT,
  applyMove,
  isInMill,
  legalMoves,
  newGame,
  phase,
  positionKey,
} from './index';
import type { GameState, Move } from './index';
import { deepFreeze, makeState } from './testHelpers';

function play(state: GameState, moves: Move[]): GameState {
  return moves.reduce((s, m) => applyMove(s, m), state);
}
const place = (to: number): Move => ({ type: 'place', to });
const slide = (from: number, to: number): Move => ({ type: 'move', from, to });
const remove = (at: number): Move => ({ type: 'remove', at });

describe('constants', () => {
  it('exports the draw thresholds', () => {
    expect(REPETITION_LIMIT).toBe(3);
    expect(NO_CAPTURE_LIMIT).toBe(30);
  });
});

describe('newGame', () => {
  it('starts empty, white to move, 9 pieces each', () => {
    const g = newGame();
    expect(g.board).toHaveLength(24);
    expect(g.board.every((c) => c === null)).toBe(true);
    expect(g.toPlace).toEqual([9, 9]);
    expect(g.onBoard).toEqual([0, 0]);
    expect(g.turn).toBe(0);
    expect(g.pendingRemoval).toBe(false);
    expect(g.movesSinceCapture).toBe(0);
    expect(g.result).toBeNull();
    expect(phase(g, 0)).toBe('placing');
    expect(phase(g, 1)).toBe('placing');
  });

  it('returns independent objects', () => {
    const a = newGame();
    const b = newGame();
    a.board[0] = 0;
    expect(b.board[0]).toBeNull();
  });
});

describe('perft from the start', () => {
  function perft(state: GameState, depth: number): number {
    if (depth === 0) return 1;
    let n = 0;
    for (const m of legalMoves(state)) n += perft(applyMove(state, m), depth - 1);
    return n;
  }
  it('has 24, 24*23 (and 24*23*22) nodes at depth 1, 2 (and 3)', () => {
    const g = newGame();
    expect(perft(g, 1)).toBe(24);
    expect(perft(g, 2)).toBe(24 * 23);
    expect(perft(g, 3)).toBe(24 * 23 * 22);
  });
});

describe('isInMill', () => {
  it('detects complete mills only for the owner', () => {
    const s = makeState({ white: [0, 1, 2, 9], black: [8, 10] });
    expect(isInMill(s.board, 0)).toBe(true);
    expect(isInMill(s.board, 1)).toBe(true);
    expect(isInMill(s.board, 2)).toBe(true);
    expect(isInMill(s.board, 9)).toBe(false);
    expect(isInMill(s.board, 8)).toBe(false);
    expect(isInMill(s.board, 5)).toBe(false); // empty
  });

  it('does not count mixed lines', () => {
    const s = makeState({ white: [0, 1], black: [2] });
    expect(isInMill(s.board, 1)).toBe(false);
  });

  it('detects connector mills', () => {
    const s = makeState({ black: [3, 11, 19] });
    expect(isInMill(s.board, 11)).toBe(true);
  });
});

describe('positionKey', () => {
  it('depends on board, turn, toPlace and pendingRemoval', () => {
    const g = newGame();
    const keys = new Set<string>([
      positionKey(g),
      positionKey({ ...g, turn: 1 }),
      positionKey({ ...g, toPlace: [8, 9] }),
      positionKey({ ...g, pendingRemoval: true }),
      positionKey(applyMove(g, place(0))),
    ]);
    expect(keys.size).toBe(5);
  });

  it('is equal for equal positions', () => {
    expect(positionKey(newGame())).toBe(positionKey(newGame()));
  });
});

describe('placing phase', () => {
  it('alternates placements and updates counts', () => {
    let s = newGame();
    s = applyMove(s, place(0));
    expect(s.board[0]).toBe(0);
    expect(s.toPlace).toEqual([8, 9]);
    expect(s.onBoard).toEqual([1, 0]);
    expect(s.turn).toBe(1);
    s = applyMove(s, place(5));
    expect(s.board[5]).toBe(1);
    expect(s.toPlace).toEqual([8, 8]);
    expect(s.onBoard).toEqual([1, 1]);
    expect(s.turn).toBe(0);
  });

  it('offers only placements on empty points', () => {
    const s = play(newGame(), [place(3), place(4)]);
    const moves = legalMoves(s);
    expect(moves).toHaveLength(22);
    expect(moves.every((m) => m.type === 'place' && m.to !== 3 && m.to !== 4)).toBe(true);
  });

  it('forms a mill, requires removal by the same player, then passes the turn', () => {
    let s = play(newGame(), [place(0), place(16), place(1), place(17), place(2)]);
    expect(s.pendingRemoval).toBe(true);
    expect(s.turn).toBe(0);
    expect(s.result).toBeNull();
    expect(legalMoves(s)).toEqual([remove(16), remove(17)]);
    s = applyMove(s, remove(16));
    expect(s.board[16]).toBeNull();
    expect(s.onBoard).toEqual([3, 1]);
    expect(s.toPlace).toEqual([6, 7]);
    expect(s.pendingRemoval).toBe(false);
    expect(s.turn).toBe(1);
    expect(s.movesSinceCapture).toBe(0);
  });

  it('protects pieces in mills when others are available', () => {
    const s = makeState({
      white: [0, 1],
      black: [16, 17, 18, 10],
      toPlace: [7, 5],
    });
    const m = applyMove(s, place(2));
    expect(m.pendingRemoval).toBe(true);
    expect(legalMoves(m)).toEqual([remove(10)]);
    expect(() => applyMove(m, remove(16))).toThrow();
    expect(() => applyMove(m, remove(17))).toThrow();
    expect(applyMove(m, remove(10)).board[10]).toBeNull();
  });

  it('allows removing any piece when all opponent pieces are in mills', () => {
    const s = makeState({
      white: [0, 1],
      black: [16, 17, 18],
      toPlace: [7, 6],
    });
    const m = applyMove(s, place(2));
    expect(legalMoves(m)).toEqual([remove(16), remove(17), remove(18)]);
    const after = applyMove(m, remove(17));
    expect(after.board[17]).toBeNull();
    expect(after.onBoard).toEqual([3, 2]);
  });

  it('a double mill still yields a single removal', () => {
    // Placing at 2 completes 0-1-2 and 2-3-4 at once.
    const s = makeState({ white: [0, 1, 3, 4], black: [8, 9, 12, 13], toPlace: [5, 5] });
    const m = applyMove(s, place(2));
    expect(m.pendingRemoval).toBe(true);
    const after = applyMove(m, remove(8));
    expect(after.pendingRemoval).toBe(false);
    expect(after.turn).toBe(1);
  });

  it('transitions to sliding after all 18 pieces are placed', () => {
    const whites = [0, 2, 4, 6, 9, 11, 13, 15, 17];
    const blacks = [1, 3, 5, 7, 8, 10, 12, 14, 19];
    let s = newGame();
    for (let i = 0; i < 9; i++) {
      s = applyMove(s, place(whites[i]!));
      expect(s.pendingRemoval).toBe(false);
      s = applyMove(s, place(blacks[i]!));
      expect(s.pendingRemoval).toBe(false);
    }
    expect(s.toPlace).toEqual([0, 0]);
    expect(s.onBoard).toEqual([9, 9]);
    expect(phase(s, 0)).toBe('moving');
    expect(phase(s, 1)).toBe('moving');
    expect(s.movesSinceCapture).toBe(0);
    expect(s.result).toBeNull();
    expect(legalMoves(s).every((m) => m.type === 'move')).toBe(true);
  });
});

describe('sliding phase', () => {
  it('slides to adjacent empty points only', () => {
    const s = makeState({ white: [0, 5, 11, 21], black: [8, 14, 18, 23] });
    expect(phase(s, 0)).toBe('moving');
    const moves = legalMoves(s);
    expect(moves).toContainEqual(slide(0, 1));
    expect(moves).toContainEqual(slide(0, 7));
    expect(moves).not.toContainEqual(slide(0, 9));
    expect(moves.every((m) => m.type === 'move')).toBe(true);
    const after = applyMove(s, slide(0, 1));
    expect(after.board[0]).toBeNull();
    expect(after.board[1]).toBe(0);
    expect(after.turn).toBe(1);
    expect(after.movesSinceCapture).toBe(1);
  });

  it('rejects non-adjacent, occupied, wrong-owner and empty-source moves', () => {
    const s = makeState({ white: [0, 5, 11, 21], black: [8, 14, 18, 23] });
    expect(() => applyMove(s, slide(0, 2))).toThrow(); // not adjacent
    expect(() => applyMove(s, slide(0, 9))).toThrow(); // not adjacent
    expect(() => applyMove(s, slide(0, 0))).toThrow(); // same point
    expect(() => applyMove(s, slide(8, 9))).toThrow(); // opponent piece
    expect(() => applyMove(s, slide(1, 2))).toThrow(); // empty source
    expect(() => applyMove(s, place(3))).toThrow(); // nothing to place
    const occupied = makeState({ white: [0, 1, 11, 21], black: [8, 14, 18, 23] });
    expect(() => applyMove(occupied, slide(0, 1))).toThrow();
  });

  it('forming a mill by sliding requires a removal', () => {
    const s = makeState({ white: [0, 1, 3, 21], black: [12, 13, 20, 22] });
    const m = applyMove(s, slide(3, 2));
    expect(m.pendingRemoval).toBe(true);
    expect(m.turn).toBe(0);
    expect(m.movesSinceCapture).toBe(0);
    expect(legalMoves(m).every((x) => x.type === 'remove')).toBe(true);
    expect(() => applyMove(m, slide(21, 20))).toThrow();
    const after = applyMove(m, remove(12));
    expect(after.turn).toBe(1);
    expect(after.onBoard).toEqual([4, 3]);
    expect(after.result).toBeNull();
  });

  it('re-forming a mill by moving out and back in is allowed', () => {
    let s = makeState({ white: [0, 1, 2, 21], black: [12, 13, 20, 22] });
    s = applyMove(s, slide(2, 3));
    s = applyMove(s, slide(12, 11));
    s = applyMove(s, slide(3, 2));
    expect(s.pendingRemoval).toBe(true);
  });
});

describe('flying', () => {
  it('a player with exactly 3 pieces and nothing to place may fly anywhere empty', () => {
    const s = makeState({ white: [0, 5, 10], black: [12, 14, 20, 22] });
    expect(phase(s, 0)).toBe('flying');
    expect(phase(s, 1)).toBe('moving');
    expect(legalMoves(s)).toHaveLength(3 * (24 - 7));
    const after = applyMove(s, slide(0, 17));
    expect(after.board[17]).toBe(0);
    expect(after.board[0]).toBeNull();
  });

  it('flying is independent per player', () => {
    const s = makeState({ white: [0, 5, 10], black: [12, 14, 20, 22], turn: 1 });
    // black has 4 pieces: cannot fly
    expect(() => applyMove(s, slide(12, 2))).toThrow();
    expect(legalMoves(s).every((m) => m.type === 'move' && m.to !== 2)).toBe(true);
  });

  it('a flying piece can form a mill', () => {
    const s = makeState({ white: [0, 1, 20], black: [12, 14, 22, 18] });
    const m = applyMove(s, slide(20, 2));
    expect(m.pendingRemoval).toBe(true);
  });

  it('a 4-piece player cannot fly', () => {
    const s = makeState({ white: [0, 5, 10, 21], black: [12, 14, 22, 18] });
    expect(phase(s, 0)).toBe('moving');
    expect(() => applyMove(s, slide(0, 17))).toThrow();
  });

  it('a player with onBoard + toPlace == 3 cannot fly until nothing is left to place', () => {
    const s = makeState({ white: [0, 5], black: [12, 14, 22, 18], toPlace: [1, 0] });
    expect(phase(s, 0)).toBe('placing');
    expect(() => applyMove(s, slide(0, 17))).toThrow();
    expect(legalMoves(s).every((m) => m.type === 'place')).toBe(true);
    const placed = applyMove(s, place(10));
    expect(phase(placed, 0)).toBe('flying');
  });

  it('a player with 3 pieces on board but pieces left to place still places', () => {
    const s = makeState({ white: [0, 5, 10], black: [12, 14, 22, 18], toPlace: [2, 0] });
    expect(phase(s, 0)).toBe('placing');
    expect(() => applyMove(s, slide(0, 17))).toThrow();
  });
});

describe('end conditions', () => {
  it('a capture leaving fewer than three pieces wins the game', () => {
    const s = makeState({ white: [0, 1, 3, 21], black: [12, 14, 22] });
    const m = applyMove(s, slide(3, 2));
    expect(m.result).toBeNull(); // not over until the removal happens
    const after = applyMove(m, remove(12));
    expect(after.result).toEqual({ winner: 0, reason: 'fewer-than-three' });
    expect(legalMoves(after)).toEqual([]);
    expect(() => applyMove(after, slide(0, 7))).toThrow();
  });

  it('works for black as the winner too', () => {
    const s = makeState({ white: [12, 14, 22], black: [0, 1, 3, 21], turn: 1 });
    const after = applyMove(applyMove(s, slide(3, 2)), remove(14));
    expect(after.result).toEqual({ winner: 1, reason: 'fewer-than-three' });
  });

  it('counts pieces still to be placed towards the total', () => {
    const s = makeState({ white: [0, 1], black: [12, 14], toPlace: [7, 2] });
    const after = applyMove(applyMove(s, place(2)), remove(12));
    expect(after.onBoard[1]).toBe(1);
    expect(after.result).toBeNull(); // 1 on board + 2 to place = 3
  });

  it('declares fewer-than-three when onBoard + toPlace drops under three while placing', () => {
    const s = makeState({ white: [0, 1], black: [12, 14], toPlace: [7, 1] });
    const after = applyMove(applyMove(s, place(2)), remove(12));
    expect(after.result).toEqual({ winner: 0, reason: 'fewer-than-three' });
  });

  it('does not end the game when the opponent total stays at three or more', () => {
    const s = makeState({ white: [0, 1], black: [12, 14, 22, 18], toPlace: [7, 0] });
    const after = applyMove(applyMove(s, place(2)), remove(12));
    expect(after.result).toBeNull();
    expect(phase(after, 1)).toBe('flying');
  });

  it('a blocked player loses', () => {
    const s = makeState({ white: [1, 3, 5, 15], black: [0, 2, 4, 6] });
    const after = applyMove(s, slide(15, 7));
    expect(after.result).toEqual({ winner: 0, reason: 'blocked' });
    expect(legalMoves(after)).toEqual([]);
  });

  it('a blocked-looking player with only three pieces can fly and is not blocked', () => {
    const s = makeState({ white: [1, 3, 5, 15], black: [0, 2, 4] });
    const after = applyMove(s, slide(15, 7));
    expect(after.result).toBeNull();
    expect(phase(after, 1)).toBe('flying');
    expect(legalMoves(after).length).toBeGreaterThan(0);
  });
});

describe('draws', () => {
  it('declares a draw by threefold repetition', () => {
    let s = makeState({ white: [0, 5, 11, 21], black: [9, 14, 19, 23] });
    const cycle = [slide(0, 1), slide(14, 15), slide(1, 0), slide(15, 14)];
    for (let round = 0; round < REPETITION_LIMIT - 1; round++) {
      for (const m of cycle) {
        expect(s.result).toBeNull();
        s = applyMove(s, m);
      }
    }
    expect(s.result).toEqual({ winner: 'draw', reason: 'repetition' });
    expect(s.positionCounts[positionKey(s)]).toBe(REPETITION_LIMIT);
    expect(legalMoves(s)).toEqual([]);
  });

  it('does not draw after only two occurrences', () => {
    let s = makeState({ white: [0, 5, 11, 21], black: [9, 14, 19, 23] });
    for (const m of [slide(0, 1), slide(14, 15), slide(1, 0), slide(15, 14)]) s = applyMove(s, m);
    expect(s.result).toBeNull();
    expect(s.positionCounts[positionKey(s)]).toBe(2);
  });

  it('declares a draw after NO_CAPTURE_LIMIT moves without a capture', () => {
    let s = makeState({
      white: [0, 5, 11, 21],
      black: [9, 14, 19, 23],
      movesSinceCapture: NO_CAPTURE_LIMIT - 2,
    });
    s = applyMove(s, slide(0, 1));
    expect(s.movesSinceCapture).toBe(NO_CAPTURE_LIMIT - 1);
    expect(s.result).toBeNull();
    s = applyMove(s, slide(14, 15));
    expect(s.movesSinceCapture).toBe(NO_CAPTURE_LIMIT);
    expect(s.result).toEqual({ winner: 'draw', reason: 'no-capture-limit' });
  });

  it('a capture resets movesSinceCapture', () => {
    const s = makeState({
      white: [0, 1, 3, 21],
      black: [12, 13, 20, 22],
      movesSinceCapture: NO_CAPTURE_LIMIT - 2,
    });
    const m = applyMove(s, slide(3, 2));
    expect(m.movesSinceCapture).toBe(NO_CAPTURE_LIMIT - 2); // turn not completed yet
    const after = applyMove(m, remove(12));
    expect(after.movesSinceCapture).toBe(0);
    expect(after.result).toBeNull();
  });

  it('placement turns do not count towards the no-capture limit', () => {
    let s = newGame();
    s = applyMove(s, place(0));
    s = applyMove(s, place(5));
    expect(s.movesSinceCapture).toBe(0);
  });

  it('a winning capture takes precedence over the no-capture draw', () => {
    const s = makeState({
      white: [0, 1, 3, 21],
      black: [12, 14, 22],
      movesSinceCapture: NO_CAPTURE_LIMIT - 1,
    });
    const after = applyMove(applyMove(s, slide(3, 2)), remove(12));
    expect(after.result).toEqual({ winner: 0, reason: 'fewer-than-three' });
  });

  it('a blocked loss takes precedence over the no-capture draw on the same turn', () => {
    const s = makeState({
      white: [1, 3, 5, 15],
      black: [0, 2, 4, 6],
      movesSinceCapture: NO_CAPTURE_LIMIT - 1,
    });
    const after = applyMove(s, slide(15, 7));
    expect(after.result).toEqual({ winner: 0, reason: 'blocked' });
  });
});

describe('illegal moves throw', () => {
  it('rejects placing on an occupied point', () => {
    const s = applyMove(newGame(), place(0));
    expect(() => applyMove(s, place(0))).toThrow();
  });

  it('rejects out-of-range and non-integer points', () => {
    const g = newGame();
    expect(() => applyMove(g, place(-1))).toThrow();
    expect(() => applyMove(g, place(24))).toThrow();
    expect(() => applyMove(g, place(1.5))).toThrow();
    expect(() => applyMove(g, place(Number.NaN))).toThrow();
  });

  it('rejects moving or removing during the placing phase', () => {
    const s = applyMove(newGame(), place(0));
    expect(() => applyMove(s, slide(0, 1))).toThrow();
    expect(() => applyMove(newGame(), remove(0))).toThrow();
  });

  it('rejects removal when no mill is pending', () => {
    const s = makeState({ white: [0, 5, 11, 21], black: [9, 14, 19, 23] });
    expect(() => applyMove(s, remove(9))).toThrow();
  });

  it('rejects anything but a removal while one is pending', () => {
    const m = play(newGame(), [place(0), place(16), place(1), place(17), place(2)]);
    expect(() => applyMove(m, place(3))).toThrow();
    expect(() => applyMove(m, slide(0, 7))).toThrow();
  });

  it('rejects removing own pieces or empty points', () => {
    const m = play(newGame(), [place(0), place(16), place(1), place(17), place(2)]);
    expect(() => applyMove(m, remove(0))).toThrow();
    expect(() => applyMove(m, remove(5))).toThrow();
    expect(() => applyMove(m, remove(99))).toThrow();
  });

  it('rejects placing when no pieces are left to place', () => {
    const s = makeState({ white: [0, 5, 11, 21], black: [9, 14, 19, 23] });
    expect(() => applyMove(s, place(3))).toThrow();
  });

  it('rejects moves after the game is over', () => {
    const s = makeState({ white: [1, 3, 5, 15], black: [0, 2, 4, 6] });
    const over = applyMove(s, slide(15, 7));
    expect(over.result).not.toBeNull();
    expect(() => applyMove(over, slide(0, 1))).toThrow();
    expect(() => applyMove(over, place(0))).toThrow();
  });

  it('accepts every move from legalMoves and rejects every other placement', () => {
    const s = play(newGame(), [place(3), place(4)]);
    const legal = legalMoves(s);
    for (const m of legal) expect(() => applyMove(s, m)).not.toThrow();
    for (let to = 0; to < 24; to++) {
      const isLegal = legal.some((m) => m.type === 'place' && m.to === to);
      if (!isLegal) expect(() => applyMove(s, place(to))).toThrow();
    }
  });
});

describe('immutability', () => {
  it('does not mutate the previous state', () => {
    const g = newGame();
    const before = JSON.stringify(g);
    const next = applyMove(g, place(4));
    expect(JSON.stringify(g)).toBe(before);
    expect(next.board).not.toBe(g.board);
    expect(next.toPlace).not.toBe(g.toPlace);
    expect(next.onBoard).not.toBe(g.onBoard);
  });

  it('works on deeply frozen states through a mill, removal and slides', () => {
    let s = deepFreeze(newGame());
    const moves: Move[] = [place(0), place(16), place(1), place(17), place(2), remove(16)];
    for (const m of moves) s = deepFreeze(applyMove(s, m));
    expect(s.onBoard).toEqual([3, 1]);
    const t = deepFreeze(makeState({ white: [0, 5, 11, 21], black: [9, 14, 19, 23] }));
    const before = JSON.stringify(t);
    const u = applyMove(t, slide(0, 1));
    expect(JSON.stringify(t)).toBe(before);
    expect(u.positionCounts).not.toBe(t.positionCounts);
  });

  it('legalMoves does not mutate and returns fresh arrays', () => {
    const s = deepFreeze(newGame());
    const a = legalMoves(s);
    const b = legalMoves(s);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
