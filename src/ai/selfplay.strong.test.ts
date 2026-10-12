import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../rules/testHelpers';
import { aiMover, playGame, randomMover, tally } from './testUtils';
import type { GameOutcome } from './testUtils';
import type { Player } from '../rules';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('strong mode self-play vs a random mover', () => {
  it('never loses over 30 games (both colours)', () => {
    vi.spyOn(Math, 'random').mockImplementation(mulberry32(1));
    const rand = mulberry32(2);
    const results: { outcome: GameOutcome; subject: Player }[] = [];
    for (let g = 0; g < 30; g++) {
      const subject = (g % 2) as Player;
      const ai = aiMover({ mode: 'strong', timeMs: 25, maxDepth: 3 });
      const rnd = randomMover(rand);
      results.push({ outcome: playGame(subject === 0 ? [ai, rnd] : [rnd, ai]), subject });
    }
    const t = tally(results);
    console.log(`strong vs random (30 games): W${t.win} D${t.draw} L${t.loss}`);
    expect(t.loss).toBe(0);
    expect(t.win).toBeGreaterThanOrEqual(25);
  }, 120_000);
});
