import {
  MAP_W, MAP_H, INITIAL_MASS, FOOD_G, BH_LJ_EQ, BH_LJ_STR, BH_KILL_R,
  ABSORB_RATIO, BOOST_MULT, BOOST_COST, DECAY_RATE, PALETTES, NAMES,
} from "./constants.js";
import { mr, uid, wrapDx, wrapDy, di, wrapPos } from "./utils.js";
import { spawnFood } from "./spawners.js";

// Returns true if player died this tick
export function updatePhysics(S, dt, W, H, cfg, setDead) {
  const P = S.p;
  let playerDied = false;

  // Save velocity before physics to compute acceleration
  const prevVx = P.vx, prevVy = P.vy;

  const wells = [];
  if (P.alive) wells.push(P);
  for (const a of S.ais) if (a.alive) wells.push(a);

  // --- Well-well gravity ---
  for (let i = 0; i < wells.length; i++) {
    for (let j = i + 1; j < wells.length; j++) {
      const a = wells[i], b = wells[j];
      const dx = wrapDx(a.x, b.x), dy = wrapDy(a.y, b.y);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;
      const minD = Math.max(dist, mr(a.mass) + mr(b.mass));
      const F = cfg.wellG * a.mass * b.mass / (minD * minD);
      const fx = (dx / dist) * F * dt;
      const fy = (dy / dist) * F * dt;
      a.vx += fx / a.mass; a.vy += fy / a.mass;
      b.vx -= fx / b.mass; b.vy -= fy / b.mass;
    }
  }

  // --- Black hole effects on wells (attract + kill) ---
  for (const bh of S.bhs) {
    for (const w of wells) {
      const dx = wrapDx(w.x, bh.x), dy = wrapDy(w.y, bh.y);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;
      const F = cfg.wellG * cfg.bhMass / (Math.max(dist, 60) ** 2);
      w.vx += (dx / dist) * F * dt;
      w.vy += (dy / dist) * F * dt;

      if (dist < BH_KILL_R) {
        const fragCount = Math.min(Math.floor(w.mass * 0.8), 40);
        const fragMass = w.mass / fragCount * 0.5;
        for (let k = 0; k < fragCount; k++) {
          const angle = (k / fragCount) * Math.PI * 2 + Math.random() * 0.5;
          const spd = 150 + Math.random() * 300;
          S.foods.push({
            id: uid(), x: w.x, y: w.y,
            vx: Math.cos(angle) * spd + w.vx * 0.3,
            vy: Math.sin(angle) * spd + w.vy * 0.3,
            mass: fragMass, hue: Math.random() * 360, pulse: Math.random() * 6.28,
          });
        }
        for (let k = 0; k < 15; k++) S.fx.push({ x: w.x, y: w.y, vx: (Math.random() - 0.5) * 500, vy: (Math.random() - 0.5) * 500, life: 1, color: w.palette[0] });

        if (w === P) {
          // White hole: warp to a different BH
          const others = S.bhs.filter(b => b !== bh);
          const exit = others[Math.floor(Math.random() * others.length)] || bh;
          const ejectAngle = Math.random() * Math.PI * 2;
          const ejectDist = BH_KILL_R * 3;
          P.x = exit.x + Math.cos(ejectAngle) * ejectDist;
          P.y = exit.y + Math.sin(ejectAngle) * ejectDist;
          P.vx = Math.cos(ejectAngle) * 400;
          P.vy = Math.sin(ejectAngle) * 400;
          P.mass = INITIAL_MASS;
          wrapPos(P);
          for (let k = 0; k < 12; k++) S.fx.push({ x: P.x, y: P.y, vx: (Math.random() - 0.5) * 400, vy: (Math.random() - 0.5) * 400, life: 0.8, color: "#b197fc" });
        } else {
          w.alive = false; w.respawn = 0.5;
        }
      }
    }
  }

  // --- Black hole LJ on food (attract far, repel close → food orbits BH) ---
  for (const bh of S.bhs) {
    for (const f of S.foods) {
      const dx = wrapDx(f.x, bh.x), dy = wrapDy(f.y, bh.y);
      const dSq = dx * dx + dy * dy;
      if (dSq < 4 || dSq > 640000) continue;
      const dist = Math.sqrt(dSq);
      const r = dist / BH_LJ_EQ;
      const ljF = BH_LJ_STR * (1 / (r * r) - 1 / (r * r * r * r)) / (BH_LJ_EQ * BH_LJ_EQ);
      f.vx += (dx / dist) * ljF * dt;
      f.vy += (dy / dist) * ljF * dt;
    }
  }

  // --- Food-food attraction (spatial grid) ---
  const gridSize = 80;
  const gridCols = Math.ceil(MAP_W / gridSize) + 1;
  const foodGrid = new Map();
  for (let fi = 0; fi < S.foods.length; fi++) {
    const f = S.foods[fi];
    const gx = ((Math.floor(f.x / gridSize) % gridCols) + gridCols) % gridCols;
    const gy = ((Math.floor(f.y / gridSize) % gridCols) + gridCols) % gridCols;
    const key = gx + gy * gridCols;
    if (!foodGrid.has(key)) foodGrid.set(key, []);
    foodGrid.get(key).push(fi);
  }
  const ffG = cfg.foodG;
  const maxFFDistSq = 6000;
  for (let fi = 0; fi < S.foods.length; fi += 2) {
    const f = S.foods[fi];
    const gx = ((Math.floor(f.x / gridSize) % gridCols) + gridCols) % gridCols;
    const gy = ((Math.floor(f.y / gridSize) % gridCols) + gridCols) % gridCols;
    for (let nx = gx - 1; nx <= gx + 1; nx++) {
      for (let ny = gy - 1; ny <= gy + 1; ny++) {
        const wnx = ((nx % gridCols) + gridCols) % gridCols;
        const wny = ((ny % gridCols) + gridCols) % gridCols;
        const cell = foodGrid.get(wnx + wny * gridCols);
        if (!cell) continue;
        for (const fj of cell) {
          if (fj <= fi) continue;
          const g = S.foods[fj];
          const dx = wrapDx(f.x, g.x), dy = wrapDy(f.y, g.y);
          const distSq = dx * dx + dy * dy;
          if (distSq < 4 || distSq > maxFFDistSq) continue;
          const force = ffG / distSq;
          const invDist = 1 / Math.sqrt(distSq);
          const fx = dx * invDist * force * dt;
          const fy = dy * invDist * force * dt;
          f.vx += fx; f.vy += fy;
          g.vx -= fx; g.vy -= fy;
        }
      }
    }
  }

  // --- Player thrust ---
  if (P.alive) {
    const mx = S.mouse.x - W / 2, my = S.mouse.y - H / 2;
    const md = Math.sqrt(mx * mx + my * my);
    const boosting = S.keys["Space"] || S.keys["ShiftLeft"] || S.keys["ShiftRight"];
    if (md > 8) {
      const thr = cfg.thrust * (boosting ? BOOST_MULT : 1) / (1 + P.mass * 0.008);
      const fac = Math.min(md / 120, 1);
      P.vx += (mx / md) * thr * fac * dt;
      P.vy += (my / md) * thr * fac * dt;
    }
    if (boosting && P.mass > INITIAL_MASS * 0.5) {
      P.mass -= BOOST_COST * P.mass * dt;
      S.fx.push({ x: P.x, y: P.y, vx: (Math.random() - 0.5) * 60 - P.vx * 0.3, vy: (Math.random() - 0.5) * 60 - P.vy * 0.3, life: 0.4, color: P.palette[0] });
    }
    P.vx *= (1 - cfg.drag * dt); P.vy *= (1 - cfg.drag * dt);
    P.x += P.vx * dt; P.y += P.vy * dt;
    wrapPos(P);
  }

  // --- AI ---
  for (const a of S.ais) {
    if (!a.alive) {
      a.respawn -= dt;
      if (a.respawn <= 0) {
        a.alive = true;
        a.x = 300 + Math.random() * (MAP_W - 600);
        a.y = 300 + Math.random() * (MAP_H - 600);
        a.mass = INITIAL_MASS + Math.random() * 5;
        a.vx = 0; a.vy = 0;
        a.name = NAMES[Math.floor(Math.random() * NAMES.length)];
        a.palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
      }
      continue;
    }
    const ai = a.ai;
    ai.retarget -= dt;
    if (ai.retarget <= 0) {
      ai.retarget = 1.5 + Math.random() * 2;
      ai.fleeing = false;
      let flX = 0, flY = 0, flee = false;
      for (const w of wells) {
        if (w === a) continue;
        const d = di(a, w);
        if (w.mass > a.mass * 1.1 && d < Math.sqrt(w.mass) * 40) {
          flee = true; const f = 1 - d / (Math.sqrt(w.mass) * 40);
          flX += (a.x - w.x) * f; flY += (a.y - w.y) * f;
        } else if (a.mass > w.mass * ABSORB_RATIO + 3 && d < Math.sqrt(a.mass) * 30) {
          ai.tx = w.x; ai.ty = w.y; ai.retarget = 0.3;
        }
      }
      for (const bh of S.bhs) {
        const d = di(a, bh);
        if (d < 400) { flee = true; flX += (a.x - bh.x) * 2; flY += (a.y - bh.y) * 2; }
      }
      if (flee) {
        const fd = Math.sqrt(flX * flX + flY * flY) || 1;
        ai.tx = a.x + (flX / fd) * 600; ai.ty = a.y + (flY / fd) * 600;
        ai.retarget = 0.8; ai.fleeing = true;
      } else {
        let best = Infinity;
        for (const f of S.foods) { const d = di(a, f); if (d < best) { best = d; ai.tx = f.x; ai.ty = f.y; } }
      }
    }
    const dx = wrapDx(a.x, ai.tx), dy = wrapDy(a.y, ai.ty), dd = Math.sqrt(dx * dx + dy * dy);
    if (dd > 5) {
      const boost = ai.fleeing && a.mass > INITIAL_MASS * 0.6;
      const thr = (cfg.thrust * 0.85) * (boost ? BOOST_MULT * 0.7 : 1) / (1 + a.mass * 0.008);
      a.vx += (dx / dd) * thr * dt; a.vy += (dy / dd) * thr * dt;
      if (boost) a.mass -= BOOST_COST * 0.5 * a.mass * dt;
    }
    a.vx *= (1 - cfg.drag * dt); a.vy *= (1 - cfg.drag * dt);
    a.x += a.vx * dt; a.y += a.vy * dt;
    wrapPos(a);
  }

  // --- Food pulled by wells ---
  for (const f of S.foods) {
    for (const w of wells) {
      const dx = wrapDx(f.x, w.x), dy = wrapDy(f.y, w.y);
      const dSq = dx * dx + dy * dy;
      const pullR = mr(w.mass) * 10;
      if (dSq > pullR * pullR || dSq < 4) continue;
      const dist = Math.sqrt(dSq);
      const force = FOOD_G * w.mass / dSq;
      f.vx += (dx / dist) * force * dt; f.vy += (dy / dist) * force * dt;
    }
    f.vx *= (1 - cfg.drag * dt); f.vy *= (1 - cfg.drag * dt);
    f.x += f.vx * dt; f.y += f.vy * dt;
    wrapPos(f);
  }

  // --- Absorption ---
  for (const w of wells) {
    const wr = mr(w.mass);
    for (let i = S.foods.length - 1; i >= 0; i--) {
      if (di(w, S.foods[i]) < wr) {
        w.mass += S.foods[i].mass * 0.7;
        S.fx.push({ x: S.foods[i].x, y: S.foods[i].y, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80, life: 0.25, hue: S.foods[i].hue });
        S.foods.splice(i, 1);
      }
    }
  }
  for (const bh of S.bhs) {
    for (let i = S.foods.length - 1; i >= 0; i--) {
      if (di(bh, S.foods[i]) < BH_KILL_R * 0.7) {
        S.fx.push({ x: S.foods[i].x, y: S.foods[i].y, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50, life: 0.2, hue: S.foods[i].hue });
        S.foods.splice(i, 1);
      }
    }
  }

  // --- Well eats well ---
  const killW = (v, k) => {
    k.mass += v.mass * 0.4;
    v.alive = false; v.respawn = 1 + Math.random() * 2;
    for (let i = 0; i < 10; i++) S.fx.push({ x: v.x, y: v.y, vx: (Math.random() - 0.5) * 250, vy: (Math.random() - 0.5) * 250, life: 0.7, color: v.palette[0] });
  };
  if (P.alive) {
    for (const a of S.ais) {
      if (!a.alive) continue;
      const d = di(P, a);
      if (d < mr(P.mass) * 0.8 && a.mass < P.mass * ABSORB_RATIO) killW(a, P);
      else if (d < mr(a.mass) * 0.8 && P.mass < a.mass * ABSORB_RATIO) {
        a.mass += P.mass * 0.4; P.alive = false; playerDied = true;
        for (let k = 0; k < 15; k++) S.fx.push({ x: P.x, y: P.y, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300, life: 1, color: P.palette[0] });
      }
    }
  }
  for (let i = 0; i < S.ais.length; i++) for (let j = i + 1; j < S.ais.length; j++) {
    const a = S.ais[i], b = S.ais[j];
    if (!a.alive || !b.alive) continue;
    const d = di(a, b);
    if (a.mass > b.mass && d < mr(a.mass) * 0.8 && b.mass < a.mass * ABSORB_RATIO) killW(b, a);
    else if (b.mass > a.mass && d < mr(b.mass) * 0.8 && a.mass < b.mass * ABSORB_RATIO) killW(a, b);
  }

  // --- Replenish food ---
  const spawnRate = 8;
  const toSpawn = Math.min(
    Math.floor(spawnRate * dt + (Math.random() < (spawnRate * dt % 1) ? 1 : 0)),
    cfg.foodCount - S.foods.length
  );
  for (let i = 0; i < toSpawn; i++) S.foods.push(spawnFood());
  while (S.foods.length < cfg.foodCount * 0.7) S.foods.push(spawnFood());

  // --- Mass decay ---
  for (const w of wells) if (w.mass > INITIAL_MASS) w.mass -= w.mass * DECAY_RATE * dt;

  // --- FX particles ---
  for (let i = S.fx.length - 1; i >= 0; i--) {
    const p = S.fx[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.life <= 0) S.fx.splice(i, 1);
  }

  // Acceleration magnitude this tick
  P.accel = Math.sqrt((P.vx - prevVx) ** 2 + (P.vy - prevVy) ** 2) / dt;

  return playerDied;
}
