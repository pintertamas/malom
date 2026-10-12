import { notifyEndCard, notifyIgen, notifyPractice, submitHandle } from '../notify';
import type { GameResult } from '../rules';
import { DATE_QUESTION, PRACTICE_TEXT, endingText, resultCardText } from './copy';
import { h } from './dom';
import { createDodgeButton } from './dodgeButton';
import type { DodgeButton } from './dodgeButton';
import { normalizeHandle } from './handle';
import { levelSelector } from './level';
import { startRoseRain } from './roseRain';

const THANKS_MS = 5000;

export interface EndOptions {
  gameNo: number;
  /** Show the Igen/Nem date question (only the very first finished game). */
  ask: boolean;
  onAgain(): void;
}

function newGameButton(onAgain: () => void, big: boolean): HTMLButtonElement {
  const b = h('button', big ? 'btn yes big' : 'btn-link', big ? 'Új játék' : 'Játszunk még egyet');
  b.type = 'button';
  b.addEventListener('click', onAgain);
  return b;
}

/** Mounts the end screen; returns a cleanup that removes the floating Nem button. */
export function mountEnd(root: HTMLElement, result: GameResult, opts: EndOptions): () => void {
  notifyEndCard(opts.gameNo);
  if (!opts.ask) {
    const card = h(
      'section',
      'card end-card',
      undefined,
      h('p', 'end-text', resultCardText(result)),
      newGameButton(opts.onAgain, true),
      h('div', 'level-row', undefined, levelSelector()),
    );
    root.replaceChildren(h('main', 'screen end', undefined, card));
    return () => {};
  }

  const bubble = h('p', 'bubble');
  bubble.setAttribute('aria-live', 'polite');
  const igen = h('button', 'btn yes', 'Igen');
  igen.type = 'button';
  const dodge: DodgeButton = createDodgeButton(igen, bubble);
  const row = h('div', 'btn-row', undefined, igen, dodge.slot);
  const card = h(
    'section',
    'card end-card',
    undefined,
    h('p', 'end-text', endingText(result)),
    h('p', 'end-q', DATE_QUESTION),
    row,
    h('div', 'again-row', undefined, newGameButton(opts.onAgain, false)),
    bubble,
  );
  const screen = h('main', 'screen end', undefined, card);
  root.replaceChildren(screen);
  document.body.append(dodge.button);

  igen.addEventListener('click', () => {
    notifyIgen();
    dodge.hide();
    bubble.classList.remove('show');
    openModal(screen, dodge, opts.onAgain);
  });
  return () => dodge.destroy();
}

function showPractice(screen: HTMLElement, onAgain: () => void): void {
  notifyPractice();
  const card = h(
    'section',
    'card end-card',
    undefined,
    h('p', 'end-text', PRACTICE_TEXT),
    newGameButton(onAgain, true),
    h('div', 'level-row', undefined, levelSelector()),
  );
  screen.replaceChildren(card);
}

function openModal(screen: HTMLElement, dodge: DodgeButton, onAgain: () => void): void {
  const input = h('input', 'handle-input');
  input.type = 'text';
  input.placeholder = 'felhasználónév';
  input.autocomplete = 'off';
  input.autocapitalize = 'none';
  input.spellcheck = false;
  input.maxLength = 120;
  input.inputMode = 'text';
  input.setAttribute('aria-label', 'Instagram név');
  const error = h('p', 'error');
  const send = h('button', 'btn yes', 'Küldés');
  send.type = 'submit';
  const form = h(
    'form',
    'modal-form',
    undefined,
    h('div', 'handle-row', undefined, h('span', 'at', '@'), input),
    error,
    send,
    h('p', 'tiny', 'Csak nekem küldi el.'),
  );
  form.noValidate = true;
  const modal = h(
    'div',
    'card modal',
    undefined,
    h('p', 'end-text', 'Szuper! 🎉 Mi az Instagram neved, hogy ott tudjak írni?'),
    form,
  );
  const backdrop = h('div', 'backdrop', undefined, modal);
  screen.append(backdrop);
  setTimeout(() => input.focus({ preventScroll: true }), 150);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const handle = normalizeHandle(input.value);
    if (!handle) {
      error.textContent = 'Ez nem tűnik érvényes névnek';
      return;
    }
    submitHandle(handle);
    dodge.destroy();
    modal.replaceChildren(h('p', 'end-text thanks', 'Köszi! Hamarosan ott írok neked 🌹'));
    startRoseRain();
    setTimeout(() => {
      backdrop.classList.add('fade-out');
      setTimeout(() => {
        showPractice(screen, onAgain);
      }, 600);
    }, THANKS_MS);
  });
  input.addEventListener('input', () => {
    error.textContent = '';
  });
}

/** Preview helper: `?preview=win|lose|draw` (date screen) or `again` (later-game result card). */
export function previewResult(kind: string): { result: GameResult; ask: boolean } | null {
  if (kind === 'win') return { result: { winner: 0, reason: 'fewer-than-three' }, ask: true };
  if (kind === 'lose') return { result: { winner: 1, reason: 'fewer-than-three' }, ask: true };
  if (kind === 'draw') return { result: { winner: 'draw', reason: 'repetition' }, ask: true };
  if (kind === 'again' || kind === 'win2') return { result: { winner: 0, reason: 'fewer-than-three' }, ask: false };
  if (kind === 'lose2') return { result: { winner: 1, reason: 'fewer-than-three' }, ask: false };
  if (kind === 'draw2') return { result: { winner: 'draw', reason: 'repetition' }, ask: false };
  return null;
}
