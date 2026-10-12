import { notifyLevel } from '../notify';
import { h } from './dom';

export type Level = 'easy' | 'medium' | 'hard';

export const LEVELS: { id: Level; label: string }[] = [
  { id: 'easy', label: 'Könnyű' },
  { id: 'medium', label: 'Közepes' },
  { id: 'hard', label: 'Nehéz' },
];

const KEY = 'malom.level';

export function isLevel(v: unknown): v is Level {
  return v === 'easy' || v === 'medium' || v === 'hard';
}

let current: Level = 'medium';
try {
  const stored = localStorage.getItem(KEY);
  if (isLevel(stored)) current = stored;
} catch {
  /* ignore */
}

interface Selector {
  wrap: HTMLElement;
  seen: boolean;
  sync(): void;
}

const listeners = new Set<Selector>();

/** Selectors live on screens that get replaced; forget the ones that were removed. */
function prune(): void {
  for (const s of listeners) {
    if (s.wrap.isConnected) s.seen = true;
    else if (s.seen) listeners.delete(s);
  }
}

export function getLevel(): Level {
  return current;
}

/** Number of live selectors (for leak checks). */
export function selectorCount(): number {
  return listeners.size;
}

export function setLevel(level: Level): void {
  if (level === current) return;
  current = level;
  try {
    localStorage.setItem(KEY, level);
  } catch {
    /* ignore */
  }
  notifyLevel(level);
  prune();
  listeners.forEach((l) => l.sync());
}

/** Compact segmented control; stays in sync across instances. */
export function levelSelector(): HTMLElement {
  const wrap = h('div', 'segmented');
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Nehézség');
  const thumb = h('span', 'seg-thumb');
  thumb.setAttribute('aria-hidden', 'true');
  wrap.append(thumb);
  const buttons = LEVELS.map(({ id, label }) => {
    const b = h('button', 'seg', label);
    b.type = 'button';
    b.addEventListener('click', () => setLevel(id));
    wrap.append(b);
    return { id, b };
  });
  const sync = (): void => {
    wrap.style.setProperty('--i', String(Math.max(0, LEVELS.findIndex((l) => l.id === current))));
    for (const { id, b } of buttons) {
      b.classList.toggle('on', id === current);
      b.setAttribute('aria-pressed', String(id === current));
    }
  };
  sync();
  prune();
  listeners.add({ wrap, seen: false, sync });
  // Enable the sliding transition only after the first paint so it does not animate on mount.
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('ready')));
  return wrap;
}
