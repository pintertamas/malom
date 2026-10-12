import { ADJACENT, COORDS, MILLS, POINT_COUNT } from '../rules';
import type { Cell, Move, Player } from '../rules';
import { s } from './dom';
import { shake } from './fx';
import { EASE, MOTION, Scope, arcSamples, easeInOutCubic, makeParticles, vibrate } from './motion';

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

interface Piece {
  g: SVGGElement;
  /** Scale pops (mills, flight, capture). */
  pop: SVGGElement;
  /** Drop-in animation. */
  drop: SVGGElement;
  shadow: SVGEllipseElement;
  owner: Player;
}

const translate = (x: number, y: number): string => `translate(${x}px, ${y}px)`;

const DROP_FRAMES: Keyframe[] = [
  { transform: 'translateY(-140px) scale(0.9, 1.12)', easing: EASE.gravity, offset: 0 },
  { transform: 'translateY(0px) scale(0.95, 1.06)', easing: 'linear', offset: MOTION.dropLandFrac },
  { transform: 'translateY(4px) scale(1.2, 0.78)', easing: EASE.out, offset: MOTION.dropLandFrac + 0.13 },
  { transform: 'translateY(-9px) scale(0.96, 1.05)', easing: EASE.inOut, offset: 0.85 },
  { transform: 'translateY(0px) scale(1, 1)', offset: 1 },
];

