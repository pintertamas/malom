/**
 * Negamax / alpha-beta search with iterative deepening and a transposition table.
 *
 * Conventions
 *  - Scores are returned from the point of view of the side to move at that node.
 *    A mill capture is a separate `remove` move by the SAME player, so after a
 *    move the sign is only flipped when the turn actually changed.
 *  - Depth is counted in turns: place/slide/fly costs 1, the follow-up `remove`
 *    costs 0 (it belongs to the same turn).
 *
 * "draw" mode (the product default) -- exact rule
 *  Let A be the AI (the side to move at the root) and M = 100 * (A's pieces
 *  minus the opponent's pieces), pieces = on board + still to place.
 *   1. Material is transformed: M' = M when M <= 200, and
 *      M' = 200 + 0.05 * (M - 200) beyond that. So once the AI is ahead by more
 *      than 1 piece (2+), further captures are worth very little, while losing
 *      pieces still costs full price below the plateau: the AI prefers quiet,
 *      safe moves but never throws pieces away. Behind or level it is exactly
 *      the normal engine and fights to equalise.
 *   2. An AI win (opponent reduced below 3 pieces or blocked) is scored as -15,
 *      i.e. slightly worse than a level draw, so the AI never finishes the game
 *      when it has any alternative (it only wins if every other line is worse).
 *      Only the AI itself can create such a terminal node, so the opponent's
 *      min-nodes never steer toward it.
 *   3. Draw by repetition / no-capture limit is worth D = clamp(M_root, 0, 200)
 *      for the AI: 0 when level or behind (a draw is welcome when defending),
 *      and as good as the plateau when ahead (so it happily repeats/shuffles).
 *   4. If the human is ahead nothing changes: the AI plays its normal best
 *      defence. Losing is still -(WIN - ply).
 *   5. While the AI is ahead by 2+ pieces at the root, moves within 30 units of
 *      the best are considered equivalent and the ones that do not form a mill are
 *      preferred (quiet play); otherwise root moves within ~4 units of the best are
 *      chosen at random, so games differ.
 *
 * "strong" mode: plain material+positional evaluation, wins score WIN - ply.
 */
import {
  ADJ_N,
  ADJ_P,
  DRAW,
  LINE,
  NONE,
  PT_LINES,
  T_MOVE,
  T_REMOVE,
  codeFrom,
  codeTo,
  codeType,
} from './engine';
import type { Position } from './engine';
import { PIECE, pieces, positional } from './eval';

export type AiMode = 'draw' | 'strong';

const INF = 1_000_000;
const WIN = 30_000;
const MATE_THRESH = WIN - 400;
const MAX_PLY = 96;
const MAXM = 96;
const QDEPTH = 2;

const AI_WIN_DRAW_MODE = -15;
const PLATEAU = 2 * PIECE;
const PLATEAU_SLOPE = 0.05;
const QUIET_MARGIN = 30;

// ------------------------------------------------------------ transposition table

const TT_BITS = 18;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const ttK1 = new Int32Array(TT_SIZE);
const ttK2 = new Int32Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE);
const ttMeta = new Int32Array(TT_SIZE); // gen << 8 | flag << 6 | depth
const FLAG_EXACT = 0;
const FLAG_LOWER = 1;
const FLAG_UPPER = 2;
let ttGen = 0;

// ------------------------------------------------------------ search state

let pos: Position;
let aiPlayer = 0;
let drawMode = false;
let drawValue = 0;
let nodes = 0;
let stopped = false;
let deadline = Infinity;

const moveBuf = new Int32Array(MAX_PLY * MAXM);
const scoreBuf = new Int32Array(MAX_PLY * MAXM);
const killers = new Int32Array(MAX_PLY * 2);
const history = new Int32Array(2 * 8192);

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function terminal(ply: number): number {
  const r = pos.result;
  let v: number; // from the AI's point of view
  if (r === DRAW) v = drawValue;
  else if (r === aiPlayer) v = drawMode ? AI_WIN_DRAW_MODE : WIN - ply;
  else v = -(WIN - ply);
  return pos.turn === aiPlayer ? v : -v;
}

function transformMaterial(m: number): number {
  if (!drawMode || m <= PLATEAU) return m;
  return PLATEAU + PLATEAU_SLOPE * (m - PLATEAU);
}

/** Static evaluation from the side-to-move's point of view. */
function evaluate(): number {
  const ai = aiPlayer;
  const m = PIECE * (pieces(pos, ai) - pieces(pos, 1 - ai));
  const v = Math.round(transformMaterial(m) + positional(pos, ai) - positional(pos, 1 - ai));
  return pos.turn === ai ? v : -v;
}

