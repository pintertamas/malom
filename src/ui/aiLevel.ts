import type { AiOptions } from '../ai';
import type { Level } from './level';

// TEMP until src/ai exports LEVEL_OPTIONS.
export function aiOptionsFor(level: Level): Partial<AiOptions> {
  void level;
  return {};
}
