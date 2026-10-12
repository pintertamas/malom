import { notifyEndCard, notifyIgen, notifyPractice, submitHandle } from '../notify';
import type { GameResult } from '../rules';
import { DATE_QUESTION, PRACTICE_TEXT, endingText, resultCardText } from './copy';
import { h } from './dom';
import { createDodgeButton } from './dodgeButton';
import type { DodgeButton } from './dodgeButton';
import { confettiBurst, sparkles, swapScreen } from './fx';
import { normalizeHandle } from './handle';
import { markHandleSubmitted } from './handleFlag';
import { levelSelector } from './level';
import { EASE, MOTION, Scope } from './motion';
import { startRoseRain } from './roseRain';

const THANKS_MS = 5000;

export interface EndOptions {
  gameNo: number;
  /** Show the Igen/Nem date question (every finished game until her handle was submitted). */
  ask: boolean;
  onAgain(): void;
}

function newGameButton(onAgain: () => void, big: boolean): HTMLButtonElement {
  const b = h('button', big ? 'btn yes big' : 'btn-link', big ? 'Új játék' : 'Játszunk még egyet');
  b.type = 'button';
  b.addEventListener('click', onAgain);
  return b;
}

type Outcome = 'win' | 'lose' | 'draw';

function outcomeOf(result: GameResult): Outcome {
  return result.winner === 0 ? 'win' : result.winner === 1 ? 'lose' : 'draw';
}

/** Result-specific flourish once the card has landed: confetti, a cheeky shrug or sparkles. */
function flourish(scope: Scope, card: HTMLElement, outcome: Outcome): void {
  scope.timeout(() => {
    const text = card.querySelector<HTMLElement>('.end-text');
    if (outcome === 'win') {
      confettiBurst(scope);
      if (text) {
        scope.play(
          text,
          [{ transform: 'scale(1)' }, { transform: 'scale(1.1)', offset: 0.4 }, { transform: 'scale(1)' }],
          { duration: 600, easing: EASE.spring },
        );
      }
    } else if (outcome === 'lose') {
      if (text) {
        scope.play(
          text,
          [
            { transform: 'none', offset: 0 },
            { transform: 'translateY(-7px) scale(1.04)', offset: 0.18 },
            { transform: 'translateY(0) rotate(-2.5deg) scaleY(0.95)', offset: 0.34 },
            { transform: 'rotate(2.5deg)', offset: 0.52 },
            { transform: 'rotate(-1.5deg)', offset: 0.7 },
            { transform: 'rotate(1deg)', offset: 0.86 },
            { transform: 'none', offset: 1 },
          ],
          { duration: 1200, easing: 'ease-in-out' },
          'skip',
        );
      }
    } else {
      sparkles(scope, card);
      if (text) {
        scope.play(
          text,
          [{ transform: 'scale(1)' }, { transform: 'scale(1.04)', offset: 0.5 }, { transform: 'scale(1)' }],
          { duration: 1400, iterations: 2, easing: EASE.inOut },
          'skip',
        );
      }
    }
  }, MOTION.endFlourishDelayMs + MOTION.cardInMs * 0.5);
}

/** Mounts the end screen; returns a cleanup that removes the floating Nem button and any effects. */
export function mountEnd(root: HTMLElement, result: GameResult, opts: EndOptions): () => void {
  notifyEndCard(opts.gameNo);
  const scope = new Scope();
  const outcome = outcomeOf(result);
  if (!opts.ask) {
    const card = h(
      'section',
      `card end-card ${outcome}`,
      undefined,
      h('p', 'end-text', resultCardText(result)),
      newGameButton(opts.onAgain, true),
      h('div', 'level-row', undefined, levelSelector()),
    );
    swapScreen(root, h('main', 'screen end', undefined, card), { slide: false });
    flourish(scope, card, outcome);
    return () => scope.dispose();
  }

  const bubble = h('p', 'bubble');
  bubble.setAttribute('aria-live', 'polite');
  const igen = h('button', 'btn yes glow', 'Igen');
  igen.type = 'button';
  const dodge: DodgeButton = createDodgeButton(igen, bubble);
  const row = h('div', 'btn-row', undefined, igen, dodge.slot);
  const card = h(
    'section',
    `card end-card ${outcome}`,
    undefined,
    h('p', 'end-text', endingText(result)),
    h('p', 'end-q', DATE_QUESTION),
    row,
    h('div', 'again-row', undefined, newGameButton(opts.onAgain, false)),
    bubble,
  );
  const screen = h('main', 'screen end', undefined, card);
  swapScreen(root, screen, { slide: false });
  document.body.append(dodge.button);
  flourish(scope, card, outcome);

  igen.addEventListener('click', () => {
    notifyIgen();
    dodge.hide();
    bubble.classList.remove('show');
    openModal(screen, dodge, opts.onAgain, scope);
  });
  return () => {
    dodge.destroy();
    scope.dispose();
  };
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

function openModal(screen: HTMLElement, dodge: DodgeButton, onAgain: () => void, scope: Scope): void {
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
  scope.timeout(() => input.focus({ preventScroll: true }), 150);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const handle = normalizeHandle(input.value);
    if (!handle) {
      error.textContent = 'Ez nem tűnik érvényes névnek';
      scope.play(
        error,
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
        { duration: 260 },
        'skip',
      );
      return;
    }
    submitHandle(handle);
    markHandleSubmitted();
    dodge.destroy();
    modal.replaceChildren(h('p', 'end-text thanks', 'Köszi! Hamarosan ott írok neked 🌹'));
    scope.play(
      modal,
      [{ transform: 'scale(0.94)' }, { transform: 'scale(1.03)', offset: 0.5 }, { transform: 'scale(1)' }],
      { duration: 480, easing: EASE.out },
      'skip',
    );
    startRoseRain(scope);
    scope.timeout(() => {
      backdrop.classList.add('fade-out');
      scope.timeout(() => {
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
