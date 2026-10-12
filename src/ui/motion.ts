/**
 * Single home for animation timing and the small pure helpers behind the juice.
 * Everything here is cosmetic: game state is the source of truth and every
 * animation is cancelable through a `Scope`.
 */

export const MOTION = {
  /** Screen-to-screen transitions. */
  screenOutMs: 240,
  screenInMs: 420,
  cardInMs: 700,
  stageStepMs: 160,

  /** Board entrance: lines draw, points pop. */
  boardLinesMs: 700,
  pointPopMs: 340,
  pointStaggerMs: 22,

  /** Pieces. */
  dropMs: 560,
  /** Fraction of the drop at which the piece touches the board. */
  dropLandFrac: 0.55,
  slideMs: 380,
  flyMs: 640,
  flyLift: 74,
  flyScale: 1.35,
  flySamples: 14,
  flyTrail: 5,
  rippleMs: 520,
  selectMs: 180,

  /** Mills. */
  millSweepMs: 560,
  millPopMs: 440,
  millPopStaggerMs: 90,
  millGlowMs: 800,
  shakeMs: 380,
  shakeAmp: 5,
  vibrateMs: 30,

  /** Captures. */
  captureMs: 520,
  particleCount: 10,
  particleMs: 640,
  particleSpread: 36,
  flashMs: 460,

  /** Status line / turn indicator. */
  statusFadeMs: 260,

  /** AI pacing: it thinks at least this long, then waits for animations to settle. */
  aiPaceMinMs: 500,
  aiPaceJitterMs: 300,

  /** Delay between the last move and the end card (lets the final animation play). */
  endCardDelayMs: 1300,

  /** End screen. */
  confettiCount: 60,
  confettiMinMs: 2200,
  confettiMaxMs: 3400,
  endFlourishDelayMs: 520,
  sparkleCount: 8,
  bubblePopMs: 460,

  /** Dodging Nem button. */
  puffMs: 560,
  puffParticles: 7,
  puffMinGapMs: 140,
  nemPopMs: 360,

  /** Rose rain. */
  roseCount: 46,
  petalCount: 26,
  rainCleanupMs: 16000,
  rainMaxFallMs: 10000,

  /** Reduced motion: every effect degrades to a fade this long at most. */
  reducedMs: 140,
} as const;

export const EASE = {
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  gravity: 'cubic-bezier(0.5, 0, 0.9, 0.6)',
  linear: 'linear',
} as const;

/* ---------- small math ---------- */

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Small deterministic PRNG so effects can be unit tested. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Pt {
  x: number;
  y: number;
}

/* ---------- pure effect generators ---------- */

export interface Particle {
  dx: number;
  dy: number;
  size: number;
  rot: number;
  delay: number;
}

/** Radial burst of small particles (shatter, puff). Evenly spread angles with jitter. */
export function makeParticles(count: number, rng: () => number, spread: number = MOTION.particleSpread): Particle[] {
  const out: Particle[] = [];
  const base = rng() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const angle = base + (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.7;
    const dist = spread * (0.55 + rng() * 0.9);
    out.push({
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist + spread * 0.25, // a touch of gravity
      size: 2 + rng() * 2.6,
      rot: (rng() - 0.5) * 240,
      delay: rng() * 60,
    });
  }
  return out;
}

export interface ArcSample {
  offset: number;
  x: number;
  y: number;
  scale: number;
}

/** Samples a flight arc from `from` to `to` (eased along the path, with a hump of `lift`). */
export function arcSamples(
  from: Pt,
  to: Pt,
  steps: number,
  lift: number,
  maxScale: number,
  ease: (t: number) => number = easeInOutCubic,
): ArcSample[] {
  const out: ArcSample[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = ease(t);
    out.push({
      offset: t,
      x: lerp(from.x, to.x, p),
      y: lerp(from.y, to.y, p) - lift * 4 * p * (1 - p),
      scale: 1 + (maxScale - 1) * Math.sin(Math.PI * p),
    });
  }
  return out;
}

/** Decaying screen-shake offsets, first and last are at rest. */
export function shakeOffsets(amp: number, n: number, rng: () => number): Pt[] {
  const out: Pt[] = [{ x: 0, y: 0 }];
  for (let i = 1; i < n - 1; i++) {
    const decay = 1 - i / (n - 1);
    const sign = i % 2 === 0 ? 1 : -1;
    out.push({ x: sign * amp * decay * (0.7 + rng() * 0.3), y: (rng() - 0.5) * amp * decay });
  }
  out.push({ x: 0, y: 0 });
  return out;
}

export const CONFETTI_COLORS = ['#ffd98a', '#e8a75a', '#c8324b', '#fff6d6', '#7fd1b9', '#9b8cff', '#ff8fa3'] as const;

export interface ConfettiPiece {
  vx: number;
  peak: number;
  fall: number;
  rot: number;
  w: number;
  h: number;
  color: string;
  delay: number;
  dur: number;
  round: boolean;
}

export function makeConfetti(count: number, rng: () => number, viewport: { w: number; h: number }): ConfettiPiece[] {
  const out: ConfettiPiece[] = [];
  for (let i = 0; i < count; i++) {
    const round = rng() < 0.25;
    const w = 6 + rng() * 6;
    out.push({
      vx: (rng() - 0.5) * viewport.w * 1.2,
      peak: viewport.h * (0.22 + rng() * 0.3),
      fall: viewport.h * (0.35 + rng() * 0.45),
      rot: (rng() - 0.5) * 1440,
      w,
      h: round ? w : w * (1.4 + rng() * 0.8),
      color: CONFETTI_COLORS[Math.floor(rng() * CONFETTI_COLORS.length)] ?? '#ffd98a',
      delay: rng() * 220,
      dur: MOTION.confettiMinMs + rng() * (MOTION.confettiMaxMs - MOTION.confettiMinMs),
      round,
    });
  }
  return out;
}

