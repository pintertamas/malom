export function parseDevice(ua: string): string {
  let os = 'Ismeretlen eszkoz';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'Mac';
  else if (/Linux|X11/i.test(ua)) os = 'Linux';

  let browser = 'ismeretlen bongeszo';
  if (/EdgA?\/|Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
  else if (/FxiOS|Firefox/.test(ua)) browser = 'Firefox';
  else if (/CriOS|Chrome/.test(ua)) browser = 'Chrome';
  else if (/Safari/.test(ua)) browser = 'Safari';
  return `${os} / ${browser}`;
}

export const ENIKO_TOKEN = '50b337824ed8';

export function identityLabel(search: string): string {
  const e = new URLSearchParams(search).get('e');
  return e === ENIKO_TOKEN ? 'ENIKO linkje' : 'NEM Eniko linkje (te teszteled?)';
}
