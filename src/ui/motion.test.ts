import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleSubmitted, markHandleSubmitted, shouldAskDate } from './handleFlag';
import {
  CONFETTI_COLORS,
  MOTION,
  Scope,
  arcSamples,
  clamp,
  confettiKeyframes,
  easeInOutCubic,
  lerp,
  makeConfetti,
  makeParticles,
  makePetals,
  makeRoses,
  mulberry32,
  prefersReducedMotion,
  shakeOffsets,
  vibrate,
} from './motion';
import { previewResult } from './endScreen';

describe('mulberry32', () => {
  it('is deterministic and within [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('math helpers', () => {
  it('lerp, clamp and easing endpoints', () => {
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  });
});

describe('makeParticles', () => {
  it('produces the requested count with bounded, seeded values', () => {
    const ps = makeParticles(MOTION.particleCount, mulberry32(7));
    expect(ps).toHaveLength(MOTION.particleCount);
    expect(makeParticles(MOTION.particleCount, mulberry32(7))).toEqual(ps);
    for (const p of ps) {
      expect(Math.hypot(p.dx, p.dy)).toBeLessThan(MOTION.particleSpread * 1.6);
      expect(p.size).toBeGreaterThan(0);
      expect(p.delay).toBeLessThan(61);
    }
  });

  it('spreads in all directions', () => {
    const ps = makeParticles(10, mulberry32(3));
    expect(ps.some((p) => p.dx > 0) && ps.some((p) => p.dx < 0)).toBe(true);
    expect(ps.some((p) => p.dy > 0) && ps.some((p) => p.dy < 0)).toBe(true);
  });
});

describe('arcSamples', () => {
  const from = { x: 0, y: 100 };
  const to = { x: 200, y: 100 };
  const s = arcSamples(from, to, 10, 60, 1.4);

  it('starts and ends exactly at the endpoints with scale 1', () => {
    expect(s[0]).toEqual({ offset: 0, x: 0, y: 100, scale: 1 });
    const last = s[s.length - 1];
    expect(last?.x).toBeCloseTo(200);
    expect(last?.y).toBeCloseTo(100);
    expect(last?.scale).toBeCloseTo(1);
  });

  it('has increasing offsets, a lifted midpoint and a scaled-up peak', () => {
    for (let i = 1; i < s.length; i++) expect((s[i] as { offset: number }).offset).toBeGreaterThan((s[i - 1] as { offset: number }).offset);
    const mid = s[5];
    expect(mid?.y).toBeCloseTo(40);
    expect(mid?.scale).toBeCloseTo(1.4);
    expect(mid?.x).toBeCloseTo(100);
  });
});

describe('shakeOffsets', () => {
  it('rests at both ends and decays', () => {
    const o = shakeOffsets(5, 9, mulberry32(1));
    expect(o).toHaveLength(9);
    expect(o[0]).toEqual({ x: 0, y: 0 });
    expect(o[8]).toEqual({ x: 0, y: 0 });
    expect(Math.abs((o[1] as { x: number }).x)).toBeGreaterThan(Math.abs((o[7] as { x: number }).x));
  });
});

describe('confetti', () => {
  const viewport = { w: 375, h: 812 };
  it('makes the configured number of pieces, seeded', () => {
    const c = makeConfetti(MOTION.confettiCount, mulberry32(9), viewport);
    expect(c).toHaveLength(60);
    expect(makeConfetti(MOTION.confettiCount, mulberry32(9), viewport)).toEqual(c);
    for (const p of c) {
      expect(CONFETTI_COLORS).toContain(p.color);
      expect(p.dur).toBeGreaterThanOrEqual(MOTION.confettiMinMs);
      expect(p.dur).toBeLessThanOrEqual(MOTION.confettiMaxMs);
      expect(p.peak).toBeGreaterThan(0);
    }
  });

  it('builds transform-only keyframes that rise then fall', () => {
    const [p] = makeConfetti(1, mulberry32(5), viewport);
    const kf = confettiKeyframes(p as NonNullable<typeof p>);
    expect(kf).toHaveLength(3);
    expect(kf[1]?.offset).toBeGreaterThan(0);
    for (const f of kf) expect(Object.keys(f).every((k) => ['transform', 'easing', 'offset'].includes(k))).toBe(true);
  });
});

describe('rose rain specs', () => {
  it('has depth-dependent size, blur and speed', () => {
    const roses = makeRoses(MOTION.roseCount, mulberry32(11));
    expect(roses).toHaveLength(MOTION.roseCount);
    const far = roses.filter((r) => r.depth < 0.28);
    const near = roses.filter((r) => r.depth > 0.7);
    expect(far.length).toBeGreaterThan(0);
    expect(near.length).toBeGreaterThan(0);
    for (const r of far) expect(r.blur).toBeGreaterThan(0);
    for (const r of near) expect(r.blur).toBe(0);
    expect(Math.min(...near.map((r) => r.size))).toBeGreaterThan(Math.max(...far.map((r) => r.size)));
    // everything finishes within the cleanup window
    for (const r of roses) expect((r.dur + r.delay) * 1000).toBeLessThan(MOTION.rainCleanupMs);
  });

  it('petals stay inside the cleanup window too', () => {
    const petals = makePetals(MOTION.petalCount, mulberry32(2));
    expect(petals).toHaveLength(MOTION.petalCount);
    for (const p of petals) expect((p.dur + p.delay) * 1000).toBeLessThan(MOTION.rainCleanupMs);
  });
});

describe('Scope', () => {
  afterEach(() => vi.useRealTimers());

  it('runs timers and cancels them on dispose', () => {
    vi.useFakeTimers();
    const scope = new Scope();
    const fired: number[] = [];
    scope.timeout(() => fired.push(1), 100);
    scope.timeout(() => fired.push(2), 300);
    vi.advanceTimersByTime(150);
    expect(fired).toEqual([1]);
    expect(scope.pending.timers).toBe(1);
    scope.dispose();
    vi.advanceTimersByTime(1000);
    expect(fired).toEqual([1]);
    expect(scope.disposed).toBe(true);
    expect(scope.pending.timers).toBe(0);
  });

  it('ignores new work after dispose and tolerates double dispose', () => {
    vi.useFakeTimers();
    const scope = new Scope();
    scope.dispose();
    const fn = vi.fn();
    scope.timeout(fn, 10);
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();
    expect(() => scope.dispose()).not.toThrow();
  });
});

describe('environment helpers (no DOM)', () => {
  it('never throw without window/navigator support', () => {
    expect(prefersReducedMotion()).toBe(false);
    expect(() => vibrate()).not.toThrow();
  });
});

describe('handleSubmitted flag', () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const data = { ...initial };
    return {
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
    };
  }

  it('asks the date question until the handle was submitted', () => {
    const st = fakeStorage();
    expect(handleSubmitted(st)).toBe(false);
    expect(shouldAskDate(st)).toBe(true);
    markHandleSubmitted(st);
    expect(handleSubmitted(st)).toBe(true);
    expect(shouldAskDate(st)).toBe(false);
  });

  it('keeps asking when storage is unavailable or throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(shouldAskDate(broken)).toBe(true);
    expect(() => markHandleSubmitted(broken)).not.toThrow();
    expect(shouldAskDate(null)).toBe(true);
  });
});

describe('previewResult', () => {
  it('date-card previews always ask; later-game result cards do not', () => {
    for (const k of ['win', 'lose', 'draw']) expect(previewResult(k)?.ask).toBe(true);
    for (const k of ['again', 'win2', 'lose2', 'draw2']) expect(previewResult(k)?.ask).toBe(false);
    expect(previewResult('nope')).toBeNull();
  });
});
