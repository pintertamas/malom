import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../rules/testHelpers';
import { aiMover, playGame, randomMover, tally } from './testUtils';
import type { GameOutcome } from './testUtils';
import type { Player } from '../rules';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('draw mode vs a random mover', () => {
  it('loses nothing and wins at most 10% over 40 games; draws dominate', () => {
    vi.spyOn(Math, 'random').mockImplementation(mulberry32(3));
    const rand = mulberry32(4);
    const results: { outcome: GameOutcome; subject: Player }[] = [];
    for (let g = 0; g < 40; g++) {
      const subject = (g % 2) as Player;
      const ai = aiMover({ mode: 'draw', timeMs: 8, maxDepth: 3 });
      const rnd = randomMover(rand);
      results.push({ outcome: playGame(subject === 0 ? [ai, rnd] : [rnd, ai]), subject });
    }
    const t = tally(results);
    console.log(`draw vs random (40 games): W${t.win} D${t.draw} L${t.loss}`);
    expect(t.loss).toBe(0);
    expect(t.win).toBeLessThanOrEqual(4);
    expect(t.draw).toBeGreaterThanOrEqual(30);
  }, 180_000);
});
