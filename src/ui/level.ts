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

const listeners = new Set<() => void>();

export function getLevel(): Level {
  return current;
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
  listeners.forEach((l) => l());
}

/** Compact segmented control; stays in sync across instances. */
export function levelSelector(): HTMLElement {
  const wrap = h('div', 'segmented');
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Nehézség');
  const buttons = LEVELS.map(({ id, label }) => {
    const b = h('button', 'seg', label);
    b.type = 'button';
    b.addEventListener('click', () => setLevel(id));
    wrap.append(b);
    return { id, b };
  });
  const sync = (): void => {
    for (const { id, b } of buttons) {
      b.classList.toggle('on', id === current);
      b.setAttribute('aria-pressed', String(id === current));
    }
  };
  sync();
  listeners.add(sync);
  return wrap;
}
