import { notifyIgen, submitHandle } from '../notify';
import type { GameResult } from '../rules';
import { DATE_QUESTION, endingText } from './copy';
import { h } from './dom';
import { createDodgeButton } from './dodgeButton';
import type { DodgeButton } from './dodgeButton';
import { normalizeHandle } from './handle';
import { startRoseRain } from './roseRain';

export function mountEnd(root: HTMLElement, result: GameResult): void {
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
    bubble,
  );
  const screen = h('main', 'screen end', undefined, card);
  root.replaceChildren(screen);
  document.body.append(dodge.button);

  igen.addEventListener('click', () => {
    notifyIgen();
    dodge.hide();
    bubble.classList.remove('show');
    openModal(screen, dodge);
  });
}

function openModal(screen: HTMLElement, dodge: DodgeButton): void {
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
    h('p', 'end-text', 'Szuper! 🎉 Mi az Instagram neved, hogy tudjak írni?'),
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
    modal.replaceChildren(h('p', 'end-text thanks', 'Köszi! Hamarosan írok neked 🌹'));
    startRoseRain();
  });
  input.addEventListener('input', () => {
    error.textContent = '';
  });
}

/** Preview helper: synthetic result for `?preview=win|lose|draw`. */
export function previewResult(kind: string): GameResult | null {
  if (kind === 'win') return { winner: 0, reason: 'fewer-than-three' };
  if (kind === 'lose') return { winner: 1, reason: 'fewer-than-three' };
  if (kind === 'draw') return { winner: 'draw', reason: 'repetition' };
  return null;
}