function toTT(score: number, ply: number): number {
  if (score >= MATE_THRESH) return score + ply;
  if (score <= -MATE_THRESH) return score - ply;
  return score;
}
function fromTT(score: number, ply: number): number {
  if (score >= MATE_THRESH) return score - ply;
  if (score <= -MATE_THRESH) return score + ply;
  return score;
}

// ------------------------------------------------------------ move ordering

/** Heuristic score for each of the n moves at moveBuf[base..]. */
function scoreMoves(base: number, n: number, ply: number, hashMove: number): void {
  const me = pos.turn;
  const opp = 1 - me;
  const b = pos.board;
  for (let i = 0; i < n; i++) {
    const code = moveBuf[base + i] as number;
    const to = codeTo(code);
    let s = 0;
    if (code === hashMove) s += 1_000_000;
    if (codeType(code) === T_REMOVE) {
      // Prefer victims that break the opponent's threats / unblock ours.
      for (let k = 0; k < 2; k++) {
        const l = (PT_LINES[to * 2 + k] as number) * 3;
        let oppN = 0;
        let meN = 0;
        for (let j = 0; j < 3; j++) {
          const z = LINE[l + j] as number;
          if (z === to) continue;
          if (b[z] === opp) oppN++;
          else if (b[z] === me) meN++;
        }
        if (oppN === 1 && meN === 0) s += 120; // part of an opponent two-in-line
        if (meN === 2) s += 200; // blocks one of our open lines
        else if (meN === 1) s += 10;
      }
      s += 3 * pos_adjEmpty(to);
    } else {
      const from = codeType(code) === T_MOVE ? codeFrom(code) : -1;
      if (pos.formsMill(me, from, to)) s += 100_000;
      if (pos.formsMill(opp, -1, to)) s += 50_000; // occupying the opponent's mill point
      if (code === killers[ply * 2]) s += 9_000;
      else if (code === killers[ply * 2 + 1]) s += 8_000;
      s += history[me * 8192 + (code & 8191)] as number;
    }
    scoreBuf[base + i] = s;
  }
}

function pos_adjEmpty(pt: number): number {
  let c = 0;
  const n = ADJ_N[pt] as number;
  for (let k = 0; k < n; k++) if (pos.board[ADJ_P[pt * 4 + k] as number] === -1) c++;
  return c;
}

/** Selection step: swaps the best remaining move into slot i. */
function pickBest(base: number, i: number, n: number): number {
  let bi = i;
  let bs = scoreBuf[base + i] as number;
  for (let j = i + 1; j < n; j++) {
    const s = scoreBuf[base + j] as number;
    if (s > bs) {
      bs = s;
      bi = j;
    }
  }
  if (bi !== i) {
    const c = moveBuf[base + i] as number;
    moveBuf[base + i] = moveBuf[base + bi] as number;
    moveBuf[base + bi] = c;
    scoreBuf[base + bi] = scoreBuf[base + i] as number;
    scoreBuf[base + i] = bs;
  }
  return moveBuf[base + i] as number;
}

// ------------------------------------------------------------ search

function timeUp(): boolean {
  if ((++nodes & 2047) === 0 && now() > deadline) stopped = true;
  return stopped;
}

function qsearch(alpha: number, beta: number, ply: number, qd: number): number {
  if (timeUp()) return 0;
  if (pos.result !== NONE) return terminal(ply);
  if (ply >= MAX_PLY - 2) return evaluate();
  const pend = pos.pending;
  const side = pos.turn;
  let best = -INF;
  if (!pend) {
    best = evaluate();
    if (best >= beta) return best;
    if (best > alpha) alpha = best;
    if (qd <= 0) return best;
  }
  const base = ply * MAXM;
  let n = pos.generate(moveBuf, base);
  if (!pend) {
    // keep only mill-forming moves
    let k = 0;
    for (let i = 0; i < n; i++) {
      const code = moveBuf[base + i] as number;
      const from = codeType(code) === T_MOVE ? codeFrom(code) : -1;
      if (pos.formsMill(side, from, codeTo(code))) moveBuf[base + k++] = code;
    }
    n = k;
    if (n === 0) return best;
  }
  scoreMoves(base, n, ply, 0);
  for (let i = 0; i < n; i++) {
    const code = pickBest(base, i, n);
    pos.make(code);
    const same = pos.turn === side;
    const nq = codeType(code) === T_REMOVE ? qd : qd - 1;
    const cs = same ? qsearch(alpha, beta, ply + 1, nq) : -qsearch(-beta, -alpha, ply + 1, nq);
    pos.unmake();
    if (stopped) return 0;
    if (cs > best) {
      best = cs;
      if (cs > alpha) {
        alpha = cs;
        if (alpha >= beta) break;
      }
    }
  }
  return best;
}

