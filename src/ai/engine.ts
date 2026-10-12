/**
 * Compact, mutable position used by the search (typed arrays + make/unmake).
 *
 * It re-implements the rules engine's transitions (place / move / fly / remove,
 * mills, wins, blocked, repetition, no-capture limit) as a fast path. Equivalence
 * with `applyMove` / `legalMoves` is verified by randomized tests in
 * engine.test.ts, so the rules engine stays the single source of truth.
 */
import { ADJACENT, MILLS } from '../rules';
import type { GameState, Move } from '../rules';

export const T_PLACE = 0;
export const T_MOVE = 1;
export const T_REMOVE = 2;

/** No result yet. Otherwise 0/1 = winner, DRAW = drawn. */
export const NONE = -1;
export const DRAW = 2;

const VALID = 1 << 12;

/** Move code: type<<10 | from<<5 | to, plus a VALID bit so that 0 means "no move". */
export function enc(type: number, from: number, to: number): number {
  return VALID | (type << 10) | (from << 5) | to;
}
export const codeType = (c: number): number => (c >> 10) & 3;
export const codeFrom = (c: number): number => (c >> 5) & 31;
export const codeTo = (c: number): number => c & 31;

export function codeToMove(c: number): Move {
  const t = codeType(c);
  if (t === T_PLACE) return { type: 'place', to: codeTo(c) };
  if (t === T_MOVE) return { type: 'move', from: codeFrom(c), to: codeTo(c) };
  return { type: 'remove', at: codeTo(c) };
}

export function moveToCode(m: Move): number {
  if (m.type === 'place') return enc(T_PLACE, 0, m.to);
  if (m.type === 'move') return enc(T_MOVE, m.from, m.to);
  return enc(T_REMOVE, 0, m.at);
}

// ---------------------------------------------------------------- tables

export const N_LINES = MILLS.length; // 16
/** LINE[l*3 .. l*3+2] = the three points of line l. */
export const LINE = new Int8Array(N_LINES * 3);
/** PT_LINES[p*2], PT_LINES[p*2+1] = the two lines through point p. */
export const PT_LINES = new Int8Array(24 * 2);
export const ADJ_N = new Int8Array(24);
/** ADJ_P[p*4 + k] = k-th neighbour of p. */
export const ADJ_P = new Int8Array(24 * 4);

(() => {
  const fill = new Int8Array(24);
  MILLS.forEach((m, l) => {
    for (let k = 0; k < 3; k++) {
      const p = m[k] as number;
      LINE[l * 3 + k] = p;
      PT_LINES[p * 2 + (fill[p] as number)] = l;
      fill[p] = (fill[p] as number) + 1;
    }
  });
  for (let p = 0; p < 24; p++) {
    const adj = ADJACENT[p] ?? [];
    ADJ_N[p] = adj.length;
    adj.forEach((q, k) => {
      ADJ_P[p * 4 + k] = q;
    });
  }
})();

// ---------------------------------------------------------------- hashing

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) | 0;
  };
}
const zr = makeRng(0x5eed1234);
const tab = (n: number): Int32Array => Int32Array.from({ length: n }, () => zr());
const ZB1 = tab(48); // [point*2 + player]
const ZB2 = tab(48);
const ZT1 = tab(2); // turn == 1
const ZT2 = tab(2);
const ZP1 = tab(20); // [player*10 + toPlace]
const ZP2 = tab(20);
const ZR1 = tab(2); // pending removal
const ZR2 = tab(2);

/** Hash of a position given as raw parts (used for the root and for parsing rule keys). */
function hashParts(
  cell: (p: number) => number,
  turn: number,
  tp0: number,
  tp1: number,
  pending: boolean,
): [number, number] {
  let h1 = 0;
  let h2 = 0;
  for (let p = 0; p < 24; p++) {
    const c = cell(p);
    if (c >= 0) {
      h1 ^= ZB1[p * 2 + c] as number;
      h2 ^= ZB2[p * 2 + c] as number;
    }
  }
  if (turn === 1) {
    h1 ^= ZT1[0] as number;
    h2 ^= ZT2[0] as number;
  }
  h1 ^= ZP1[tp0] as number;
  h2 ^= ZP2[tp0] as number;
  h1 ^= ZP1[10 + tp1] as number;
  h2 ^= ZP2[10 + tp1] as number;
  if (pending) {
    h1 ^= ZR1[0] as number;
    h2 ^= ZR2[0] as number;
  }
  return [h1, h2];
}

// ---------------------------------------------------------------- position

const UNDO_CAP = 512;
const REP_CAP = 1024;
export const NO_CAPTURE_LIMIT_ENGINE = 30;
const REPETITION_LIMIT_ENGINE = 3;

export class Position {
  readonly board = new Int8Array(24).fill(-1);
  readonly toPlace = new Int8Array(2);
  readonly onBoard = new Int8Array(2);
  turn = 0;
  pending = false;
  msc = 0;
  h1 = 0;
  h2 = 0;
  /** NONE, winner (0/1) or DRAW, as produced by the last make(). */
  result = NONE;

