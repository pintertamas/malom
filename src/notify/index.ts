import { identityLabel, parseDevice } from './device';

export { identityLabel, parseDevice } from './device';

export const NTFY_TOPIC = 'malom-515a8047400b3701d64b';
const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`;
const PENDING_KEY = 'malom.pendingHandle';

export const session = {
  preview: false,
  dodgeCount: 0,
  resultText: 'nincs meg vege',
  label: 'NEM Eniko linkje (te teszteled?)',
};

export function initNotify(search: string, preview: boolean): void {
  session.label = identityLabel(search);
  session.preview = preview;
}

function ascii(s: string): string {
  return s.replace(/[^\x20-\x7e]/g, '');
}

function footer(): string {
  let time = '';
  try {
    time = new Intl.DateTimeFormat('hu-HU', {
      timeZone: 'Europe/Budapest',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date());
  } catch {
    time = new Date().toISOString();
  }
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const width = typeof window === 'undefined' ? '?' : String(window.screen.width || window.innerWidth);
  return `${session.label}\nIdo: ${time} (Budapest)\nEszkoz: ${parseDevice(ua)}\nKepernyo: ${width}px`;
}

async function post(title: string, text: string, priority: 3 | 4 | 5, tags: string): Promise<boolean> {
  if (session.preview) return true;
  try {
    const res = await fetch(NTFY_URL, {
      method: 'POST',
      body: `${text}\n\n${footer()}`,
      headers: { Title: ascii(title), Priority: String(priority), Tags: ascii(tags) },
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function notifyOpened(): void {
  void post('Malom: megnyitva', 'Megnyitotta az oldalt.', 3, 'eyes');
}
export function notifyStarted(): void {
  void post('Malom: jatek indult', 'Elindult a jatek.', 3, 'video_game');
}
export function notifyEnded(winner: 0 | 1 | 'draw', moves: number): void {
  const who = winner === 'draw' ? 'Dontetlen' : winner === 0 ? 'Eniko nyert' : 'Az AI nyert';
  session.resultText = who;
  void post('Malom: vege', `${who}. Lepesek: ${moves}.`, 3, winner === 0 ? 'trophy' : 'checkered_flag');
}
export function notifyIgen(): void {
  void post(
    'Malom: IGEN!',
    `Az Igen gombra nyomott! Nem-gomb probalkozasok: ${session.dodgeCount}.`,
    4,
    'tada',
  );
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
  const ok = await post(
    'Malom: INSTAGRAM',
    `Instagram: @${p.handle}\nNem-gomb probalkozasok: ${p.dodges}\nJatek eredmenye: ${p.result}`,
    5,
    'rose,sparkles',
  );
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