function negamax(depth: number, alpha: number, beta: number, ply: number): number {
  if (timeUp()) return 0;
  if (pos.result !== NONE) return terminal(ply);
  const pend = pos.pending;
  if (depth <= 0 && !pend) return qsearch(alpha, beta, ply, QDEPTH);
  if (ply >= MAX_PLY - 2) return evaluate();

  const alpha0 = alpha;
  const idx = pos.h1 & TT_MASK;
  let hashMove = 0;
  if (ttK1[idx] === pos.h1 && ttK2[idx] === pos.h2) {
    const meta = ttMeta[idx] as number;
    if (meta >> 8 === ttGen) {
      hashMove = ttMove[idx] as number;
      if ((meta & 63) >= depth) {
        const sc = fromTT(ttScore[idx] as number, ply);
        const flag = (meta >> 6) & 3;
        if (flag === FLAG_EXACT) return sc;
        if (flag === FLAG_LOWER) {
          if (sc > alpha) alpha = sc;
        } else if (sc < beta) {
          beta = sc;
        }
        if (alpha >= beta) return sc;
      }
    }
  }

  const side = pos.turn;
  const base = ply * MAXM;
  const n = pos.generate(moveBuf, base);
  if (n === 0) return evaluate(); // cannot happen for non-terminal rule states
  scoreMoves(base, n, ply, hashMove);

  let best = -INF;
  let bestMove = 0;
  for (let i = 0; i < n; i++) {
    const code = pickBest(base, i, n);
    pos.make(code);
    const same = pos.turn === side;
    const nd = codeType(code) === T_REMOVE ? depth : depth - 1;
    const cs = same ? negamax(nd, alpha, beta, ply + 1) : -negamax(nd, -beta, -alpha, ply + 1);
    pos.unmake();
    if (stopped) return 0;
    if (cs > best) {
      best = cs;
      bestMove = code;
      if (cs > alpha) {
        alpha = cs;
        if (alpha >= beta) {
          if (codeType(code) !== T_REMOVE) {
            if (killers[ply * 2] !== code) {
              killers[ply * 2 + 1] = killers[ply * 2] as number;
              killers[ply * 2] = code;
            }
            const hi = side * 8192 + (code & 8191);
            history[hi] = Math.min(1_000_00, (history[hi] as number) + depth * depth);
          }
          break;
        }
      }
    }
  }

  const flag = best <= alpha0 ? FLAG_UPPER : best >= beta ? FLAG_LOWER : FLAG_EXACT;
  const old = ttMeta[idx] as number;
  if (old >> 8 !== ttGen || (old & 63) <= depth || ttK1[idx] !== pos.h1) {
    ttK1[idx] = pos.h1;
    ttK2[idx] = pos.h2;
    ttScore[idx] = toTT(best, ply);
    ttMove[idx] = bestMove;
    ttMeta[idx] = (ttGen << 8) | (flag << 6) | Math.min(depth, 63);
  }
  return best;
}

// ------------------------------------------------------------ root

export interface SearchParams {
  mode: AiMode;
  timeMs: number;
  maxDepth: number;
  /** Probability (0..1) of skipping the best move for a plausible worse one. */
  blunderRate: number;
  rnd: () => number;
}

export interface SearchResult {
  code: number;
  score: number;
  depth: number;
  nodes: number;
}

