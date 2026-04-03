import { MAP_W, MAP_H, SLINGSHOT_R, ORBIT_TIME_REQ, BH_KILL_R } from "./constants.js";
import { mr, uid, wrapDx, wrapDy, di, wrapPos } from "./utils.js";

export function initFeatures(S) {
  S.comets        = [];
  S.cometTimer    = 30 + Math.random() * 20;
  S.cometAlert    = null;
  S.cometAbsorbed = null;
  S.bhProx        = {};
  S.bonusPopups   = [];          // unified floating bonus popups
  S.orbitState    = {
    bhId: null, time: 0, active: false, lastLz: 0,
    combo: 0, angleAcc: 0,       // combo tracking
    broken: null,                // { life, combo } for "BROKEN" message
    sessionBonus: 0,             // total orbit bonus this session
  };
  S.slingshotSessionBonus = 0;
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
          S.bonusPopups.push({ x: P.x, y: P.y, value: bonus, label: `⚡ +${fmt(bonus)} p`, color: "#ffd43b", life: 2.5 });
          S.stats.slingshotTotal += bonus;
          S.slingshotSessionBonus += bonus;
        }
      }
      rec.minDist = Infinity;
    }
  }
}

// ─── ORBIT ────────────────────────────────────────────────────────────────────
const TWO_PI = Math.PI * 2;

function updateOrbit(S, P, dt) {
  const OS = S.orbitState;

  // Age "broken" message
  if (OS.broken) {
    OS.broken.life -= dt;
    if (OS.broken.life <= 0) OS.broken = null;
  }

  if (!P.alive) { OS.active = false; return; }

  let foundOrbit = false;
  let orbitVt = 0;

  for (const bh of S.bhs) {
    const rx   = wrapDx(bh.x, P.x);
    const ry   = wrapDy(bh.y, P.y);
    const dist = Math.sqrt(rx * rx + ry * ry);
    if (dist < 90 || dist > 800) continue;

    const Lz = rx * P.vy - ry * P.vx;
    const vr = (rx * P.vx + ry * P.vy) / dist;
    const vt = Lz / dist;

    if (Math.abs(vt) > 60 && Math.abs(vt) > Math.abs(vr) * 1.5) {
      const sameDir = OS.bhId === bh.id && Math.sign(Lz) === Math.sign(OS.lastLz || Lz);
      if (sameDir) {
        OS.time += dt;
        // Accumulate angle: ω = Lz / dist²
        OS.angleAcc += Math.abs(Lz) / (dist * dist) * dt;
      } else {
        // Direction changed or new BH → break combo
        if (OS.combo > 0) breakCombo(S, OS, P);
        OS.bhId = bh.id; OS.time = 0; OS.angleAcc = 0;
      }
      OS.lastLz = Lz;
      orbitVt   = vt;
      foundOrbit = true;
      break;
    }
  }

  if (!foundOrbit) {
    OS.time = Math.max(0, OS.time - dt * 2);
    if (OS.time === 0 && OS.active) {
      breakCombo(S, OS, P);
      OS.bhId = null; OS.lastLz = 0; OS.angleAcc = 0;
    }
  }

  const wasActive = OS.active;
  OS.active = OS.time >= ORBIT_TIME_REQ;
  if (OS.active) S.stats.orbitTime += dt;

  // ── Completed orbit detection (angle accumulated ≥ 2π) ───────────────────
  if (OS.active && OS.angleAcc >= TWO_PI) {
    OS.angleAcc -= TWO_PI;
    OS.combo++;
    S.stats.orbitRevolves++;

    const multiplier = Math.pow(1.5, OS.combo - 1);
    const bonus      = Math.floor(P.mass * Math.abs(orbitVt) * multiplier * 0.12);
    OS.sessionBonus += bonus;
    S.stats.orbitBonusTotal += bonus;

    S.bonusPopups.push({
      x: P.x, y: P.y - mr(P.mass) * 1.5,
      value: bonus,
      label: `◎ ×${OS.combo}  +${fmt(bonus)} p`,
      color: comboColor(OS.combo),
      life: 2.8,
    });
  }
}

function breakCombo(S, OS, P) {
  if (OS.combo === 0) return;
  OS.broken = { life: 2, combo: OS.combo, bonus: OS.sessionBonus };
  OS.combo  = 0;
  OS.sessionBonus = 0;
}

function comboColor(n) {
  if (n >= 8) return "#ff6b6b";
  if (n >= 5) return "#ffd43b";
  if (n >= 3) return "#b197fc";
  return "#63e6be";
}

function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return n.toLocaleString();
}

// ─── COMETS ───────────────────────────────────────────────────────────────────
const COMET_BH_G   = 1800;   // BH attraction strength on comets
const COMET_WELL_G = 400;    // well attraction (weak)

function updateComets(S, P, dt) {
  // Spawn timer — also respawns after comet removed
  S.cometTimer -= dt;
  if (S.cometTimer <= 0 && S.comets.length === 0) {
    S.cometTimer = 0;
    spawnComet(S);
  }

  for (let i = S.comets.length - 1; i >= 0; i--) {
    const c = S.comets[i];

    // ── Gravity: black holes ──────────────────────────────────────────────────
    for (const bh of S.bhs) {
      const dx   = wrapDx(c.x, bh.x);
      const dy   = wrapDy(c.y, bh.y);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;
      const F = COMET_BH_G / (Math.max(dist, 80) ** 2);
      c.vx += (dx / dist) * F * dt;
      c.vy += (dy / dist) * F * dt;
      // Sucked into BH
      if (dist < BH_KILL_R * 1.2) {
        S.comets.splice(i, 1);
        S.cometTimer = 15 + Math.random() * 15; // respawn soon
        continue;
      }
    }
    if (i >= S.comets.length) continue; // was removed above

    // ── Gravity: wells ───────────────────────────────────────────────────────
    const wells = S.p.alive ? [S.p, ...S.ais.filter(a => a.alive)] : S.ais.filter(a => a.alive);
    for (const w of wells) {
      const dx   = wrapDx(c.x, w.x);
      const dy   = wrapDy(c.y, w.y);
      const dSq  = dx * dx + dy * dy;
      if (dSq < 4 || dSq > 600 * 600) continue;
      const dist = Math.sqrt(dSq);
      const F    = COMET_WELL_G * w.mass / dSq;
      c.vx += (dx / dist) * F * dt;
      c.vy += (dy / dist) * F * dt;
    }

    // ── Record trail & move ──────────────────────────────────────────────────
    c.trail.push({ x: c.x, y: c.y });
    if (c.trail.length > 32) c.trail.shift();
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    wrapPos(c);

    c.life -= dt;
    if (c.life <= 0) {
      S.comets.splice(i, 1);
      S.cometTimer = 20 + Math.random() * 20; // respawn after expiry
      continue;
    }

    // ── Player absorbs comet ─────────────────────────────────────────────────
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
      S.cometTimer = 20 + Math.random() * 20; // respawn after absorption
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

  // Age unified bonus popups
  for (let i = S.bonusPopups.length - 1; i >= 0; i--) {
    const b = S.bonusPopups[i];
    b.y   -= 45 * dt;
    b.life -= dt;
    if (b.life <= 0) S.bonusPopups.splice(i, 1);
  }
}
