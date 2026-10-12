import { describe, expect, it } from 'vitest';
import { ADJACENT, COORDS, MILLS } from './index';

describe('board geometry', () => {
  it('has 24 points', () => {
    expect(ADJACENT).toHaveLength(24);
    expect(COORDS).toHaveLength(24);
  });

  it('adjacency is symmetric, irreflexive and duplicate-free', () => {
    for (let a = 0; a < 24; a++) {
      const list = ADJACENT[a]!;
      expect(new Set(list).size).toBe(list.length);
      expect(list).not.toContain(a);
      for (const b of list) expect(ADJACENT[b]).toContain(a);
    }
  });

  it('has 32 edges (24 ring edges + 8 connector edges)', () => {
    const total = ADJACENT.reduce((n, l) => n + l.length, 0);
    expect(total / 2).toBe(32);
  });

  it('every point has 2-4 neighbours with the expected degree per position', () => {
    for (let ring = 0; ring < 3; ring++) {
      for (let r = 0; r < 8; r++) {
        const p = ring * 8 + r;
        const degree = ADJACENT[p]!.length;
        expect(degree).toBeGreaterThanOrEqual(2);
        expect(degree).toBeLessThanOrEqual(4);
        if (r % 2 === 0) expect(degree).toBe(2); // corners
        else if (ring === 1) expect(degree).toBe(4); // middle-ring midpoints
        else expect(degree).toBe(3); // outer/inner midpoints
      }
    }
  });

  it('connects the rings only at midpoints', () => {
    expect(ADJACENT[1]).toEqual([0, 2, 9]);
    expect(ADJACENT[9]).toEqual([1, 8, 10, 17]);
    expect(ADJACENT[17]).toEqual([9, 16, 18]);
    expect(ADJACENT[7]).toEqual([0, 6, 15]);
    expect(ADJACENT[0]).toEqual([1, 7]);
    expect(ADJACENT[8]).toEqual([9, 15]);
    // No diagonals / corner connectors.
    expect(ADJACENT[0]).not.toContain(8);
    expect(ADJACENT[2]).not.toContain(10);
  });

  it('has exactly 16 distinct mills, each point in exactly 2', () => {
    expect(MILLS).toHaveLength(16);
    const keys = new Set(MILLS.map((m) => [...m].sort((a, b) => a - b).join('-')));
    expect(keys.size).toBe(16);
    for (let p = 0; p < 24; p++) {
      expect(MILLS.filter((m) => m.includes(p))).toHaveLength(2);
    }
  });

  it('contains the expected mills', () => {
    const has = (a: number, b: number, c: number): boolean =>
      MILLS.some((m) => m[0] === a && m[1] === b && m[2] === c);
    expect(has(0, 1, 2)).toBe(true);
    expect(has(6, 7, 0)).toBe(true);
    expect(has(8, 9, 10)).toBe(true);
    expect(has(22, 23, 16)).toBe(true);
    expect(has(1, 9, 17)).toBe(true);
    expect(has(7, 15, 23)).toBe(true);
  });

  it('mill members are consecutive neighbours', () => {
    for (const [a, b, c] of MILLS) {
      expect(ADJACENT[b]).toContain(a);
      expect(ADJACENT[b]).toContain(c);
    }
  });

  it('COORDS are unique integers on a 0..6 grid in the three-ring layout', () => {
    const seen = new Set<string>();
    for (const { x, y } of COORDS) {
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(6);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(6);
      seen.add(`${x},${y}`);
    }
    expect(seen.size).toBe(24);
    expect(COORDS[0]).toEqual({ x: 0, y: 0 });
    expect(COORDS[1]).toEqual({ x: 3, y: 0 });
    expect(COORDS[4]).toEqual({ x: 6, y: 6 });
    expect(COORDS[7]).toEqual({ x: 0, y: 3 });
    expect(COORDS[8]).toEqual({ x: 1, y: 1 });
    expect(COORDS[19]).toEqual({ x: 4, y: 3 });
    expect(COORDS[22]).toEqual({ x: 2, y: 4 });
  });

  it('mills are straight lines and edges are axis-aligned', () => {
    for (const [a, b, c] of MILLS) {
      const pa = COORDS[a]!;
      const pb = COORDS[b]!;
      const pc = COORDS[c]!;
      const cross = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
      expect(cross).toBe(0);
    }
    for (let a = 0; a < 24; a++) {
      for (const b of ADJACENT[a]!) {
        const dx = COORDS[a]!.x - COORDS[b]!.x;
        const dy = COORDS[a]!.y - COORDS[b]!.y;
        expect(dx === 0 || dy === 0).toBe(true);
      }
    }
  });
});