export function searchRoot(root: Position, params: SearchParams): SearchResult {
  pos = root;
  aiPlayer = root.turn;
  drawMode = params.mode === 'draw';
  const mRoot = PIECE * (pieces(root, aiPlayer) - pieces(root, 1 - aiPlayer));
  drawValue = drawMode ? Math.max(0, Math.min(mRoot, PLATEAU)) : 0;
  ttGen = (ttGen + 1) & 0xfffff;
  nodes = 0;
  stopped = false;
  killers.fill(0);
  history.fill(0);
  // Draw mode while ahead by 2+ pieces: moves within QUIET_MARGIN of the best are
  // treated as equivalent and quiet (non-mill-forming) ones are preferred.
  const quiet = drawMode && mRoot >= PLATEAU;
  const tie = quiet ? QUIET_MARGIN : drawMode ? 4 : 2;

  const start = now();
  const n = root.generate(moveBuf, 0);
  if (n === 0) throw new Error('No legal moves');
  const rootMoves = Array.from(moveBuf.subarray(0, n));
  if (n === 1) return { code: rootMoves[0] as number, score: 0, depth: 0, nodes: 0 };
  scoreMoves(0, n, 0, 0);
  const order = rootMoves
    .map((code, i) => ({ code, key: scoreBuf[i] as number }))
    .sort((a, b) => b.key - a.key)
    .map((e) => e.code);

  let result: SearchResult = { code: order[0] as number, score: 0, depth: 0, nodes: 0 };
  let candidates: number[] = [order[0] as number];
  const maxDepth = Math.max(1, params.maxDepth);

  for (let d = 1; d <= maxDepth; d++) {
    deadline = d <= 2 ? Infinity : start + params.timeMs;
    if (d > 2 && now() >= deadline) break;
    stopped = false;
    const exact = new Map<number, number>();
    let bestScore = -INF;
    let bestCode = 0;
    for (const code of order) {
      pos.make(code);
      const same = pos.turn === aiPlayer; // root side is aiPlayer
      const nd = codeType(code) === T_REMOVE ? d : d - 1;
      const lo = bestScore === -INF ? -INF : bestScore - tie;
      const cs = same ? negamax(nd, lo, INF, 1) : -negamax(nd, -INF, -lo, 1);
      pos.unmake();
      if (stopped) break;
      if (cs > lo) {
        exact.set(code, cs);
        if (cs > bestScore) {
          bestScore = cs;
          bestCode = code;
        }
      }
    }
    if (stopped) break;
    result = { code: bestCode, score: bestScore, depth: d, nodes };
    candidates = [];
    for (const [code, sc] of exact) if (sc >= bestScore - tie) candidates.push(code);
    // next iteration: best first, then the other exactly-scored moves, then the rest
    order.sort((a, b) => (exact.get(b) ?? -INF) - (exact.get(a) ?? -INF));
    if (Math.abs(bestScore) >= MATE_THRESH && !drawMode) break;
  }

  if (quiet) {
    const calm = candidates.filter((c) => {
      if (codeType(c) === T_REMOVE) return true;
      return !root.formsMill(aiPlayer, codeType(c) === T_MOVE ? codeFrom(c) : -1, codeTo(c));
    });
    if (calm.length > 0) candidates = calm;
  }
  const pick = candidates[Math.floor(params.rnd() * candidates.length)] ?? result.code;
  let chosen = pick;
  if (params.blunderRate > 0 && !root.pending && params.rnd() < params.blunderRate) {
    chosen = blunderPick(root, order, pick, params.rnd);
  }
  return { ...result, code: chosen, nodes };
}

const BLUNDER_DEPTH = 2;
const BLUNDER_MARGIN = 90;

/**
 * Picks a worse-but-plausible root move for the lower difficulty levels: every
 * root move is scored with a short full-window search; candidates must not hand
 * the opponent an immediate mill (unless every move does), must not lose on the
 * spot, and must stay within BLUNDER_MARGIN of the best shallow score (about one
 * piece), so the AI looks weaker but never silly. Falls back to `best`.
 */
function blunderPick(root: Position, moves: number[], best: number, rnd: () => number): number {
  stopped = false;
  deadline = Infinity;
  const side = root.turn;
  const scored: { code: number; score: number; gift: boolean }[] = [];
  for (const code of moves) {
    root.make(code);
    const same = root.turn === side;
    const nd = codeType(code) === T_REMOVE ? BLUNDER_DEPTH : BLUNDER_DEPTH - 1;
    const score = same ? negamax(nd, -INF, INF, 1) : -negamax(nd, -INF, INF, 1);
    let gift = false;
    if (!root.pending && root.result === NONE) {
      const n = root.generate(moveBuf, 0);
      for (let i = 0; i < n && !gift; i++) {
        const c = moveBuf[i] as number;
        gift = root.formsMill(root.turn, codeType(c) === T_MOVE ? codeFrom(c) : -1, codeTo(c));
      }
    }
    root.unmake();
    scored.push({ code, score, gift });
  }
  const top = Math.max(...scored.map((e) => e.score));
  let pool = scored.filter(
    (e) => e.code !== best && !e.gift && e.score >= top - BLUNDER_MARGIN && e.score > -MATE_THRESH,
  );
  if (pool.length === 0) {
    pool = scored.filter(
      (e) => e.code !== best && e.score >= top - BLUNDER_MARGIN && e.score > -MATE_THRESH,
    );
    const bestEntry = scored.find((e) => e.code === best);
    // If the best move gives nothing away but every alternative does, keep the best move.
    if (bestEntry && !bestEntry.gift) return best;
  }
  const pick = pool[Math.floor(rnd() * pool.length)];
  return pick ? pick.code : best;
}
