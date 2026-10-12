/** Sends items strictly in order, never blocking the caller, with a cap on non-exempt items. */
export class SendQueue<T> {
  private chain: Promise<void> = Promise.resolve();
  private count = 0;

  constructor(
    private readonly send: (item: T) => Promise<unknown>,
    private readonly cap: number,
  ) {}

  /** Returns false when the item was dropped because the cap is reached. */
  enqueue(item: T, exempt = false): boolean {
    if (!exempt) {
      if (this.count >= this.cap) return false;
      this.count++;
    }
    this.chain = this.chain.then(() => this.send(item)).then(
      () => undefined,
      () => undefined,
    );
    return true;
  }
}

/** Allows at most one hidden/returned pair per `gapMs`. */
export class PairThrottle {
  private last = -Infinity;
  private open = false;

  constructor(private readonly gapMs: number) {}

  onHidden(now: number): boolean {
    if (now - this.last < this.gapMs) return false;
    this.last = now;
    this.open = true;
    return true;
  }

  onVisible(): boolean {
    if (!this.open) return false;
    this.open = false;
    return true;
  }
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m > 0 ? `${m} perc ${sec} mp` : `${sec} mp`;
}
