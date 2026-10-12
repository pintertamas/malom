/** Normalises what the user typed into a bare Instagram handle, or null if invalid. */
export function normalizeHandle(input: string): string | null {
  let s = input.trim();
  s = s.replace(/^(https?:\/\/)?(www\.)?(m\.)?instagram\.com\//i, '');
  s = s.replace(/[?#].*$/, '');
  s = s.replace(/\/+$/, '');
  s = s.replace(/\s+/g, '');
  s = s.replace(/^@+/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(s)) return null;
  return s;
}
