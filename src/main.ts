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
import { mountBackground } from './ui/background';
import { BoardView } from './ui/boardView';
import { INTRO_TEXT } from './ui/copy';
import { h } from './ui/dom';
import { mountEnd, previewResult } from './ui/endScreen';
import { swapScreen } from './ui/fx';
import { mountGame } from './ui/gameScreen';
import { shouldAskDate } from './ui/handleFlag';
import { getLevel, levelSelector } from './ui/level';
import { MOTION } from './ui/motion';

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  const root: HTMLElement = app;
  const params = new URLSearchParams(location.search);
  const preview = previewResult(params.get('preview') ?? '');
  initNotify(location.search, preview !== null);
  mountBackground();

  let gameNo = 0;
  let current: { destroy(): void } | null = null;
  let cleanupEnd: () => void = () => {};
  let cleanupIntro: () => void = () => {};

  const startGame = (): void => {
    cleanupEnd();
    cleanupEnd = () => {};
    cleanupIntro();
    cleanupIntro = () => {};
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
          // The date question comes after every game until she has submitted her handle.
          cleanupEnd = mountEnd(root, result, { gameNo: n, ask: shouldAskDate(), onAgain: startGame });
        }, MOTION.endCardDelayMs);
      },
    });
  };

  const showIntro = (): void => {
    const start = h('button', 'btn yes big glow stage', 'Kezdjük');
    start.type = 'button';
    start.style.setProperty('--d', `${MOTION.stageStepMs * 5}ms`);
    start.addEventListener('click', () => {
      notifyIntroPressed();
      startGame();
    });
    const decor = new BoardView();
    decor.el.classList.add('decor');
    decor.el.setAttribute('aria-hidden', 'true');
    decor.el.removeAttribute('role');
    const text = h('p', 'intro-text stage', INTRO_TEXT);
    text.style.setProperty('--d', `${MOTION.stageStepMs * 3}ms`);
    const level = h('div', 'level-row stage', undefined, levelSelector());
    level.style.setProperty('--d', `${MOTION.stageStepMs * 6}ms`);
    swapScreen(
      root,
      h(
        'main',
        'screen intro',
        undefined,
        h('div', 'intro-board', undefined, decor.el),
        h('div', 'card', undefined, text, start, level),
      ),
    );
    decor.playIntro(60);
    decor.playDemo(1000);
    cleanupIntro = () => decor.destroy();
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