export function confettiKeyframes(p: ConfettiPiece): Keyframe[] {
  return [
    { transform: 'translate(0px, 0px) rotate(0deg) scale(0.4)', easing: 'cubic-bezier(0.1, 0.7, 0.3, 1)', offset: 0 },
    {
      transform: `translate(${p.vx * 0.55}px, ${-p.peak}px) rotate(${p.rot * 0.4}deg) scale(1)`,
      easing: 'cubic-bezier(0.4, 0, 0.9, 0.7)',
      offset: 0.32,
    },
    { transform: `translate(${p.vx}px, ${p.fall}px) rotate(${p.rot}deg) scale(0.9)`, offset: 1 },
  ];
}

export interface RoseSpec {
  left: number;
  size: number;
  /** 0 (far) .. 1 (near). */
  depth: number;
  blur: number;
  opacity: number;
  dur: number;
  delay: number;
  sway: number;
  swayDur: number;
  spin: number;
}

export function makeRoses(count: number, rng: () => number): RoseSpec[] {
  const out: RoseSpec[] = [];
  for (let i = 0; i < count; i++) {
    const depth = rng();
    out.push({
      left: rng() * 100,
      size: lerp(14, 50, depth),
      depth,
      blur: depth < 0.28 ? 1.6 : depth < 0.5 ? 0.7 : 0,
      opacity: lerp(0.55, 1, depth),
      dur: lerp(9.2, 5.2, depth) + rng() * 1.2,
      delay: rng() * 4,
      sway: lerp(8, 34, depth) * (0.6 + rng() * 0.6),
      swayDur: lerp(2.8, 1.8, depth) + rng() * 1.2,
      spin: 10 + rng() * 22,
    });
  }
  return out;
}

export interface PetalSpec {
  left: number;
  size: number;
  dur: number;
  delay: number;
  sway: number;
  swayDur: number;
  hue: number;
}

export function makePetals(count: number, rng: () => number): PetalSpec[] {
  const out: PetalSpec[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      left: rng() * 100,
      size: 7 + rng() * 8,
      dur: 6 + rng() * 4,
      delay: rng() * 5,
      sway: 14 + rng() * 40,
      swayDur: 1.6 + rng() * 1.6,
      hue: 340 + Math.floor(rng() * 20),
    });
  }
  return out;
}

/* ---------- environment ---------- */

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  } catch {
    return false;
  }
}

/** Light haptic tap where supported; never throws. */
export function vibrate(ms: number = MOTION.vibrateMs): void {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    // Browsers block (and warn about) vibration before the first tap.
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return;
    navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}

/* ---------- cancelable scope ---------- */

export type ReducedMode = 'in' | 'out' | 'skip';

/**
 * Owns the animations, timers and throwaway nodes of one screen/game so a
 * screen change or new game can cancel them all without leaking anything.
 */
export class Scope {
  private readonly anims = new Set<Animation>();
  private readonly nodes = new Set<Element>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private dead = false;

  get disposed(): boolean {
    return this.dead;
  }

  get pending(): { animations: number; nodes: number; timers: number } {
    return { animations: this.anims.size, nodes: this.nodes.size, timers: this.timers.size };
  }

  timeout(fn: () => void, ms: number): void {
    if (this.dead) return;
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (!this.dead) fn();
    }, Math.max(0, ms));
    this.timers.add(id);
  }

  /** Registers a throwaway node (removed on dispose). */
  track<T extends Element>(node: T): T {
    this.nodes.add(node);
    return node;
  }

  /**
   * Plays an animation tracked by this scope. With reduced motion it degrades to a
   * short fade (`in`/`out`) or is skipped (`skip`, for purely decorative effects).
   * With `removeAfter` the node is removed once the animation ends or is cancelled.
   */
  play(
    el: Element,
    frames: Keyframe[],
    opts: KeyframeAnimationOptions,
    reduced: ReducedMode = 'in',
    removeAfter = false,
  ): Animation | null {
    if (this.dead || typeof el.animate !== 'function') {
      if (removeAfter) el.remove();
      return null;
    }
    let f = frames;
    let o = opts;
    if (prefersReducedMotion()) {
      if (reduced === 'skip') {
        if (removeAfter) el.remove();
        return null;
      }
      f = reduced === 'out' ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }];
      const dur = typeof opts.duration === 'number' ? opts.duration : MOTION.reducedMs;
      o = { ...opts, duration: Math.min(dur, MOTION.reducedMs), easing: 'linear', iterations: 1 };
    }
    if (removeAfter) this.nodes.add(el);
    const a = el.animate(f, o);
    this.anims.add(a);
    const done = (): void => {
      this.anims.delete(a);
      if (removeAfter) {
        this.nodes.delete(el);
        el.remove();
      }
    };
    a.addEventListener('finish', done);
    a.addEventListener('cancel', done);
    return a;
  }

  /** Cancels everything, clears timers and removes tracked nodes. Idempotent. */
  dispose(): void {
    this.dead = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const a of [...this.anims]) {
      try {
        a.cancel();
      } catch {
        /* ignore */
      }
    }
    this.anims.clear();
    for (const n of this.nodes) n.remove();
    this.nodes.clear();
  }
}
