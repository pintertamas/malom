/**
 * Static board geometry for Nine Men's Morris.
 *
 * Points 0..23: outer ring 0..7, middle ring 8..15, inner ring 16..23.
 * Within each ring the positions go clockwise from the top-left corner:
 *   r0=top-left, r1=top-middle, r2=top-right, r3=right-middle,
 *   r4=bottom-right, r5=bottom-middle, r6=bottom-left, r7=left-middle.
 */

const RING_COUNT = 3;
const RING_SIZE = 8;

/** Grid offset (0..6 grid) of each ring's top-left corner: outer 0, middle 1, inner 2. */
const RING_INSET = [0, 1, 2] as const;

function buildCoords(): { x: number; y: number }[] {
  const coords: { x: number; y: number }[] = [];
  for (let ring = 0; ring < RING_COUNT; ring++) {
    const lo = RING_INSET[ring] as number;
    const hi = 6 - lo;
    const mid = 3;
    coords.push(
      { x: lo, y: lo }, // r0 top-left
      { x: mid, y: lo }, // r1 top-middle
      { x: hi, y: lo }, // r2 top-right
      { x: hi, y: mid }, // r3 right-middle
      { x: hi, y: hi }, // r4 bottom-right
      { x: mid, y: hi }, // r5 bottom-middle
      { x: lo, y: hi }, // r6 bottom-left
      { x: lo, y: mid }, // r7 left-middle
    );
  }
  return coords;
}

function buildAdjacency(): number[][] {
  const adj: number[][] = Array.from({ length: RING_COUNT * RING_SIZE }, () => []);
  const link = (a: number, b: number): void => {
    adj[a]?.push(b);
    adj[b]?.push(a);
  };
  for (let ring = 0; ring < RING_COUNT; ring++) {
    const base = ring * RING_SIZE;
    for (let i = 0; i < RING_SIZE; i++) {
      link(base + i, base + ((i + 1) % RING_SIZE));
    }
  }
  // Connectors between rings at the middle points r1, r3, r5, r7.
  for (const r of [1, 3, 5, 7]) {
    link(r, RING_SIZE + r);
    link(RING_SIZE + r, 2 * RING_SIZE + r);
  }
  for (const list of adj) list.sort((a, b) => a - b);
  return adj;
}

function buildMills(): [number, number, number][] {
  const mills: [number, number, number][] = [];
  for (let ring = 0; ring < RING_COUNT; ring++) {
    const base = ring * RING_SIZE;
    // Sides: r0-r1-r2, r2-r3-r4, r4-r5-r6, r6-r7-r0
    for (let side = 0; side < 4; side++) {
      const a = base + side * 2;
      const b = base + side * 2 + 1;
      const c = base + ((side * 2 + 2) % RING_SIZE);
      mills.push([a, b, c]);
    }
  }
  for (const r of [1, 3, 5, 7]) {
    mills.push([r, RING_SIZE + r, 2 * RING_SIZE + r]);
  }
  return mills;
}

export const POINT_COUNT = RING_COUNT * RING_SIZE;

/** ADJACENT[p] = sorted list of points directly connected to p. */
export const ADJACENT: readonly (readonly number[])[] = buildAdjacency();

/** All 16 mills (three points on a line). */
export const MILLS: readonly (readonly [number, number, number])[] = buildMills();

/** Drawing coordinates on a 0..6 integer grid. */
export const COORDS: readonly { x: number; y: number }[] = buildCoords();

/** MILLS_BY_POINT[p] = the (two) mills passing through point p. */
export const MILLS_BY_POINT: readonly (readonly (readonly [number, number, number])[])[] =
  Array.from({ length: POINT_COUNT }, (_, p) => MILLS.filter((m) => m.includes(p)));
