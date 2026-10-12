import { describe, expect, it } from 'vitest';
import { applyMove, newGame } from '../rules';
import { identityLabel, parseDevice } from '../notify/device';
import { DODGE_MESSAGES, INTRO_TEXT, endingText, statusText } from './copy';
import { pickDodgePosition, rectsOverlap, type Rect } from './dodge';
import { normalizeHandle } from './handle';

describe('endingText', () => {
  it('covers all outcomes', () => {
    expect(endingText({ winner: 0, reason: 'blocked' })).toContain('Te nyertél');
    expect(endingText({ winner: 1, reason: 'blocked' })).toContain('Én nyertem');
    expect(endingText({ winner: 'draw', reason: 'repetition' })).toContain('Döntetlen');
  });
});

describe('statusText', () => {
  it('describes the placing phase and the AI turn', () => {
    const s = newGame();
    expect(statusText(s, false)).toBe('Te jössz: tegyél le egy bábut');
    expect(statusText(applyMove(s, { type: 'place', to: 0 }), false)).toBe('Gondolkodom…');
  });
});

describe('intro text', () => {
  it('uses the teasing greeting', () => {
    expect(INTRO_TEXT).toBe(
      'Szia Enikő! Szóval szerinted nem tudlak megverni malomban? Lássuk, tényleg így van-e! ♟️',
    );
  });
});

describe('dodge messages', () => {
  it('has five', () => expect(DODGE_MESSAGES).toHaveLength(5));
});

describe('pickDodgePosition', () => {
  const viewport = { w: 375, h: 667 };
  const size = { w: 110, h: 52 };
  const igen: Rect = { x: 60, y: 400, w: 110, h: 52 };
  it('stays inside the viewport and never overlaps Igen', () => {
    let seed = 7;
    const rng = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 500; i++) {
      const p = pickDodgePosition({ viewport, size, avoid: [igen], soft: [{ x: 200, y: 400, ...size }], rng });
      expect(p.x).toBeGreaterThanOrEqual(16);
      expect(p.y).toBeGreaterThanOrEqual(16);
      expect(p.x + size.w).toBeLessThanOrEqual(viewport.w - 16);
      expect(p.y + size.h).toBeLessThanOrEqual(viewport.h - 16);
      expect(rectsOverlap({ ...p, ...size }, igen)).toBe(false);
    }
  });
  it('works with a constant rng', () => {
    const p = pickDodgePosition({ viewport, size, avoid: [{ x: 16, y: 16, w: 110, h: 52 }], rng: () => 0 });
    expect(rectsOverlap({ ...p, ...size }, { x: 16, y: 16, w: 110, h: 52 })).toBe(false);
  });
});

describe('normalizeHandle', () => {
  it('normalises', () => {
    expect(normalizeHandle('@eniko.k_1')).toBe('eniko.k_1');
    expect(normalizeHandle('  @@ eniko ')).toBe('eniko');
    expect(normalizeHandle('https://www.instagram.com/eniko.x/?igsh=abc')).toBe('eniko.x');
    expect(normalizeHandle('instagram.com/eniko/')).toBe('eniko');
  });
  it('rejects invalid', () => {
    expect(normalizeHandle('')).toBeNull();
    expect(normalizeHandle('@')).toBeNull();
    expect(normalizeHandle('ne kérj')).toBeNull();
    expect(normalizeHandle('á')).toBeNull();
    expect(normalizeHandle('a'.repeat(31))).toBeNull();
    expect(normalizeHandle('a'.repeat(30))).not.toBeNull();
  });
});

describe('device / identity', () => {
  it('parses user agents', () => {
    expect(
      parseDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('iPhone / Safari');
    expect(parseDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537 Chrome/120 Mobile Safari/537')).toBe(
      'Android / Chrome',
    );
    expect(parseDevice('Mozilla/5.0 (Windows NT 10.0; Win64) AppleWebKit/537 Chrome/120 Safari/537 Edg/120')).toBe(
      'Windows / Edge',
    );
    expect(parseDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit CriOS/120 Mobile Safari')).toBe(
      'iPhone / Chrome',
    );
  });
  it('labels identity', () => {
    expect(identityLabel('?e=50b337824ed8')).toBe('ENIKO linkje');
    expect(identityLabel('?e=x')).toContain('NEM');
    expect(identityLabel('')).toContain('NEM');
  });
});
