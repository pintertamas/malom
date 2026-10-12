import './style.css';
import {
  initLifecycleNotifications,
  initNotify,
  notifyGameEnded,
  notifyGameStarted,
  notifyIntroPressed,
  notifyOpened,
  recordVisit,
  retryPending,
  session,
} from './notify';
import { INTRO_TEXT } from './ui/copy';
import { h } from './ui/dom';
import { mountEnd, previewResult } from './ui/endScreen';
import { mountGame } from './ui/gameScreen';
import { getLevel, levelSelector } from './ui/level';

const DATE_ASKED_KEY = 'malom.dateAsked';

function dateAsked(): boolean {
  try {
    return localStorage.getItem(DATE_ASKED_KEY) === '1';
  } catch {
    return false;
  }
}

function markDateAsked(): void {
  try {
    localStorage.setItem(DATE_ASKED_KEY, '1');
  } catch {
    /* ignore */
  }
}

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  const root: HTMLElement = app;
  const params = new URLSearchParams(location.search);
  const preview = previewResult(params.get('preview') ?? '');
  initNotify(location.search, preview !== null);

  let gameNo = 0;
  let current: { destroy(): void } | null = null;
  let cleanupEnd: () => void = () => {};

  const startGame = (): void => {
    cleanupEnd();
    cleanupEnd = () => {};
    current?.destroy();
    gameNo++;
    const n = gameNo;
    notifyGameStarted(n, getLevel(), session.handleSent);
    current = mountGame(root, {
      gameNo: n,
      onNew: startGame,
      onEnd(state, moves, durationMs) {
        const result = state.result;
        if (!result) return;
        notifyGameEnded(result.winner, moves, n, durationMs, getLevel());
        setTimeout(() => {
          if (gameNo !== n) return;
          const ask = !dateAsked();
          if (ask) markDateAsked();
          cleanupEnd = mountEnd(root, result, { gameNo: n, ask, onAgain: startGame });
        }, 1200);
      },
    });
  };

  const showIntro = (): void => {
    const start = h('button', 'btn yes big', 'Kezdjük');
    start.type = 'button';
    start.addEventListener('click', () => {
      notifyIntroPressed();
      startGame();
    });
    root.replaceChildren(
      h(
        'main',
        'screen intro',
        undefined,
        h('div', 'card', undefined, h('p', 'intro-text', INTRO_TEXT), start, h('div', 'level-row', undefined, levelSelector())),
      ),
    );
  };

  if (preview) {
    cleanupEnd = mountEnd(root, preview.result, { gameNo: 0, ask: preview.ask, onAgain: startGame });
  } else {
    notifyOpened(recordVisit());
    initLifecycleNotifications();
    retryPending();
    showIntro();
  }
}
