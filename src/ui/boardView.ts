import { COORDS, MILLS, POINT_COUNT } from '../rules';
import type { Cell, Move, Player } from '../rules';
import { s } from './dom';

const STEP = 52;
const OFFSET = 34;
const SIZE = 6 * STEP + OFFSET * 2;

function px(p: number): { x: number; y: number } {
  const c = COORDS[p] as { x: number; y: number };
  return { x: OFFSET + c.x * STEP, y: OFFSET + c.y * STEP };
}

export interface Highlights {
  selectable: Set<number>;
  selected: number | null;
  targets: Set<number>;
  removable: Set<number>;
  /** Complete mills as point triples, with whether they were just formed. */
  mills: { points: readonly [number, number, number]; fresh: boolean }[];
}

export class BoardView {
  readonly el: SVGSVGElement;
  private readonly pieces = new Map<number, SVGGElement>();
  private readonly owners = new Map<number, Player>();
  private readonly piecesLayer: SVGGElement;
  private readonly millLayer: SVGGElement;
  private readonly markers: SVGCircleElement[] = [];
  private onPoint: (p: number) => void = () => {};

  constructor() {
    const svg = s('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'board', role: 'img' });
    svg.setAttribute('aria-label', 'Malom tábla');
    const defs = s('defs');
    defs.innerHTML = `
      <radialGradient id="gw" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fffdf5"/><stop offset="1" stop-color="#cdbf9f"/></radialGradient>
      <radialGradient id="gb" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#6a6272"/><stop offset="1" stop-color="#17131c"/></radialGradient>`;
    svg.append(defs);
    svg.append(s('rect', { x: 0, y: 0, width: SIZE, height: SIZE, rx: 22, class: 'board-bg' }));

    const lines = s('g', {}, 'board-lines');
    for (let ring = 0; ring < 3; ring++) {
      const lo = OFFSET + ring * STEP;
      const len = (6 - ring * 2) * STEP;
      lines.append(s('rect', { x: lo, y: lo, width: len, height: len }));
    }
    for (const [a, b] of [
      [1, 17],
      [3, 19],
      [5, 21],
      [7, 23],
    ] as const) {
      const pa = px(a);
      const pb = px(b);
      lines.append(s('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y }));
    }
    svg.append(lines);

    this.millLayer = s('g');
    svg.append(this.millLayer);

    const dots = s('g');
    for (let p = 0; p < POINT_COUNT; p++) {
      const { x, y } = px(p);
      const m = s('circle', { cx: x, cy: y, r: 6 }, 'pt');
      this.markers.push(m);
      dots.append(m);
    }
    svg.append(dots);

    this.piecesLayer = s('g');
    svg.append(this.piecesLayer);

    const hits = s('g');
    for (let p = 0; p < POINT_COUNT; p++) {
      const { x, y } = px(p);
      const hit = s('circle', { cx: x, cy: y, r: 25, fill: 'transparent' }, 'hit');
      hit.dataset['p'] = String(p);
      hits.append(hit);
    }
    svg.append(hits);
    svg.addEventListener('click', (e) => {
      const t = e.target as Element;
      const p = (t as SVGElement).dataset?.['p'];
      if (p !== undefined) this.onPoint(Number(p));
    });
    this.el = svg;
  }

  setHandler(cb: (p: number) => void): void {
    this.onPoint = cb;
  }

  /** Rebuilds pieces from a board (used on init). */
  syncBoard(board: Cell[]): void {
    for (const g of this.pieces.values()) g.remove();
    this.pieces.clear();
    this.owners.clear();
    board.forEach((c, p) => {
      if (c !== null) this.addPiece(p, c);
    });
  }

  private place(g: SVGGElement, p: number): void {
    const { x, y } = px(p);
    g.style.transform = `translate(${x}px, ${y}px)`;
  }

  private addPiece(p: number, owner: Player): void {
    const g = s('g', {}, 'piece');
    const body = s('circle', { r: 18, fill: owner === 0 ? 'url(#gw)' : 'url(#gb)' }, `body ${owner === 0 ? 'white' : 'dark'}`);
    g.append(body);
    this.place(g, p);
    this.piecesLayer.append(g);
    this.pieces.set(p, g);
    this.owners.set(p, owner);
  }

  /** Animates a move that has been applied to the game state. */
  animate(move: Move, player: Player): void {
    if (move.type === 'place') {
      this.addPiece(move.to, player);
    } else if (move.type === 'move') {
      const g = this.pieces.get(move.from);
      if (!g) return;
      this.pieces.delete(move.from);
      this.owners.delete(move.from);
      this.pieces.set(move.to, g);
      this.owners.set(move.to, player);
      this.place(g, move.to);
    } else {
      const g = this.pieces.get(move.at);
      if (!g) return;
      this.pieces.delete(move.at);
      this.owners.delete(move.at);
      g.classList.add('captured');
      setTimeout(() => g.remove(), 500);
    }
  }

  update(h: Highlights): void {
    for (const [p, g] of this.pieces) {
      g.classList.toggle('selectable', h.selectable.has(p));
      g.classList.toggle('selected', h.selected === p);
      g.classList.toggle('removable', h.removable.has(p));
    }
    this.markers.forEach((m, p) => {
      m.classList.toggle('target', h.targets.has(p));
    });
    this.millLayer.replaceChildren();
    for (const { points, fresh } of h.mills) {
      const a = px(points[0]);
      const c = px(points[2]);
      const owner = this.owners.get(points[0]) ?? 0;
      this.millLayer.append(
        s('line', { x1: a.x, y1: a.y, x2: c.x, y2: c.y }, `mill ${owner === 0 ? 'white' : 'dark'}${fresh ? ' fresh' : ''}`),
      );
    }
  }
}

export function completeMills(board: Cell[]): (readonly [number, number, number])[] {
  return MILLS.filter(([a, b, c]) => board[a] !== null && board[a] === board[b] && board[b] === board[c]);
}
