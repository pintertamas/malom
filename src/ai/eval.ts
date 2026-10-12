import { ADJ_N, ADJ_P, LINE, N_LINES, PT_LINES } from './engine';
import type { Position } from './engine';

/** One piece is worth 100 units; positional terms are a few units each. */
export const PIECE = 100;

/** Evaluation weights (units: 100 = one piece). Mutable so tests can A/B-tune them. */
export const WEIGHTS = {
  /** closed mill (can be opened/closed again in the moving phase) */
  W_MILL: 8,
  /** two in a line, third point empty */
  W_TWO: 5,
  /** ... and the owner can actually reach the empty point soon */
  W_TWO_READY: 14,
  /** one piece on an otherwise empty line */
  W_ONE: 1,
  /** we sit on a line where the opponent holds the other two */
  W_BLOCK: 4,
  /** per available slide */
  W_MOB: 3,
  /** flying pieces are never stuck: counts as this many slides */
  FLY_MOB: 9,
  /** "running mill": a piece that can swing between two mills */
  W_RUN: 35,
  /** flying is a strong defensive/offensive resource */
  W_FLY_KEEP: 15,
};

/** Pieces owned by `p` (on board plus still to place). */
export function pieces(pos: Position, p: number): number {
  return (pos.onBoard[p] as number) + (pos.toPlace[p] as number);
}

/** Positional score (no material) for player p, from p's point of view. */
export function positional(pos: Position, p: number): number {
  const b = pos.board;
  const q = 1 - p;
  const placing = (pos.toPlace[p] as number) > 0;
  const flying = !placing && pos.onBoard[p] === 3;
  let s = 0;

  for (let l = 0; l < N_LINES; l++) {
    const a = LINE[l * 3] as number;
    const m = LINE[l * 3 + 1] as number;
    const c = LINE[l * 3 + 2] as number;
    let own = 0;
    let opp = 0;
    let empty = -1;
    for (let k = 0; k < 3; k++) {
      const pt = LINE[l * 3 + k] as number;
      const v = b[pt];
      if (v === p) own++;
      else if (v === q) opp++;
      else empty = pt;
    }
    if (own === 3) {
      s += WEIGHTS.W_MILL;
    } else if (own === 2 && opp === 0) {
      s += WEIGHTS.W_TWO;
      if (placing || flying) {
        s += WEIGHTS.W_TWO_READY;
      } else {
        // can a piece that is not on this line step into the empty point?
        const n = ADJ_N[empty] as number;
        for (let k = 0; k < n; k++) {
          const nb = ADJ_P[empty * 4 + k] as number;
          if (b[nb] === p && nb !== a && nb !== m && nb !== c) {
            s += WEIGHTS.W_TWO_READY;
            break;
          }
        }
      }
    } else if (own === 1 && opp === 0) {
      s += WEIGHTS.W_ONE;
    } else if (own === 1 && opp === 2) {
      s += WEIGHTS.W_BLOCK;
    }
  }

  if (flying) {
    s += WEIGHTS.W_MOB * WEIGHTS.FLY_MOB + WEIGHTS.W_FLY_KEEP;
  } else {
    let mob = 0;
    for (let pt = 0; pt < 24; pt++) {
      if (b[pt] !== p) continue;
      const n = ADJ_N[pt] as number;
      const inMill = pos.inMill(pt, p);
      for (let k = 0; k < n; k++) {
        const y = ADJ_P[pt * 4 + k] as number;
        if (b[y] !== -1) continue;
        mob++;
        if (inMill) {
          // swinging pt -> y completes another line with the two other pieces?
          for (let j = 0; j < 2; j++) {
            const l = (PT_LINES[y * 2 + j] as number) * 3;
            let ok = 0;
            let onLine = false;
            for (let t = 0; t < 3; t++) {
              const z = LINE[l + t] as number;
              if (z === pt) onLine = true;
              else if (z !== y && b[z] === p) ok++;
            }
            if (!onLine && ok === 2) s += WEIGHTS.W_RUN;
          }
        }
      }
    }
    s += WEIGHTS.W_MOB * mob;
  }
  return s;
}

/** Material + positional difference from `ai`'s point of view (strong, untransformed). */
export function rawBalance(pos: Position, ai: number): { material: number; positional: number } {
  return {
    material: PIECE * (pieces(pos, ai) - pieces(pos, 1 - ai)),
    positional: positional(pos, ai) - positional(pos, 1 - ai),
  };
}
