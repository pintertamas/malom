import { LEVEL_OPTIONS } from '../ai';
import type { AiOptions } from '../ai';
import type { Level } from './level';

export function aiOptionsFor(level: Level): Partial<AiOptions> {
  return LEVEL_OPTIONS[level];
}
