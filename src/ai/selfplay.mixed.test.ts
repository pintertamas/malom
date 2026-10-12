import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../rules/testHelpers';
import { LEVEL_OPTIONS } from './choose';
import type { AiOptions } from './choose';
import { aiMover, playGame, randomMover, tally } from './testUtils';
import type { GameOutcome, Mover } from './testUtils';
import type { Player } from '../rules';

afterEach(() => {
  vi.restoreAllMocks();
});

function series(
  subjectOpts: Partial<AiOptions>,
  other: (rand: () => number) => Mover,
  games: number,
  seed: number,
) {
  const rand = mulberry32(seed);
  const results: { outcome: GameOutcome; subject: Player }[] = [];
  for (let g = 0; g < games; g++) {
    const subject = (g % 2) as Player;
    const a = aiMover(subjectOpts);
    const b = other(rand);
    results.push({ outcome: playGame(subject === 0 ? [a, b] : [b, a]), subject });
  }
  return tally(results);
}

const DRAW_FAST: Partial<AiOptions> = { mode: 'draw', timeMs: 8, maxDepth: 3 };
const STRONG_FAST: Partial<AiOptions> = { mode: 'strong', timeMs: 8, maxDepth: 3 };

describe('AI vs AI', () => {
  it('draw vs strong terminates and the draw AI rarely loses', () => {
    vi.spyOn(Math, 'random').mockImplementation(mulberry32(5));
    const t = series(DRAW_FAST, () => aiMover(STRONG_FAST), 10, 6);
    console.log(`draw vs strong (10 games): draw-AI W${t.win} D${t.draw} L${t.loss}`);
    expect(t.win + t.draw + t.loss).toBe(10);
    expect(t.loss).toBeLessThanOrEqual(3); // generous: depth 3 is shallow and games are few
  }, 180_000);

  it('draw vs draw terminates, almost always as a draw', () => {
    vi.spyOn(Math, 'random').mockImplementation(mulberry32(7));
    const t = series(DRAW_FAST, () => aiMover(DRAW_FAST), 10, 8);
    console.log(`draw vs draw (10 games): W${t.win} D${t.draw} L${t.loss}`);
    expect(t.win + t.draw + t.loss).toBe(10);
    expect(t.draw).toBeGreaterThanOrEqual(6);
  }, 180_000);

  it('the easy and medium levels do not lose to a random mover', () => {
    vi.spyOn(Math, 'random').mockImplementation(mulberry32(9));
    for (const level of ['easy', 'medium'] as const) {
      const opts = { ...LEVEL_OPTIONS[level], timeMs: 10 };
      const t = series(opts, (r) => randomMover(r), 10, 10);
      console.log(`${level} vs random (10 games): W${t.win} D${t.draw} L${t.loss}`);
      expect(t.loss).toBeLessThanOrEqual(1);
    }
  }, 180_000);
});
