const COUNT = 60;
const CLEANUP_MS = 14000;

export function startRoseRain(): void {
  const layer = document.createElement('div');
  layer.className = 'rain';
  layer.setAttribute('aria-hidden', 'true');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduce) {
    for (let i = 0; i < 6; i++) {
      const r = document.createElement('span');
      r.className = 'rose static';
      r.textContent = '🌹';
      r.style.left = `${8 + i * 16}%`;
      r.style.top = `${10 + ((i * 37) % 30)}%`;
      layer.append(r);
    }
    document.body.append(layer);
    return;
  }

  for (let i = 0; i < COUNT; i++) {
    const fall = document.createElement('span');
    fall.className = 'rose';
    const sway = document.createElement('span');
    sway.className = 'sway';
    sway.textContent = '🌹';
    fall.style.left = `${Math.random() * 100}%`;
    fall.style.fontSize = `${18 + Math.random() * 26}px`;
    fall.style.animationDuration = `${5 + Math.random() * 4}s`;
    fall.style.animationDelay = `${Math.random() * 4}s`;
    sway.style.setProperty('--sway', `${12 + Math.random() * 30}px`);
    sway.style.animationDuration = `${1.8 + Math.random() * 1.8}s`;
    fall.append(sway);
    layer.append(fall);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), CLEANUP_MS);
}
