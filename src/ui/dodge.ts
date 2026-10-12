export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return (
    a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y
  );
}

/** Distance from a point to the nearest edge of a rect (0 when inside). */
export function distanceToRect(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

export interface PickOptions {
  viewport: { w: number; h: number };
  size: { w: number; h: number };
  /** Must never be overlapped (with `gap` clearance). */
  avoid: Rect[];
  /** Avoided when possible (e.g. the button's current spot). */
  soft?: Rect[];
  rng: () => number;
  margin?: number;
  gap?: number;
}

/** Picks a top-left position for the dodging button. */
export function pickDodgePosition(o: PickOptions): { x: number; y: number } {
  const margin = o.margin ?? 16;
  const gap = o.gap ?? 16;
  const minX = margin;
  const minY = margin;
  const maxX = Math.max(minX, o.viewport.w - o.size.w - margin);
  const maxY = Math.max(minY, o.viewport.h - o.size.h - margin);
  const soft = o.soft ?? [];

  const at = (x: number, y: number): Rect => ({ x, y, w: o.size.w, h: o.size.h });
  const hardOk = (r: Rect): boolean => o.avoid.every((a) => !rectsOverlap(r, a, gap));
  const softOk = (r: Rect): boolean => soft.every((a) => !rectsOverlap(r, a, 40));

  for (let i = 0; i < 80; i++) {
    const r = at(minX + o.rng() * (maxX - minX), minY + o.rng() * (maxY - minY));
    if (hardOk(r) && softOk(r)) return { x: r.x, y: r.y };
  }
  for (let i = 0; i < 80; i++) {
    const r = at(minX + o.rng() * (maxX - minX), minY + o.rng() * (maxY - minY));
    if (hardOk(r)) return { x: r.x, y: r.y };
  }
  for (let y = minY; y <= maxY; y += 8) {
    for (let x = minX; x <= maxX; x += 8) {
      if (hardOk(at(x, y))) return { x, y };
    }
  }
  return { x: minX, y: minY };
}
