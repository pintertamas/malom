import { h } from './dom';
import {
  EASE,
  MOTION,
  clamp,
  confettiKeyframes,
  makeConfetti,
  makeParticles,
  mulberry32,
  prefersReducedMotion,
  shakeOffsets,
} from './motion';
import type { Pt, Scope } from './motion';

/* ---------- screen transitions ---------- */

function cancelSubtree(el: Element): void {
  if (typeof el.getAnimations !== 'function') return;
  for (const a of el.getAnimations({ subtree: true })) {
    try {
      a.cancel();
    } catch {
      /* ignore */
    }
  }
}

function leaveScreen(el: HTMLElement): void {
  el.setAttribute('inert', '');
  el.setAttribute('aria-hidden', 'true');
  el.style.pointerEvents = 'none';
  let gone = false;
  const remove = (): void => {
    if (gone) return;
    gone = true;
    cancelSubtree(el);
    el.remove();
  };
  if (typeof el.animate !== 'function') {
    remove();
    return;
  }
  const reduced = prefersReducedMotion();
  const ms = reduced ? MOTION.reducedMs : MOTION.screenOutMs;
  const a = el.animate(
    reduced
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: 'translateY(-10px) scale(0.98)' },
        ],
    { duration: ms, easing: 'ease-in', fill: 'forwards' },
  );
  a.addEventListener('finish', remove);
  setTimeout(remove, ms + 300); // fallback if the animation never reports finish
}

/**
 * Replaces the current screen(s) of `root` with `next`: old screens fade/slide out
 * on top of nothing (they are inert and removed when done) while the new one fades in.
 */
export function swapScreen(root: HTMLElement, next: HTMLElement, opts: { slide?: boolean } = {}): void {
  for (const old of Array.from(root.children)) {
    if (old instanceof HTMLElement) leaveScreen(old);
    else old.remove();
  }
  root.append(next);
  if (typeof next.animate !== 'function') return;
  const reduced = prefersReducedMotion();
  const slide = opts.slide !== false && !reduced;
  next.animate(
    [
      { opacity: 0, transform: slide ? 'translateY(14px)' : 'none' },
      { opacity: 1, transform: 'none' },
    ],
    {
      duration: reduced ? MOTION.reducedMs : MOTION.screenInMs,
      easing: EASE.out,
      fill: 'backwards',
    },
  );
}

/* ---------- small effects ---------- */

/** Brief decaying shake (cosmetic; skipped under reduced motion). */
export function shake(scope: Scope, el: Element): void {
  const offs = shakeOffsets(MOTION.shakeAmp, 9, Math.random);
  scope.play(
    el,
    offs.map((o, i) => ({ transform: `translate(${o.x}px, ${o.y}px)`, offset: i / (offs.length - 1) })),
    { duration: MOTION.shakeMs, easing: 'linear' },
    'skip',
  );
}

/** Bouncy pop for a speech bubble that has just (re)appeared. */
export function popBubble(scope: Scope, el: Element): void {
  scope.play(
    el,
    [
      { transform: 'translateY(10px) scale(0.6)', opacity: 0, offset: 0 },
      { transform: 'translateY(-2px) scale(1.08)', opacity: 1, offset: 0.55 },
      { transform: 'none', opacity: 1, offset: 1 },
    ],
    { duration: MOTION.bubblePopMs, easing: EASE.out },
  );
}

/** Quick smoke puff at a viewport position (used for the teleporting Nem button). */
export function puff(scope: Scope, x: number, y: number): void {
  if (prefersReducedMotion()) return;
  const parts = makeParticles(MOTION.puffParticles, Math.random, 38);
  const cloud = h('span', 'puff-cloud');
  cloud.style.left = `${x}px`;
  cloud.style.top = `${y}px`;
  document.body.append(cloud);
  scope.play(
    cloud,
    [
      { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0.85 },
      { transform: 'translate(-50%, -50%) scale(1.5)', opacity: 0 },
    ],
    { duration: MOTION.puffMs * 0.8, easing: EASE.out, fill: 'forwards' },
    'skip',
    true,
  );
  for (const p of parts) {
    const el = h('span', 'puff-dot');
    const size = p.size * 4;
    el.style.left = `${x - size / 2}px`;
    el.style.top = `${y - size / 2}px`;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    document.body.append(el);
    scope.play(
      el,
      [
        { transform: 'translate(0, 0) scale(0.4)', opacity: 0.9 },
        { transform: `translate(${p.dx}px, ${p.dy - 10}px) scale(1.6)`, opacity: 0 },
      ],
      { duration: MOTION.puffMs, delay: p.delay, easing: EASE.out, fill: 'both' },
      'skip',
      true,
    );
  }
}

/** Confetti burst from a point; ~60 plain elements, all removed afterwards. */
export function confettiBurst(scope: Scope, origin?: Pt): void {
  if (prefersReducedMotion()) return;
  const w = window.innerWidth;
  const vh = window.innerHeight;
  const o = origin ?? { x: w / 2, y: vh * 0.5 };
  const layer = scope.track(h('div', 'confetti'));
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  const pieces = makeConfetti(MOTION.confettiCount, Math.random, { w, h: vh });
  let longest = 0;
  for (const p of pieces) {
    const el = h('span', p.round ? 'confetto round' : 'confetto');
    el.style.left = `${o.x}px`;
    el.style.top = `${o.y}px`;
    el.style.width = `${p.w}px`;
    el.style.height = `${p.h}px`;
    el.style.background = p.color;
    layer.append(el);
    longest = Math.max(longest, p.dur + p.delay);
    scope.play(el, confettiKeyframes(p), { duration: p.dur, delay: p.delay, fill: 'both' }, 'skip');
    scope.play(
      el,
      [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }],
      { duration: p.dur, delay: p.delay, fill: 'both', easing: 'linear' },
      'skip',
    );
  }
  scope.timeout(() => layer.remove(), longest + 200);
}

/** A few twinkling stars around `host` (draw result). */
export function sparkles(scope: Scope, host: HTMLElement): void {
  if (prefersReducedMotion()) return;
  const rng = mulberry32((Date.now() & 0xffff) + 7);
  for (let i = 0; i < MOTION.sparkleCount; i++) {
    const el = h('span', 'sparkle');
    const size = 10 + rng() * 14;
    el.style.left = `${clamp(rng() * 100, 4, 96)}%`;
    el.style.top = `${clamp(rng() * 100, 4, 96)}%`;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    host.append(el);
    scope.play(
      el,
      [
        { transform: 'scale(0) rotate(0deg)', opacity: 0 },
        { transform: 'scale(1) rotate(90deg)', opacity: 1, offset: 0.4 },
        { transform: 'scale(0) rotate(180deg)', opacity: 0 },
      ],
      { duration: 1200 + rng() * 600, delay: rng() * 900, iterations: 3, easing: EASE.inOut },
      'skip',
      true,
    );
  }
}