  private readonly rep1 = new Int32Array(REP_CAP);
  private readonly rep2 = new Int32Array(REP_CAP);
  private repLen = 0;
  private repBase = 0;

  private sp = 0;
  private readonly uCode = new Int32Array(UNDO_CAP);
  private readonly uTurn = new Int8Array(UNDO_CAP);
  private readonly uPend = new Int8Array(UNDO_CAP);
  private readonly uMsc = new Int32Array(UNDO_CAP);
  private readonly uH1 = new Int32Array(UNDO_CAP);
  private readonly uH2 = new Int32Array(UNDO_CAP);
  private readonly uRepLen = new Int32Array(UNDO_CAP);
  private readonly uRepBase = new Int32Array(UNDO_CAP);

  static fromState(state: GameState): Position {
    const p = new Position();
    for (let i = 0; i < 24; i++) {
      const c = state.board[i];
      p.board[i] = c === null || c === undefined ? -1 : c;
    }
    p.toPlace[0] = state.toPlace[0];
    p.toPlace[1] = state.toPlace[1];
    p.onBoard[0] = state.onBoard[0];
    p.onBoard[1] = state.onBoard[1];
    p.turn = state.turn;
    p.pending = state.pendingRemoval;
    p.msc = state.movesSinceCapture;
    p.rehash();
    // Seed the repetition window from the rules engine's position counts.
    for (const [key, count] of Object.entries(state.positionCounts)) {
      const [cells = '', t = '0', tp = '0,0'] = key.split('|');
      const [a = '0', b = '0'] = tp.split(',');
      const [h1, h2] = hashParts(
        (i) => (cells[i] === '0' ? 0 : cells[i] === '1' ? 1 : -1),
        t === '1' ? 1 : 0,
        Number(a),
        Number(b),
        false,
      );
      for (let k = 0; k < count && p.repLen < REP_CAP / 2; k++) {
        p.rep1[p.repLen] = h1;
        p.rep2[p.repLen] = h2;
        p.repLen++;
      }
    }
    return p;
  }

  rehash(): void {
    const [a, b] = this.fullHash();
    this.h1 = a;
    this.h2 = b;
  }

  fullHash(): [number, number] {
    return hashParts(
      (i) => this.board[i] as number,
      this.turn,
      this.toPlace[0] as number,
      this.toPlace[1] as number,
      this.pending,
    );
  }

  inMill(pt: number, owner: number): boolean {
    const b = this.board;
    for (let k = 0; k < 2; k++) {
      const l = (PT_LINES[pt * 2 + k] as number) * 3;
      if (
        b[LINE[l] as number] === owner &&
        b[LINE[l + 1] as number] === owner &&
        b[LINE[l + 2] as number] === owner
      ) {
        return true;
      }
    }
    return false;
  }

  /** Would placing (from < 0) or moving a piece `from`->`to` complete a mill for `player`? */
  formsMill(player: number, from: number, to: number): boolean {
    const b = this.board;
    for (let k = 0; k < 2; k++) {
      const l = (PT_LINES[to * 2 + k] as number) * 3;
      let own = 0;
      for (let j = 0; j < 3; j++) {
        const q = LINE[l + j] as number;
        if (q !== to && q !== from && b[q] === player) own++;
      }
      if (own === 2) return true;
    }
    return false;
  }

  private hasMoves(player: number): boolean {
    const b = this.board;
    if ((this.toPlace[player] as number) > 0 || this.onBoard[player] === 3) {
      for (let i = 0; i < 24; i++) if (b[i] === -1) return true;
      return false;
    }
    for (let p = 0; p < 24; p++) {
      if (b[p] !== player) continue;
      const n = ADJ_N[p] as number;
      for (let k = 0; k < n; k++) if (b[ADJ_P[p * 4 + k] as number] === -1) return true;
    }
    return false;
  }

  /** Writes all legal move codes for the side to move into out[base..]; returns the count. */
  generate(out: Int32Array, base: number): number {
    let n = base;
    const b = this.board;
    const me = this.turn;
    if (this.pending) {
      const opp = 1 - me;
      for (let p = 0; p < 24; p++) {
        if (b[p] === opp && !this.inMill(p, opp)) out[n++] = enc(T_REMOVE, 0, p);
      }
      if (n === base) {
        for (let p = 0; p < 24; p++) if (b[p] === opp) out[n++] = enc(T_REMOVE, 0, p);
      }
      return n - base;
    }
    if ((this.toPlace[me] as number) > 0) {
      for (let to = 0; to < 24; to++) if (b[to] === -1) out[n++] = enc(T_PLACE, 0, to);
      return n - base;
    }
    if (this.onBoard[me] === 3) {
      for (let from = 0; from < 24; from++) {
        if (b[from] !== me) continue;
        for (let to = 0; to < 24; to++) if (b[to] === -1) out[n++] = enc(T_MOVE, from, to);
      }
      return n - base;
    }
    for (let from = 0; from < 24; from++) {
      if (b[from] !== me) continue;
      const cnt = ADJ_N[from] as number;
      for (let k = 0; k < cnt; k++) {
        const to = ADJ_P[from * 4 + k] as number;
        if (b[to] === -1) out[n++] = enc(T_MOVE, from, to);
      }
    }
    return n - base;
  }

