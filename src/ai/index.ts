import { chooseMove, DEFAULT_OPTIONS, LEVEL_OPTIONS } from './choose';
import type { AiLevel, AiMode, AiOptions } from './choose';
import type { GameState, Move } from '../rules';

export { chooseMove, DEFAULT_OPTIONS, LEVEL_OPTIONS };
export type { AiLevel, AiMode, AiOptions };

interface Pending {
  state: GameState;
  opts: Partial<AiOptions>;
  resolve: (m: Move) => void;
  reject: (e: Error) => void;
}

/**
 * Runs the search in a Web Worker (created lazily). Where Workers are not
 * available (vitest/node) or the worker fails, it falls back to running
 * `chooseMove` on the calling thread. `terminate()` rejects outstanding requests.
 */
export class AiClient {
  private worker: Worker | null = null;
  private broken = false;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  private getWorker(): Worker | null {
    if (this.broken || typeof Worker === 'undefined') return null;
    if (this.worker) return this.worker;
    try {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: number; move?: Move; error?: string }>) => {
        const { id, move } = e.data;
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        if (move) p.resolve(move);
        else this.runLocal(p);
      };
      w.onerror = () => {
        // Worker could not load or crashed: answer everything on the main thread from now on.
        this.broken = true;
        this.worker?.terminate();
        this.worker = null;
        const waiting = [...this.pending.values()];
        this.pending.clear();
        for (const p of waiting) this.runLocal(p);
      };
      this.worker = w;
      return w;
    } catch {
      this.broken = true;
      return null;
    }
  }

  private runLocal(p: Pending): void {
    try {
      p.resolve(chooseMove(p.state, p.opts));
    } catch (err) {
      p.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }

  choose(state: GameState, opts: Partial<AiOptions> = {}): Promise<Move> {
    return new Promise<Move>((resolve, reject) => {
      const entry: Pending = { state, opts, resolve, reject };
      const w = this.getWorker();
      if (!w) {
        // Yield once so callers can render before the search blocks the thread.
        setTimeout(() => {
          this.runLocal(entry);
        }, 0);
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, entry);
      w.postMessage({ id, state, opts });
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const p of waiting) p.reject(new Error('AI terminated'));
  }
}
