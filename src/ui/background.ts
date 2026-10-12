import { lerp, mulberry32 } from './motion';

const DOTS = 14;

/**
 * Very slow drifting glow blobs and a few floating motes behind the app.
 * Pure CSS transform/opacity animations on ~16 elements; reduced motion freezes them.
 */
export function mountBackground(): void {
  const bg = document.createElement('div');
  bg.className = 'bg';
  bg.setAttribute('aria-hidden', 'true');
  for (const cls of ['blob a', 'blob b']) {
    const b = document.createElement('span');
    b.className = cls;
    bg.append(b);
  }
  const rng = mulberry32(20240214);
  for (let i = 0; i < DOTS; i++) {
    const d = document.createElement('span');
    d.className = 'mote';
    const size = lerp(2, 5, rng());
    d.style.left = `${rng() * 100}%`;
    d.style.width = `${size}px`;
    d.style.height = `${size}px`;
    d.style.animationDuration = `${lerp(26, 52, rng())}s`;
    d.style.animationDelay = `${-rng() * 50}s`;
    d.style.setProperty('--drift', `${lerp(-40, 40, rng())}px`);
    bg.append(d);
  }
  document.body.prepend(bg);
}
