import { MOTION, Scope, makePetals, makeRoses, prefersReducedMotion } from './motion';

/** Rose and petal rain with depth (size, blur, speed, sway, rotation). Cleans itself up. */
export function startRoseRain(scope: Scope): void {
  const layer = scope.track(document.createElement('div'));
  layer.className = 'rain';
  layer.setAttribute('aria-hidden', 'true');

  if (prefersReducedMotion()) {
    for (let i = 0; i < 6; i++) {
      const r = document.createElement('span');
      r.className = 'rose static';
      r.textContent = '🌹';
      r.style.left = `${8 + i * 16}%`;
      r.style.top = `${10 + ((i * 37) % 30)}%`;
      layer.append(r);
    }
    document.body.append(layer);
    scope.timeout(() => layer.remove(), MOTION.rainCleanupMs);
    return;
  }

  // Far to near, so near roses paint on top.
  const roses = makeRoses(MOTION.roseCount, Math.random).sort((a, b) => a.depth - b.depth);
  for (const spec of roses) {
    const fall = document.createElement('span');
    fall.className = 'rose';
    const sway = document.createElement('span');
    sway.className = 'sway';
    sway.textContent = '🌹';
    fall.style.left = `${spec.left}%`;
    fall.style.fontSize = `${spec.size}px`;
    fall.style.opacity = String(spec.opacity);
    if (spec.blur > 0) fall.style.filter = `blur(${spec.blur}px)`;
    fall.style.animationDuration = `${spec.dur}s`;
    fall.style.animationDelay = `${spec.delay}s`;
    sway.style.setProperty('--sway', `${spec.sway}px`);
    sway.style.setProperty('--spin', `${spec.spin}deg`);
    sway.style.animationDuration = `${spec.swayDur}s`;
    fall.append(sway);
    layer.append(fall);
  }
  for (const spec of makePetals(MOTION.petalCount, Math.random)) {
    const fall = document.createElement('span');
    fall.className = 'rose petal-wrap';
    const petal = document.createElement('span');
    petal.className = 'petal';
    fall.style.left = `${spec.left}%`;
    fall.style.animationDuration = `${spec.dur}s`;
    fall.style.animationDelay = `${spec.delay}s`;
    petal.style.width = `${spec.size}px`;
    petal.style.height = `${spec.size * 1.3}px`;
    petal.style.background = `linear-gradient(135deg, hsl(${spec.hue} 80% 68%), hsl(${spec.hue} 70% 42%))`;
    petal.style.setProperty('--sway', `${spec.sway}px`);
    petal.style.animationDuration = `${spec.swayDur}s`;
    fall.append(petal);
    layer.append(fall);
  }
  document.body.append(layer);
  scope.timeout(() => layer.remove(), MOTION.rainCleanupMs);
}
