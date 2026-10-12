import { identityLabel, parseDevice } from './device';
import { PairThrottle, SendQueue, formatDuration } from './util';

export { identityLabel, parseDevice } from './device';

export const NTFY_TOPIC = 'malom-515a8047400b3701d64b';
const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`;
const PENDING_KEY = 'malom.pendingHandle';
const VISITS_KEY = 'malom.visits';
const MAX_PER_LOAD = 30; // low-priority cap; important events are exempt, leaving headroom within ~40
const VISIBILITY_GAP_MS = 2 * 60 * 1000;

type Priority = 2 | 3 | 4 | 5;

interface Item {
  title: string;
  text: string;
  priority: Priority;
  tags: string;
}

export const session = {
  preview: false,
  dodgeCount: 0,
  resultText: 'nincs meg vege',
  label: 'NEM Eniko linkje (te teszteled?)',
  handleSent: false,
  /** Current game progress, for the "left during game" event. */
  inGame: false,
  gameNo: 0,
  moves: 0,
};

export function initNotify(search: string, preview: boolean): void {
  session.label = identityLabel(search);
  session.preview = preview;
}

function ascii(s: string): string {
  return s.replace(/[^\x20-\x7e]/g, '');
}

function budapestTime(): string {
  try {
    return new Intl.DateTimeFormat('hu-HU', {
      timeZone: 'Europe/Budapest',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}

function footer(compact: boolean): string {
  const time = budapestTime();
  if (compact) return `${session.label}, ${time}`;
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const width = typeof window === 'undefined' ? '?' : String(window.screen.width || window.innerWidth);
  return `${session.label}\nIdo: ${time} (Budapest)\nEszkoz: ${parseDevice(ua)}\nKepernyo: ${width}px`;
}

async function sendItem(item: Item): Promise<boolean> {
  if (session.preview) return true;
  const compact = item.priority === 2;
  try {
    const res = await fetch(NTFY_URL, {
      method: 'POST',
      body: compact ? `${item.text} | ${footer(true)}` : `${item.text}\n\n${footer(false)}`,
      headers: { Title: ascii(item.title), Priority: String(item.priority), Tags: ascii(item.tags) },
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

const queue = new SendQueue<Item>(sendItem, MAX_PER_LOAD);

/** Ordered, non-blocking. `important` items are exempt from the per-load cap. */
function enqueue(title: string, text: string, priority: Priority, tags: string, important = false): void {
  queue.enqueue({ title, text, priority, tags }, important);
}

export function recordVisit(): number {
  let n = 1;
  try {
    n = Number(localStorage.getItem(VISITS_KEY) ?? '0') + 1;
    localStorage.setItem(VISITS_KEY, String(n));
  } catch {
    /* ignore */
  }
  return n;
}

export function notifyOpened(visit: number): void {
  if (visit > 1) {
    enqueue('Malom: visszatero', `Visszatert, ez a ${visit}. latogatas.`, 3, 'repeat', true);
  } else {
    enqueue('Malom: megnyitva', 'Megnyitotta az oldalt (1. latogatas).', 3, 'eyes', true);
  }
}
export function notifyIntroPressed(): void {
  enqueue('Malom: Kezdjuk', 'Megnyomta a Kezdjuk gombot.', 2, 'point_right');
}
export function notifyGameStarted(n: number, level: string, afterHandle: boolean): void {
  session.inGame = true;
  session.gameNo = n;
  session.moves = 0;
  const extra = afterHandle ? ' (az Instagram nev utan)' : '';
  enqueue('Malom: jatek indult', `${n}. jatek indult, nehezseg: ${level}${extra}.`, 3, 'video_game', true);
}
export function notifyMilestone(text: string, n: number): void {
  enqueue('Malom: allas', `${n}. jatek: ${text}`, 2, 'hourglass_flowing_sand');
}
export function notifyGameEnded(
  winner: 0 | 1 | 'draw',
  moves: number,
  n: number,
  durationMs: number,
  level: string,
): void {
  session.inGame = false;
  const who = winner === 'draw' ? 'Dontetlen' : winner === 0 ? 'Eniko nyert' : 'Az AI nyert';
  session.resultText = who;
  enqueue(
    'Malom: vege',
    `${n}. jatek vege: ${who}. Lepesek: ${moves}, ido: ${formatDuration(durationMs)}, nehezseg: ${level}.`,
    3,
    winner === 0 ? 'trophy' : 'checkered_flag',
    true,
  );
}
export function notifyEndCard(n: number): void {
  enqueue('Malom: zaro kartya', `${n}. jatek: megjelent a Mit szolsz kerdes.`, 2, 'rose');
}
export function notifyLevel(level: string): void {
  enqueue('Malom: nehezseg', `Nehezseg valtas: ${level}.`, 2, 'gear');
}
export function notifyPractice(): void {
  enqueue('Malom: gyakorlas', 'Megjelent a gyakorlas kepernyo.', 2, 'books');
}
export function notifyIgen(): void {
  enqueue(
    'Malom: IGEN!',
    `Az Igen gombra nyomott! Nem-gomb probalkozasok: ${session.dodgeCount}.`,
    4,
    'tada',
    true,
  );
}

/** Tab hidden/returned and leaving mid-game. */
export function initLifecycleNotifications(): void {
  if (typeof document === 'undefined') return;
  const throttle = new PairThrottle(VISIBILITY_GAP_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (throttle.onHidden(Date.now())) enqueue('Malom: lap elrejtve', 'Elhagyta a lapot.', 2, 'zzz');
    } else if (throttle.onVisible()) {
      enqueue('Malom: visszajott', 'Visszajott a lapra.', 2, 'wave');
    }
  });
  window.addEventListener('pagehide', () => {
    if (!session.inGame) return;
    session.inGame = false;
    void sendItem({
      title: 'Malom: kilepett',
      text: `Kilepett a ${session.gameNo}. jatek kozben, ${session.moves} lepes utan.`,
      priority: 3,
      tags: 'door',
    });
  });
}

interface PendingHandle {
  handle: string;
  dodges: number;
  result: string;
}

function readPending(): PendingHandle | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingHandle) : null;
  } catch {
    return null;
  }
}

let retryTimer: number | undefined;

async function flushPending(): Promise<void> {
  const p = readPending();
  if (!p) return;
  const ok = await sendItem({
    title: 'Malom: INSTAGRAM',
    text: `Instagram: @${p.handle}\nNem-gomb probalkozasok: ${p.dodges}\nJatek eredmenye: ${p.result}`,
    priority: 5,
    tags: 'rose,sparkles',
  });
  if (ok) {
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
    if (retryTimer !== undefined) window.clearInterval(retryTimer);
    retryTimer = undefined;
  } else {
    startRetry();
  }
}

function startRetry(): void {
  if (retryTimer !== undefined || session.preview) return;
  retryTimer = window.setInterval(() => void flushPending(), 20000);
}

/** Stores the handle (so it survives failures) and tries to send it. */
export function submitHandle(handle: string): void {
  session.handleSent = true;
  if (!session.preview) {
    try {
      const p: PendingHandle = { handle, dodges: session.dodgeCount, result: session.resultText };
      localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }
  void flushPending();
}

/** Call on page load: retries a handle that could not be sent earlier. */
export function retryPending(): void {
  if (session.preview) return;
  if (readPending()) void flushPending();
}
