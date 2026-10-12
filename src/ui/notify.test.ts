import { describe, expect, it } from 'vitest';
import { PairThrottle, SendQueue, formatDuration } from '../notify/util';
import { applyMove, newGame } from '../rules';
import type { GameState, Move, Player } from '../rules';
import { resultCardText } from './copy';
import { previewResult } from './endScreen';
import { MilestoneTracker } from './milestones';

describe('MilestoneTracker', () => {
  it('reports each milestone once per game', () => {
    const t = new MilestoneTracker();
    let s: GameState = newGame();
    const seen: string[] = [];
    // alternate placements: 0 plays points 0..8 style positions without mills
    const mine = [0, 2, 5, 7, 9, 11, 14, 16, 19];
    const theirs = [1, 3, 4, 6, 8, 10, 12, 13, 15];
    for (let i = 0; i < 9; i++) {
      for (const [p, pts] of [
        [0, mine],
        [1, theirs],
      ] as [Player, number[]][]) {
        const move: Move = { type: 'place', to: pts[i] as number };
        s = applyMove(s, move);
        seen.push(...t.onMove(p, move, s));
        if (s.pendingRemoval) break;
      }
    }
    expect(seen.filter((k) => k === 'first-piece')).toHaveLength(1);
    expect(seen).toContain('moves-10');
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('flags mills by player and flying', () => {
    const t = new MilestoneTracker();
    const s = newGame();
    expect(t.onMove(0, { type: 'remove', at: 1 }, s)).toEqual(['her-first-mill']);
    expect(t.onMove(0, { type: 'remove', at: 1 }, s)).toEqual([]);
    expect(t.onMove(1, { type: 'remove', at: 1 }, s)).toEqual(['ai-first-mill']);
    const flying: GameState = { ...s, toPlace: [0, 0], onBoard: [3, 5] };
    expect(t.onMove(1, { type: 'move', from: 1, to: 2 }, flying)).toEqual(['flying']);
  });
});

describe('SendQueue', () => {
  it('keeps order, caps non-exempt items and lets exempt ones through', async () => {
    const sent: number[] = [];
    const q = new SendQueue<number>(async (n) => {
      await new Promise((r) => setTimeout(r, 5 - n));
      sent.push(n);
    }, 2);
    expect(q.enqueue(1)).toBe(true);
    expect(q.enqueue(2)).toBe(true);
    expect(q.enqueue(3)).toBe(false);
    expect(q.enqueue(4, true)).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(sent).toEqual([1, 2, 4]);
  });
  it('survives a failing sender', async () => {
    const sent: number[] = [];
    const q = new SendQueue<number>((n) => (n === 1 ? Promise.reject(new Error('x')) : Promise.resolve(sent.push(n))), 5);
    q.enqueue(1);
    q.enqueue(2);
    await new Promise((r) => setTimeout(r, 10));
    expect(sent).toEqual([2]);
  });
});

describe('PairThrottle', () => {
  it('allows one pair per gap', () => {
    const t = new PairThrottle(1000);
    expect(t.onVisible()).toBe(false);
    expect(t.onHidden(0)).toBe(true);
    expect(t.onVisible()).toBe(true);
    expect(t.onHidden(500)).toBe(false);
    expect(t.onVisible()).toBe(false);
    expect(t.onHidden(1500)).toBe(true);
  });
});

describe('misc', () => {
  it('formats durations', () => {
    expect(formatDuration(42_000)).toBe('42 mp');
    expect(formatDuration(192_000)).toBe('3 perc 12 mp');
  });
  it('result card text', () => {
    expect(resultCardText({ winner: 0, reason: 'blocked' })).toBe('Nyertél! 🏆');
    expect(resultCardText({ winner: 1, reason: 'blocked' })).toBe('Ezúttal én nyertem 😏');
    expect(resultCardText({ winner: 'draw', reason: 'repetition' })).toBe('Döntetlen!');
  });
  it('preview kinds', () => {
    expect(previewResult('win')?.ask).toBe(true);
    expect(previewResult('again')?.ask).toBe(false);
    expect(previewResult('nope')).toBeNull();
  });
});
