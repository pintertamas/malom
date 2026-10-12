import './style.css';
import { initNotify, notifyEnded, notifyOpened, notifyStarted, retryPending } from './notify';
import { INTRO_TEXT } from './ui/copy';
import { h } from './ui/dom';
import { mountEnd, previewResult } from './ui/endScreen';
import { mountGame } from './ui/gameScreen';

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  const params = new URLSearchParams(location.search);
  const preview = previewResult(params.get('preview') ?? '');
  initNotify(location.search, preview !== null);

  const showIntro = (): void => {
    const start = h('button', 'btn yes big', 'Kezdjük');
    start.type = 'button';
    start.addEventListener('click', () => {
      notifyStarted();
      mountGame(app, {
        onEnd(state, moves) {
          const result = state.result;
          if (!result) return;
          notifyEnded(result.winner, moves);
          setTimeout(() => mountEnd(app, result), 1200);
        },
      });
    });
    app.replaceChildren(
      h('main', 'screen intro', undefined, h('div', 'card', undefined, h('p', 'intro-text', INTRO_TEXT), start)),
    );
  };

  if (preview) {
    mountEnd(app, preview);
  } else {
    notifyOpened();
    retryPending();
    showIntro();
  }
}