  make(code: number): void {
    const sp = this.sp++;
    const player = this.turn;
    const opp = 1 - player;
    this.uCode[sp] = code;
    this.uTurn[sp] = player;
    this.uPend[sp] = this.pending ? 1 : 0;
    this.uMsc[sp] = this.msc;
    this.uH1[sp] = this.h1;
    this.uH2[sp] = this.h2;
    this.uRepLen[sp] = this.repLen;
    this.uRepBase[sp] = this.repBase;

    const type = codeType(code);
    const to = codeTo(code);
    const b = this.board;
    if (type === T_REMOVE) {
      b[to] = -1;
      this.onBoard[opp]!--;
      this.h1 ^= (ZB1[to * 2 + opp] as number) ^ (ZR1[0] as number);
      this.h2 ^= (ZB2[to * 2 + opp] as number) ^ (ZR2[0] as number);
      this.pending = false;
      this.finishTurn(player, true, true, false);
      return;
    }
    let isPlacement = false;
    if (type === T_PLACE) {
      isPlacement = true;
      const tp = this.toPlace[player] as number;
      b[to] = player;
      this.toPlace[player] = tp - 1;
      this.onBoard[player]!++;
      this.h1 ^= (ZB1[to * 2 + player] as number) ^ (ZP1[player * 10 + tp] as number) ^ (ZP1[player * 10 + tp - 1] as number);
      this.h2 ^= (ZB2[to * 2 + player] as number) ^ (ZP2[player * 10 + tp] as number) ^ (ZP2[player * 10 + tp - 1] as number);
    } else {
      const from = codeFrom(code);
      b[from] = -1;
      b[to] = player;
      this.h1 ^= (ZB1[from * 2 + player] as number) ^ (ZB1[to * 2 + player] as number);
      this.h2 ^= (ZB2[from * 2 + player] as number) ^ (ZB2[to * 2 + player] as number);
    }
    if ((this.onBoard[opp] as number) > 0 && this.inMill(to, player)) {
      this.pending = true;
      this.h1 ^= ZR1[0] as number;
      this.h2 ^= ZR2[0] as number;
      return;
    }
    this.finishTurn(player, false, isPlacement, !isPlacement);
  }

  private finishTurn(mover: number, captured: boolean, irreversible: boolean, counted: boolean): void {
    const next = 1 - mover;
    this.turn = next;
    this.h1 ^= ZT1[0] as number;
    this.h2 ^= ZT2[0] as number;
    this.msc = captured ? 0 : this.msc + (counted ? 1 : 0);

    let count: number;
    if (irreversible) {
      this.repBase = this.repLen;
      count = 1;
    } else {
      count = 1;
      for (let i = this.repBase; i < this.repLen; i++) {
        if (this.rep1[i] === this.h1 && this.rep2[i] === this.h2) count++;
      }
    }
    if (this.repLen < REP_CAP) {
      this.rep1[this.repLen] = this.h1;
      this.rep2[this.repLen] = this.h2;
      this.repLen++;
    }

    if (captured && (this.onBoard[next] as number) + (this.toPlace[next] as number) < 3) {
      this.result = mover;
    } else if (!this.hasMoves(next)) {
      this.result = mover;
    } else if (count >= REPETITION_LIMIT_ENGINE) {
      this.result = DRAW;
    } else if (this.msc >= NO_CAPTURE_LIMIT_ENGINE) {
      this.result = DRAW;
    }
  }

  unmake(): void {
    const sp = --this.sp;
    const code = this.uCode[sp] as number;
    const player = this.uTurn[sp] as number;
    const opp = 1 - player;
    const type = codeType(code);
    const to = codeTo(code);
    const b = this.board;
    if (type === T_REMOVE) {
      b[to] = opp;
      this.onBoard[opp]!++;
    } else if (type === T_PLACE) {
      b[to] = -1;
      this.toPlace[player]!++;
      this.onBoard[player]!--;
    } else {
      b[to] = -1;
      b[codeFrom(code)] = player;
    }
    this.turn = player;
    this.pending = this.uPend[sp] === 1;
    this.msc = this.uMsc[sp] as number;
    this.h1 = this.uH1[sp] as number;
    this.h2 = this.uH2[sp] as number;
    this.repLen = this.uRepLen[sp] as number;
    this.repBase = this.uRepBase[sp] as number;
    this.result = NONE;
  }
}
