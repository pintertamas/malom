import { AiClient } from '../ai';
import { applyMove, legalMoves, newGame } from '../rules';
import type { GameState, Move, Player } from '../rules';
import { BoardView, completeMills } from './boardView';
import { statusText } from './copy';
import { delay, h } from './dom';

export interface GameHooks {
  onEnd(state: GameState, moves: number): void;
}

function counters(label: string, cls: string): { el: HTMLElement; set(toPlace: number, onBoard: number): void } {
  const text = h('span', 'count-text');
  const el = h('div', 'counter', undefined, h('span', `chip ${cls}`), h('strong', undefined, label), text);
  return {
    el,
    set(toPlace, onBoard) {
      text.textContent = `lerakandó: ${toPlace} · táblán: ${onBoard}`;
    },
  };
}

export function mountGame(root: HTMLElement, hooks: GameHooks): void {
  const ai = new AiClient();
  const board = new BoardView();
  const status = h('p', 'status');
  status.setAttribute('aria-live', 'polite');
  const top = counters('Én', 'dark');
  const bottom = counters('Te', 'white');
  const screen = h('main', 'screen game', undefined, top.el, status, h('div', 'board-wrap', undefined, board.el), bottom.el);
  root.replaceChildren(screen);

  let state = newGame();
  let selected: number | null = null;
  let busy = false;
  let thinking = false;
  let over = false;
  let moveCount = 0;
  let knownMills = new Set<string>();
  board.syncBoard(state.board);

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
    status.textContent = statusText(state, thinking);
    top.set(state.toPlace[1], state.onBoard[1]);
    bottom.set(state.toPlace[0], state.onBoard[0]);
  }

  function play(move: Move): void {
    const player: Player = state.turn;
    state = applyMove(state, move);
    board.animate(move, player);
    if (move.type !== 'remove') moveCount++;
    selected = null;
    if (state.result && !over) {
      over = true;
      refresh();
      hooks.onEnd(state, moveCount);
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
      const pace = delay(500 + Math.random() * 300);
      let move: Move | undefined;
      try {
        move = await ai.choose(state);
        applyMove(state, move); // validate; throws if illegal
      } catch {
        const all = legalMoves(state);
        move = all[Math.floor(Math.random() * all.length)];
      }
      await pace;
      if (!move) break;
      play(move);
    }
    busy = false;
    thinking = false;
    refresh();
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
}
