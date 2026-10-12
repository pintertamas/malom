import type { GameResult, GameState } from '../rules';
import { phase } from '../rules';

export const INTRO_TEXT =
  'Szia Enikő! Azt hallottam, te vagy a malom nagymestere. Lássuk, tényleg így van-e! ♟️';
export const DATE_QUESTION = 'Mit szólsz? 🌹';

export function endingText(result: GameResult): string {
  if (result.winner === 0) return 'Te nyertél, úgyhogy szeretnék egy visszavágót élőben. 🏆';
  if (result.winner === 1) return 'Én nyertem, de játszhatunk egy visszavágót élőben. 😏';
  return 'Döntetlen, szóval inkább játsszunk egy visszavágót élőben! ☕';
}

/** Short result card text for games after the date question was already asked. */
export function resultCardText(result: GameResult): string {
  if (result.winner === 0) return 'Nyertél! 🏆';
  if (result.winner === 1) return 'Ezúttal én nyertem 😏';
  return 'Döntetlen!';
}

export const PRACTICE_TEXT = 'Addig is itt tudsz gyakorolni.';

export function statusText(state: GameState, thinking: boolean): string {
  if (state.result) return 'Vége a játéknak';
  if (thinking || state.turn === 1) return 'Gondolkodom…';
  if (state.pendingRemoval) return 'Malom! Vegyél le egy ellenséges bábut';
  const p = phase(state, 0);
  if (p === 'placing') return 'Te jössz: tegyél le egy bábut';
  if (p === 'flying') return 'Már repülhetsz: bármelyik szabad mezőre léphetsz!';
  return 'Húzz egy bábut egy szomszédos szabad mezőre';
}

export const DODGE_MESSAGES = [
  'Hopp, elszaladt! 😄',
  'Majdnem megvolt, de ez a gomb gyorsabb nálad.',
  'Technikai okokból ez a gomb jelenleg nem elérhető. 🛠️',
  'Ez a gomb most szabadságon van. 🏖️',
  'Inkább nyomd meg a másikat… 😉',
] as const;
