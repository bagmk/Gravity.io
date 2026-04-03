import { MAP_W, MAP_H, INITIAL_MASS, PALETTES, NAMES } from "./constants.js";
import { uid } from "./utils.js";

export function spawnFood() {
  return {
    id: uid(),
    x: 100 + Math.random() * (MAP_W - 200),
    y: 100 + Math.random() * (MAP_H - 200),
    vx: (Math.random() - 0.5) * 20,
    vy: (Math.random() - 0.5) * 20,
    mass: 0.8 + Math.random() * 2,
    hue: Math.random() * 360,
    pulse: Math.random() * 6.28,
  };
}

export function spawnBH(existing) {
  let x, y, ok;
  do {
    x = 400 + Math.random() * (MAP_W - 800);
    y = 400 + Math.random() * (MAP_H - 800);
    ok = true;
    for (const b of existing) {
      if (Math.sqrt((x - b.x) ** 2 + (y - b.y) ** 2) < 800) ok = false;
    }
  } while (!ok);
  return { x, y, pulse: Math.random() * 6.28, id: uid() };
}

export function spawnAI(i) {
  return {
    id: uid(),
    name: NAMES[i % NAMES.length],
    x: 300 + Math.random() * (MAP_W - 600),
    y: 300 + Math.random() * (MAP_H - 600),
    vx: 0, vy: 0,
    mass: INITIAL_MASS + Math.random() * 10,
    palette: PALETTES[(i + 1) % PALETTES.length],
    alive: true, respawn: 0,
    ai: { retarget: 0, tx: 0, ty: 0, fleeing: false },
  };
}
