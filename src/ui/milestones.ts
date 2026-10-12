import { phase } from '../rules';
import type { GameState, Move, Player } from '../rules';

export type MilestoneKey =
  | 'first-piece'
  | 'placing-done'
  | 'her-first-mill'
  | 'ai-first-mill'
  | 'flying'
  | 'moves-10'
  | 'moves-20'
  | 'moves-40';

const MOVE_MARKS: Record<number, MilestoneKey> = { 10: 'moves-10', 20: 'moves-20', 40: 'moves-40' };

/** Tracks per-game milestones; each key is reported at most once per game. */
export class MilestoneTracker {
  private readonly seen = new Set<MilestoneKey>();
  moves = 0;

  /** Call after each applied move (`after` is the resulting state). Returns newly reached milestones. */
  onMove(player: Player, move: Move, after: GameState): MilestoneKey[] {
    const out: MilestoneKey[] = [];
    const hit = (k: MilestoneKey): void => {
      if (!this.seen.has(k)) {
        this.seen.add(k);
        out.push(k);
      }
    };
    if (move.type === 'remove') {
      hit(player === 0 ? 'her-first-mill' : 'ai-first-mill');
    } else {
      this.moves++;
      const mark = MOVE_MARKS[this.moves];
      if (mark) hit(mark);
      if (player === 0 && move.type === 'place') {
        hit('first-piece');
        if (after.toPlace[0] === 0) hit('placing-done');
      }
    }
    if (after.toPlace[0] === 0 && phase(after, 0) === 'flying') hit('flying');
    return out;
  }
}

export function milestoneText(key: MilestoneKey): string {
  switch (key) {
    case 'first-piece':
      return 'lerakta az elso babujat';
    case 'placing-done':
      return 'vege a lerakosdinak, johet a mozgatas';
    case 'her-first-mill':
      return 'ELSO MALOM nala';
    case 'ai-first-mill':
      return 'az AI csinalt elso malmot';
    case 'flying':
      return 'mar repulhet (3 babu)';
    case 'moves-10':
      return '10 lepes meg van';
    case 'moves-20':
      return '20 lepes meg van';
    case 'moves-40':
      return '40 lepes meg van';
  }
}