export class BoardView {
  readonly el: SVGSVGElement;
  /** Owns every animation/timer of this board; disposed with the game. */
  readonly scope = new Scope();
  private readonly pieces = new Map<number, Piece>();
  private readonly lineGroup: SVGGElement;
  private readonly piecesLayer: SVGGElement;
  private readonly millLayer: SVGGElement;
  private readonly groundLayer: SVGGElement;
  private readonly fxLayer: SVGGElement;
  private readonly millLines = new Map<string, SVGLineElement>();
  private readonly markers: SVGCircleElement[] = [];
  private onPoint: (p: number) => void = () => {};
  /** performance.now() at which the last move touches the board. */
  private landAt = 0;
  /** performance.now() at which every animation caused by game events is done. */
  private busyUntil = 0;

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
      lines.append(s('rect', { x: lo, y: lo, width: len, height: len, 'data-len': len * 4 }));
    }
    for (const [a, b] of [
      [1, 17],
      [3, 19],
      [5, 21],
      [7, 23],
    ] as const) {
      const pa = px(a);
      const pb = px(b);
      lines.append(s('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, 'data-len': 2 * STEP }));
    }
    // A dash as long as the shape is invisible until the offset is animated.
    for (const l of Array.from(lines.children)) {
      const len = Number(l.getAttribute('data-len')) + 1;
      l.setAttribute('stroke-dasharray', `${len} ${len}`);
    }
    this.lineGroup = lines;
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

    this.groundLayer = s('g', { 'pointer-events': 'none' });
    svg.append(this.groundLayer);
    this.piecesLayer = s('g');
    svg.append(this.piecesLayer);
    this.fxLayer = s('g', { 'pointer-events': 'none' });
    svg.append(this.fxLayer);

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

  /** Milliseconds until every animation caused by game events has finished. */
  remaining(): number {
    return Math.max(0, this.busyUntil - performance.now());
  }

  /** Cancels all animations/timers and drops throwaway nodes. */
  destroy(): void {
    this.scope.dispose();
  }

  /** Board entrance: lines draw themselves, points pop in with a stagger. */
  playIntro(extraDelay = 0): void {
    const kids = Array.from(this.lineGroup.children);
    kids.forEach((l, i) => {
      const len = Number(l.getAttribute('data-len')) + 1;
      const delay = extraDelay + (i < 3 ? i * 110 : 330 + (i - 3) * 70);
      this.scope.play(
        l,
        [{ strokeDashoffset: `${len}px` }, { strokeDashoffset: '0px' }],
        { duration: MOTION.boardLinesMs, delay, easing: EASE.inOut, fill: 'backwards' },
        'skip',
      );
    });
    this.markers.forEach((m, i) => {
      this.scope.play(
        m,
        [
          { transform: 'scale(0)', opacity: 0 },
          { transform: 'scale(1.5)', opacity: 1, offset: 0.6 },
          { transform: 'scale(1)', opacity: 1 },
        ],
        {
          duration: MOTION.pointPopMs,
          delay: extraDelay + 280 + i * MOTION.pointStaggerMs,
          easing: EASE.out,
          fill: 'backwards',
        },
        'skip',
      );
    });
  }

  /** Decorative sequence for the intro screen: a few pieces drop in and a mill lights up. */
  playDemo(startMs: number): void {
    const steps: [number, number, Player][] = [
      [9, 0, 1],
      [0, 1, 0],
      [8, 2, 1],
      [6, 3, 0],
      [10, 4, 1],
    ];
    steps.forEach(([to, i, who]) => {
      this.scope.timeout(() => this.animate({ type: 'place', to }, who), startMs + i * 330);
    });
    this.scope.timeout(() => {
      this.update({
        selectable: new Set(),
        selected: null,
        targets: new Set(),
        removable: new Set(),
        mills: [{ points: [8, 9, 10], fresh: true }],
      });
    }, startMs + steps.length * 330);
  }

  /** Rebuilds pieces from a board (used on init). */
  syncBoard(board: Cell[]): void {
    for (const piece of this.pieces.values()) piece.g.remove();
    this.pieces.clear();
    board.forEach((c, p) => {
      if (c !== null) this.addPiece(p, c);
    });
  }

  private place(g: SVGGElement, p: number): void {
    const { x, y } = px(p);
    g.style.transform = translate(x, y);
  }

  private addPiece(p: number, owner: Player): Piece {
    const g = s('g', {}, 'piece');
    const shadow = s('ellipse', { cx: 0, cy: 4, rx: 17, ry: 14 }, 'shadow');
    const pop = s('g');
    const drop = s('g');
    const lift = s('g', {}, 'lift');
    const body = s('circle', { r: 18, fill: owner === 0 ? 'url(#gw)' : 'url(#gb)' }, `body ${owner === 0 ? 'white' : 'dark'}`);
    const shine = s('circle', { cx: -6, cy: -7, r: 5.5 }, 'shine');
    lift.append(body, shine);
    drop.append(lift);
    pop.append(drop);
    g.append(shadow, pop);
    this.place(g, p);
    this.piecesLayer.append(g);
    const piece: Piece = { g, pop, drop, shadow, owner };
    this.pieces.set(p, piece);
    return piece;
  }

  /** A translated group at a board point, inside one of the fx layers. */
  private fxAt(layer: SVGGElement, p: number): SVGGElement {
    const { x, y } = px(p);
    const g = s('g', {});
    g.style.transform = translate(x, y);
    layer.append(g);
    return g;
  }

  private settle(landMs: number, doneMs: number): void {
    const now = performance.now();
    this.landAt = now + landMs;
    this.busyUntil = Math.max(this.busyUntil, now + doneMs);
  }

  /** Animates a move that has already been applied to the game state. */
  animate(move: Move, player: Player): void {
    if (move.type === 'place') this.animatePlace(move.to, player);
    else if (move.type === 'move') this.animateMove(move.from, move.to, player);
    else this.animateCapture(move.at);
  }

  private animatePlace(to: number, player: Player): void {
    const old = this.pieces.get(to);
    if (old) old.g.remove(); // state says the point was free; never double up
    const piece = this.addPiece(to, player);
    const landMs = MOTION.dropMs * MOTION.dropLandFrac;
    this.settle(landMs, MOTION.dropMs);
    this.scope.play(piece.drop, DROP_FRAMES, { duration: MOTION.dropMs, fill: 'backwards' });
    this.scope.play(
      piece.drop,
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 140, fill: 'backwards', easing: 'linear' },
      'skip',
    );
    this.scope.play(
      piece.shadow,
      [
        { opacity: 0, transform: 'scale(0.4)', offset: 0 },
        { opacity: 1, transform: 'scale(1)', offset: MOTION.dropLandFrac },
        { opacity: 1, transform: 'scale(1)', offset: 1 },
      ],
      { duration: MOTION.dropMs, fill: 'backwards', easing: 'linear' },
      'skip',
    );
    // Landing ripple.
    const ring = s('circle', { r: 17 }, 'ripple');
    this.fxAt(this.groundLayer, to).append(ring);
    this.scope.play(
      ring,
      [
        { transform: 'scale(0.7)', opacity: 0.9 },
        { transform: 'scale(2.3)', opacity: 0 },
      ],
      { duration: MOTION.rippleMs, delay: landMs, easing: EASE.out, fill: 'both' },
      'skip',
      true,
    );
    this.scope.timeout(() => ring.parentElement?.remove(), landMs + MOTION.rippleMs + 50);
  }

  private animateMove(from: number, to: number, player: Player): void {
    const piece = this.pieces.get(from);
    if (!piece) return;
    this.pieces.delete(from);
    this.pieces.set(to, piece);
    const a = px(from);
    const b = px(to);
    for (const anim of piece.g.getAnimations?.() ?? []) anim.cancel();
    this.place(piece.g, to);
    const flying = !ADJACENT[from]?.includes(to);
    if (!flying) {
      this.settle(MOTION.slideMs, MOTION.slideMs);
      this.scope.play(
        piece.g,
        [{ transform: translate(a.x, a.y) }, { transform: translate(b.x, b.y) }],
        { duration: MOTION.slideMs, easing: 'cubic-bezier(0.3, 0.8, 0.3, 1)' },
      );
      return;
    }
    // Flying: arc with a little scale-up and a fading trail.
    this.settle(MOTION.flyMs, MOTION.flyMs);
    this.piecesLayer.append(piece.g); // fly over the others
    const samples = arcSamples(a, b, MOTION.flySamples, MOTION.flyLift, MOTION.flyScale, easeInOutCubic);
    this.scope.play(
      piece.g,
      samples.map((p) => ({ transform: translate(p.x, p.y), offset: p.offset })),
      { duration: MOTION.flyMs, easing: 'linear' },
    );
    this.scope.play(
      piece.pop,
      samples.map((p) => ({ transform: `scale(${p.scale})`, offset: p.offset })),
      { duration: MOTION.flyMs, easing: 'linear' },
      'skip',
    );
    const fill = player === 0 ? 'url(#gw)' : 'url(#gb)';
    for (let k = 1; k <= MOTION.flyTrail; k++) {
      const t = k / (MOTION.flyTrail + 1);
      const sample = samples[Math.round(t * MOTION.flySamples)];
      if (!sample) continue;
      const ghost = s('circle', { r: 15, fill }, 'ghost');
      const g = s('g', {});
      g.style.transform = translate(sample.x, sample.y);
      g.append(ghost);
      this.groundLayer.append(g);
      this.scope.play(
        ghost,
        [
          { transform: 'scale(0.9)', opacity: 0.5 },
          { transform: 'scale(0.4)', opacity: 0 },
        ],
        { duration: 420, delay: t * MOTION.flyMs, easing: 'ease-out', fill: 'both' },
        'skip',
        true,
      );
      this.scope.timeout(() => g.remove(), t * MOTION.flyMs + 500);
    }
  }

  private animateCapture(at: number): void {
    const piece = this.pieces.get(at);
    if (!piece) return;
    this.pieces.delete(at);
    this.scope.track(piece.g);
    this.settle(0, MOTION.particleMs);
    piece.g.classList.remove('selectable', 'selected', 'removable');
    this.scope.play(
      piece.pop,
      [
        { transform: 'scale(1)', opacity: 1, offset: 0 },
        { transform: 'scale(1.18)', opacity: 1, offset: 0.2 },
        { transform: 'scale(0.1)', opacity: 0, offset: 1 },
      ],
      { duration: MOTION.captureMs, easing: 'ease-in', fill: 'forwards' },
      'out',
    );
    this.scope.play(piece.shadow, [{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.captureMs, fill: 'forwards' }, 'out');
    this.scope.timeout(() => piece.g.remove(), MOTION.captureMs + 60);

    // Red flash on the point.
    const flash = s('circle', { r: 22 }, 'flash');
    this.fxAt(this.fxLayer, at).append(flash);
    this.scope.play(
      flash,
      [
        { transform: 'scale(0.5)', opacity: 0.75 },
        { transform: 'scale(1.7)', opacity: 0 },
      ],
      { duration: MOTION.flashMs, easing: EASE.out, fill: 'both' },
      'skip',
      true,
    );

    // Particles.
    const holder = this.fxAt(this.fxLayer, at);
    const base = piece.owner === 0 ? '#fffdf5' : '#3a3144';
    for (const [i, part] of makeParticles(MOTION.particleCount, Math.random).entries()) {
      const dot = s('circle', { r: part.size, fill: i % 4 === 0 ? '#ff4d5e' : base }, 'particle');
      holder.append(dot);
      this.scope.play(
        dot,
        [
          { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
          { transform: `translate(${part.dx}px, ${part.dy}px) rotate(${part.rot}deg) scale(0.15)`, opacity: 0 },
        ],
        { duration: MOTION.particleMs, delay: part.delay, easing: EASE.out, fill: 'both' },
        'skip',
        true,
      );
    }
    this.scope.timeout(() => {
      holder.remove();
      flash.parentElement?.remove();
    }, MOTION.particleMs + 160);
  }

  update(h: Highlights): void {
    for (const [p, piece] of this.pieces) {
      piece.g.classList.toggle('selectable', h.selectable.has(p));
      piece.g.classList.toggle('selected', h.selected === p);
      piece.g.classList.toggle('removable', h.removable.has(p));
    }
    this.markers.forEach((m, p) => {
      m.classList.toggle('target', h.targets.has(p));
    });
    this.syncMills(h.mills);
  }

  private syncMills(mills: Highlights['mills']): void {
    const keep = new Set<string>();
    for (const { points, fresh } of mills) {
      const key = points.join('-');
      keep.add(key);
      if (this.millLines.has(key)) continue;
      const a = px(points[0]);
      const c = px(points[2]);
      const owner = this.pieces.get(points[0])?.owner ?? 0;
      const line = s('line', { x1: a.x, y1: a.y, x2: c.x, y2: c.y }, `mill ${owner === 0 ? 'white' : 'dark'}`);
      this.millLayer.append(line);
      this.millLines.set(key, line);
      if (fresh) this.celebrate(points, owner, line);
    }
    for (const [key, line] of this.millLines) {
      if (keep.has(key)) continue;
      line.remove();
      this.millLines.delete(key);
    }
  }

  /** Glow sweep, line highlight, piece pops, (AI-only) shake and a haptic tap. */
  private celebrate(points: readonly [number, number, number], owner: Player, line: SVGLineElement): void {
    const d = Math.max(0, this.landAt - performance.now());
    this.busyUntil = Math.max(this.busyUntil, performance.now() + d + MOTION.millSweepMs);

    this.scope.play(
      line,
      [
        { opacity: 0, strokeWidth: '18px' },
        { opacity: 0.75, strokeWidth: '7px' },
      ],
      { duration: MOTION.millGlowMs, delay: d, easing: EASE.out, fill: 'backwards' },
    );

    const a = px(points[0]);
    const c = px(points[2]);
    const len = Math.hypot(c.x - a.x, c.y - a.y);
    const seg = len * 0.4;
    const sweep = s('line', { x1: a.x, y1: a.y, x2: c.x, y2: c.y, 'stroke-dasharray': `${seg} ${len + seg}` }, 'sweep');
    this.fxLayer.append(sweep);
    this.scope.play(
      sweep,
      [
        { strokeDashoffset: `${seg}px`, opacity: 1 },
        { strokeDashoffset: `${-len}px`, opacity: 1, offset: 0.85 },
        { strokeDashoffset: `${-len}px`, opacity: 0 },
      ],
      { duration: MOTION.millSweepMs, delay: d, easing: EASE.inOut, fill: 'both' },
      'skip',
      true,
    );

    points.forEach((p, i) => {
      const piece = this.pieces.get(p);
      const delay = d + i * MOTION.millPopStaggerMs;
      if (piece) {
        this.scope.play(
          piece.pop,
          [{ transform: 'scale(1)' }, { transform: 'scale(1.3)', offset: 0.4 }, { transform: 'scale(1)' }],
          { duration: MOTION.millPopMs, delay, easing: EASE.spring },
          'skip',
        );
      }
      const ring = s('circle', { r: 19 }, 'glow-ring');
      this.fxAt(this.fxLayer, p).append(ring);
      this.scope.play(
        ring,
        [
          { transform: 'scale(0.9)', opacity: 0.9 },
          { transform: 'scale(2)', opacity: 0 },
        ],
        { duration: MOTION.millPopMs + 80, delay, easing: EASE.out, fill: 'both' },
        'skip',
        true,
      );
      this.scope.timeout(() => ring.parentElement?.remove(), delay + MOTION.millPopMs + 200);
    });

    this.scope.timeout(() => {
      vibrate();
      if (owner === 1) shake(this.scope, this.el);
    }, d);
  }
}

export function completeMills(board: Cell[]): (readonly [number, number, number])[] {
  return MILLS.filter(([a, b, c]) => board[a] !== null && board[a] === board[b] && board[b] === board[c]);
}
