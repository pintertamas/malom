import { session } from '../notify';
import { DODGE_MESSAGES } from './copy';
import { distanceToRect, pickDodgePosition } from './dodge';
import type { Rect } from './dodge';
import { h } from './dom';

const NEAR_PX = 90;
const COUNT_GAP_MS = 300;

export interface DodgeButton {
  /** Element that reserves the initial slot in the layout. */
  slot: HTMLElement;
  button: HTMLButtonElement;
  hide(): void;
  destroy(): void;
}

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

export function createDodgeButton(igen: HTMLElement, bubble: HTMLElement): DodgeButton {
  const slot = h('span', 'btn ghost', 'Nem');
  const button = h('button', 'btn no', 'Nem');
  button.type = 'button';
  button.tabIndex = -1;
  button.style.visibility = 'hidden'; // until placed over the slot
  button.setAttribute('aria-disabled', 'true');
  let moved = false;
  let lastCount = 0;
  let messageIdx = 0;
  let hideTimer: number | undefined;
  let hidden = false;

  const setPos = (x: number, y: number): void => {
    button.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };
  const home = (): void => {
    if (moved) return;
    const r = rectOf(slot);
    setPos(r.x, r.y);
    button.style.visibility = 'visible';
  };

  const dodge = (): void => {
    if (hidden) return;
    const size = { w: button.offsetWidth, h: button.offsetHeight };
    const pos = pickDodgePosition({
      viewport: { w: window.innerWidth, h: window.innerHeight },
      size,
      avoid: [rectOf(igen)],
      soft: [rectOf(button)],
      rng: Math.random,
    });
    moved = true;
    setPos(pos.x, pos.y);
    const now = Date.now();
    if (now - lastCount >= COUNT_GAP_MS) {
      lastCount = now;
      session.dodgeCount++;
      bubble.textContent = DODGE_MESSAGES[messageIdx % DODGE_MESSAGES.length] ?? '';
      messageIdx++;
      bubble.classList.add('show');
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => bubble.classList.remove('show'), 3500);
    }
  };

  const stop = (e: Event): void => {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
  };
  const handled = new WeakSet<Event>();
  const direct = (e: Event): void => {
    stop(e);
    handled.add(e);
    dodge();
  };
  for (const t of ['pointerenter', 'pointerdown', 'mousedown', 'focus', 'touchstart'] as const) {
    button.addEventListener(t, direct, { passive: false });
  }
  button.addEventListener('click', (e) => {
    stop(e); // never does anything
  });
  button.addEventListener('keydown', stop);

  const near = (x: number, y: number): void => {
    if (!hidden && distanceToRect(x, y, rectOf(button)) < NEAR_PX) dodge();
  };
  const onPointer = (e: PointerEvent): void => {
    if (!handled.has(e)) near(e.clientX, e.clientY);
  };
  const onTouch = (e: TouchEvent): void => {
    const t = e.touches[0];
    if (t && !handled.has(e)) near(t.clientX, t.clientY);
  };
  const onResize = (): void => {
    if (!moved) home();
    else {
      const r = rectOf(button);
      const x = Math.min(Math.max(16, r.x), Math.max(16, window.innerWidth - r.w - 16));
      const y = Math.min(Math.max(16, r.y), Math.max(16, window.innerHeight - r.h - 16));
      setPos(x, y);
    }
  };
  document.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('touchmove', onTouch, { passive: true });
  document.addEventListener('touchstart', onTouch, { passive: true });
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  // Settle over the placeholder: layout, fonts, the card's rise animation, any later resize.
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(home);
  const onAnimEnd = (): void => home();
  requestAnimationFrame(() => {
    home();
    requestAnimationFrame(home);
    ro?.observe(slot);
    ro?.observe(document.body);
    slot.closest('.card')?.addEventListener('animationend', onAnimEnd);
  });
  void document.fonts?.ready.then(home);

  return {
    slot,
    button,
    hide() {
      hidden = true;
      button.style.display = 'none';
      slot.style.display = 'none';
    },
    destroy() {
      document.removeEventListener('pointermove', onPointer);
      document.removeEventListener('touchmove', onTouch);
      document.removeEventListener('touchstart', onTouch);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      ro?.disconnect();
      button.remove();
    },
  };
}
