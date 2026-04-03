import { MAP_W, MAP_H, SLINGSHOT_R, ORBIT_TIME_REQ } from "./constants.js";
import { mr, uid, wrapDx, wrapDy, di, wrapPos } from "./utils.js";

export function initFeatures(S) {
  S.comets       = [];
  S.cometTimer   = 30 + Math.random() * 20;
  S.cometAlert   = null;
  S.cometAbsorbed = null;
  S.bhProx       = {};           // slingshot proximity records per BH id
  S.slingshotBonuses = [];       // floating bonus popups
  S.orbitState   = { bhId: null, time: 0, active: false, lastLz: 0 };
}

// ─── SLINGSHOT ────────────────────────────────────────────────────────────────
function updateSlingshot(S, P, dt) {
  if (!P.alive) return;

  for (const bh of S.bhs) {
    if (!S.bhProx[bh.id]) {
      S.bhProx[bh.id] = { inside: false, entrySpeed: 0, entryAngle: 0, minDist: Infinity };
    }
    const rec = S.bhProx[bh.id];
    const dist = di(P, bh);

    if (dist < SLINGSHOT_R) {
      if (!rec.inside) {
        rec.inside     = true;
        rec.entrySpeed = Math.sqrt(P.vx ** 2 + P.vy ** 2);
        rec.entryAngle = Math.atan2(P.vy, P.vx);
        rec.minDist    = dist;
      }
      rec.minDist = Math.min(rec.minDist, dist);
    } else if (rec.inside) {
      rec.inside = false;
      const exitSpeed = Math.sqrt(P.vx ** 2 + P.vy ** 2);
      const gain      = exitSpeed - rec.entrySpeed;
      const exitAngle = Math.atan2(P.vy, P.vx);
      let da = Math.abs(exitAngle - rec.entryAngle);
      if (da > Math.PI) da = 2 * Math.PI - da;

      if (gain > 60 && da > 0.4) {
        const closeness = Math.max(0, 1 - rec.minDist / SLINGSHOT_R);
        const bonus     = Math.floor(gain * P.mass * (0.3 + closeness * 0.7) * 0.08);
        if (bonus > 10) {
          S.slingshotBonuses.push({ x: P.x, y: P.y, value: bonus, life: 2.5 });
          S.stats.slingshotTotal += bonus;
        }
      }
      rec.minDist = Infinity;
    }
  }

  // Age bonus popups (world-space Y drift upward)
  for (let i = S.slingshotBonuses.length - 1; i >= 0; i--) {
    const b = S.slingshotBonuses[i];
    b.y   -= 40 * dt;
    b.life -= dt;
    if (b.life <= 0) S.slingshotBonuses.splice(i, 1);
  }
}

// ─── ORBIT ────────────────────────────────────────────────────────────────────
function updateOrbit(S, P, dt) {
  if (!P.alive) { S.orbitState.active = false; return; }
  const OS = S.orbitState;

  let foundOrbit = false;
  for (const bh of S.bhs) {
    const rx   = wrapDx(bh.x, P.x);   // P - BH  (vector BH→P)
    const ry   = wrapDy(bh.y, P.y);
    const dist = Math.sqrt(rx * rx + ry * ry);
    if (dist < 90 || dist > 800) continue;

    const Lz = rx * P.vy - ry * P.vx;          // angular momentum z
    const vr = (rx * P.vx + ry * P.vy) / dist; // radial speed
    const vt = Lz / dist;                       // tangential speed

    if (Math.abs(vt) > 60 && Math.abs(vt) > Math.abs(vr) * 1.5) {
      if (OS.bhId === bh.id && Math.sign(Lz) === Math.sign(OS.lastLz || Lz)) {
        OS.time += dt;
      } else {
        OS.bhId = bh.id; OS.time = 0;
      }
      OS.lastLz = Lz;
      foundOrbit = true;
      break;
    }
  }

  if (!foundOrbit) {
    OS.time = Math.max(0, OS.time - dt * 2);
    if (OS.time === 0) { OS.bhId = null; OS.lastLz = 0; }
  }

  const wasActive = OS.active;
  OS.active = OS.time >= ORBIT_TIME_REQ;

  if (OS.active) {
    S.stats.orbitTime += dt;
    if (!wasActive) S.stats.orbitCount++;
  }
}

// ─── COMETS ───────────────────────────────────────────────────────────────────
function updateComets(S, P, dt) {
  S.cometTimer -= dt;
  if (S.cometTimer <= 0) {
    S.cometTimer = 45 + Math.random() * 45;
    spawnComet(S);
  }

  for (let i = S.comets.length - 1; i >= 0; i--) {
    const c = S.comets[i];
    c.trail.push({ x: c.x, y: c.y });
    if (c.trail.length > 28) c.trail.shift();

    c.x += c.vx * dt;
    c.y += c.vy * dt;
    wrapPos(c);

    c.life -= dt;
    if (c.life <= 0) { S.comets.splice(i, 1); continue; }

    if (P.alive && di(P, c) < mr(P.mass) + mr(c.mass) * 0.6) {
      const gained = Math.floor(c.mass);
      P.mass += c.mass;
      for (let k = 0; k < 25; k++) {
        S.fx.push({
          x: c.x, y: c.y,
          vx: (Math.random() - 0.5) * 500,
          vy: (Math.random() - 0.5) * 500,
          life: 1.5, color: `hsl(${c.hue}, 90%, 75%)`,
        });
      }
      S.cometAbsorbed = { life: 2.5, mass: gained };
      S.stats.cometsAbsorbed++;
      S.comets.splice(i, 1);
    }
  }

  if (S.cometAlert)    { S.cometAlert.life    -= dt; if (S.cometAlert.life    <= 0) S.cometAlert    = null; }
  if (S.cometAbsorbed) { S.cometAbsorbed.life -= dt; if (S.cometAbsorbed.life <= 0) S.cometAbsorbed = null; }
}

function spawnComet(S) {
  const sides = [
    { x: -200,         y: MAP_H * Math.random() },
    { x: MAP_W + 200,  y: MAP_H * Math.random() },
    { x: MAP_W * Math.random(), y: -200 },
    { x: MAP_W * Math.random(), y: MAP_H + 200 },
  ];
  const { x: cx, y: cy } = sides[Math.floor(Math.random() * 4)];
  const tx    = MAP_W * 0.2 + Math.random() * MAP_W * 0.6;
  const ty    = MAP_H * 0.2 + Math.random() * MAP_H * 0.6;
  const speed = 280 + Math.random() * 200;
  const angle = Math.atan2(ty - cy, tx - cx);

  S.comets.push({
    id: uid(), x: cx, y: cy,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    mass: 100 + Math.random() * 80,
    trail: [],
    hue: 160 + Math.random() * 80,
    life: 35 + Math.random() * 20,
  });
  S.cometAlert = { life: 3, angle };
}

// ─── PUBLIC ───────────────────────────────────────────────────────────────────
export function updateFeatures(S, P, dt) {
  updateSlingshot(S, P, dt);
  updateOrbit(S, P, dt);
  updateComets(S, P, dt);
}
