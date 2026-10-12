import { AiClient } from '../ai';
import { notifyMilestone, session } from '../notify';
import { applyMove, legalMoves, newGame } from '../rules';
import type { GameState, Move, Player } from '../rules';
import { aiOptionsFor } from './aiLevel';
import { BoardView, completeMills } from './boardView';
import { statusText } from './copy';
import { delay, h } from './dom';
import { swapScreen } from './fx';
import { getLevel, levelSelector } from './level';
import { MilestoneTracker, milestoneText } from './milestones';
import { EASE, MOTION, Scope } from './motion';

export interface GameHooks {
  gameNo: number;
  onEnd(state: GameState, moves: number, durationMs: number): void;
  onNew(): void;
}

function counters(
  label: string,
  cls: string,
): { el: HTMLElement; set(toPlace: number, onBoard: number): void; active(on: boolean): void } {
  const text = h('span', 'count-text');
  const el = h('div', 'counter', undefined, h('span', `chip ${cls}`), h('strong', undefined, label), text);
  return {
    el,
    set(toPlace, onBoard) {
      text.textContent = `lerakandó: ${toPlace} · táblán: ${onBoard}`;
    },
    active(on) {
      el.classList.toggle('active', on);
    },
  };
}

export function mountGame(root: HTMLElement, hooks: GameHooks): { destroy(): void } {
  const ai = new AiClient();
  const board = new BoardView();
  const scope = new Scope();
  const statusLabel = h('span', 'status-text');
  const dots = h('span', 'dots', undefined, h('i'), h('i'), h('i'));
  dots.setAttribute('aria-hidden', 'true');
  const status = h('p', 'status', undefined, statusLabel, dots);
  status.setAttribute('aria-live', 'polite');
  const top = counters('Én', 'dark');
  const bottom = counters('Te', 'white');
  const newBtn = h('button', 'btn-small', 'Új játék');
  newBtn.type = 'button';
  const header = h('div', 'game-header', undefined, levelSelector(), newBtn);
  const screen = h(
    'main',
    'screen game',
    undefined,
    header,
    top.el,
    status,
    h('div', 'board-wrap', undefined, board.el),
    bottom.el,
  );
  swapScreen(root, screen);
  board.playIntro(120);

  let state = newGame();
  let selected: number | null = null;
  let busy = false;
  let thinking = false;
  let over = false;
  let moveCount = 0;
  let knownMills = new Set<string>();
  const tracker = new MilestoneTracker();
  const startedAt = Date.now();
  board.syncBoard(state.board);

  newBtn.addEventListener('click', () => {
    if (!over && moveCount > 0 && !window.confirm('Biztos új játékot kezdesz?')) return;
    destroy();
    hooks.onNew();
  });

  function destroy(): void {
    over = true;
    ai.terminate();
    board.destroy();
    scope.dispose();
  }

  let lastStatus = '';
  function setStatus(text: string): void {
    if (text === lastStatus) return;
    const first = lastStatus === '';
    lastStatus = text;
    statusLabel.textContent = text;
    if (first) return;
    scope.play(
      statusLabel,
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: MOTION.statusFadeMs, easing: EASE.out },
    );
  }

  function refresh(): void {
    const legal = !busy && !over && state.turn === 0 ? legalMoves(state) : [];
    const selectable = new Set<number>();
    const targets = new Set<number>();
    const removable = new Set<number>();
    for (const m of legal) {
      if (m.type === 'remove') removable.add(m.at);
      else if (m.type === 'place') targets.add(m.to);
      else {
        selectable.add(m.from);
        if (m.from === selected) targets.add(m.to);
      }
    }
    const mills = completeMills(state.board).map((points) => ({
      points,
      fresh: !knownMills.has(points.join('-')),
    }));
    knownMills = new Set(mills.map((m) => m.points.join('-')));
    board.update({ selectable, selected, targets, removable, mills });
    setStatus(statusText(state, thinking));
    status.classList.toggle('thinking', !over && (thinking || state.turn === 1));
    top.active(!over && state.turn === 1);
    bottom.active(!over && state.turn === 0);
    top.set(state.toPlace[1], state.onBoard[1]);
    bottom.set(state.toPlace[0], state.onBoard[0]);
  }

  function play(move: Move): void {
    const player: Player = state.turn;
    state = applyMove(state, move);
    board.animate(move, player);
    if (move.type !== 'remove') moveCount++;
    session.moves = moveCount;
    for (const key of tracker.onMove(player, move, state)) {
      notifyMilestone(milestoneText(key), hooks.gameNo);
    }
    selected = null;
    if (state.result && !over) {
      over = true;
      refresh();
      hooks.onEnd(state, moveCount, Date.now() - startedAt);
      ai.terminate();
      return;
    }
    refresh();
  }

  async function runAi(): Promise<void> {
    busy = true;
    thinking = true;
    refresh();
    while (!over && state.turn === 1) {
      const pace = delay(MOTION.aiPaceMinMs + Math.random() * MOTION.aiPaceJitterMs);
      let move: Move | undefined;
      try {
        move = await ai.choose(state, aiOptionsFor(getLevel()));
        applyMove(state, move); // validate; throws if illegal
      } catch {
        const all = legalMoves(state);
        move = all[Math.floor(Math.random() * all.length)];
      }
      await pace;
      // Let the previous animation (landing, mill celebration, capture) finish first.
      const wait = board.remaining();
      if (wait > 0) await delay(wait);
      if (!move || over) break;
      play(move);
    }
    busy = false;
    thinking = false;
    if (!over) refresh();
  }

  board.setHandler((p) => {
    if (busy || over || state.turn !== 0) return;
    const legal = legalMoves(state);
    if (state.pendingRemoval) {
      const m = legal.find((x) => x.type === 'remove' && x.at === p);
      if (m) afterHuman(m);
      return;
    }
    if (state.toPlace[0] > 0) {
      const m = legal.find((x) => x.type === 'place' && x.to === p);
      if (m) afterHuman(m);
      return;
    }
    if (selected !== null) {
      const from = selected;
      const m = legal.find((x) => x.type === 'move' && x.from === from && x.to === p);
      if (m) {
        afterHuman(m);
        return;
      }
    }
    const canSelect = legal.some((x) => x.type === 'move' && x.from === p);
    selected = canSelect && selected !== p ? p : null;
    refresh();
  });

  function afterHuman(m: Move): void {
    play(m);
    if (!over && state.turn === 1) void runAi();
  }

  refresh();
  return { destroy };
}
