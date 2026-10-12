const KEY = 'malom.handleSubmitted';

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function store(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** True once she has submitted her Instagram handle in this browser. */
export function handleSubmitted(storage: StorageLike | null = store()): boolean {
  try {
    return storage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markHandleSubmitted(storage: StorageLike | null = store()): void {
  try {
    storage?.setItem(KEY, '1');
  } catch {
    /* ignore */
  }
}

/** The Igen/Nem date question is shown after every game until the handle was submitted. */
export function shouldAskDate(storage: StorageLike | null = store()): boolean {
  return !handleSubmitted(storage);
}
