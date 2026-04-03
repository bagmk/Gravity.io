import { MAP_W, MAP_H, BH_LJ_EQ, BH_KILL_R, ORBIT_TIME_REQ } from "./constants.js";
import { mr, wrapDx, wrapDy, di } from "./utils.js";

function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return Math.floor(n).toLocaleString();
}
function hexAlpha(hex, a) {
  return hex + Math.round(Math.min(a, 1) * 255).toString(16).padStart(2, "0");
}
function comboRingColor(n) {
  if (n >= 8) return "#ff6b6b";
  if (n >= 5) return "#ffd43b";
  if (n >= 3) return "#b197fc";
  return "#63e6be";
}

export function render(ctx, S, W, H, cfg) {
  const P = S.p;
  // sqrt-based zoom: view expands as player grows, player stays small on screen
  const zoom = Math.max(0.05, 1 / (1 + Math.sqrt(P.mass) * 0.15));

  // Visual position helpers: wrap entity to be closest to camera
  const vx = (x) => { let d = x - S.cam.x; if (d > MAP_W / 2) d -= MAP_W; if (d < -MAP_W / 2) d += MAP_W; return S.cam.x + d; };
  const vy = (y) => { let d = y - S.cam.y; if (d > MAP_H / 2) d -= MAP_H; if (d < -MAP_H / 2) d += MAP_H; return S.cam.y + d; };

  ctx.fillStyle = "#060610";
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-S.cam.x, -S.cam.y);

  // Grid
  ctx.strokeStyle = "rgba(255,255,255,0.02)";
  ctx.lineWidth = 1;
  const gs = 150;
  const sx = Math.floor((S.cam.x - W / 2 / zoom) / gs) * gs;
  const ex = S.cam.x + W / 2 / zoom;
  const sy = Math.floor((S.cam.y - H / 2 / zoom) / gs) * gs;
  const ey = S.cam.y + H / 2 / zoom;
  for (let gx = sx; gx <= ex; gx += gs) { ctx.beginPath(); ctx.moveTo(gx, sy); ctx.lineTo(gx, ey); ctx.stroke(); }
  for (let gy = sy; gy <= ey; gy += gs) { ctx.beginPath(); ctx.moveTo(sx, gy); ctx.lineTo(ex, gy); ctx.stroke(); }

  // Black holes
  drawBlackHoles(ctx, S, W, H, zoom, vx, vy);

  // Gravity lines between wells
  const wells = [];
  if (P.alive) wells.push(P);
  for (const a of S.ais) if (a.alive) wells.push(a);
  drawGravityLines(ctx, wells, S, vx, vy);

  // Food
  for (const f of S.foods) {
    f.pulse += 0.016 * 2; // approximate dt; pulse is purely visual
    const fx2 = vx(f.x), fy2 = vy(f.y);
    const screenX = (fx2 - S.cam.x) * zoom, screenY = (fy2 - S.cam.y) * zoom;
    if (Math.abs(screenX) > W / 2 + 20 || Math.abs(screenY) > H / 2 + 20) continue;
    const fr = mr(f.mass) + Math.sin(f.pulse) * 0.3;
    ctx.beginPath(); ctx.arc(fx2, fy2, fr, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${f.hue}, 65%, 60%, 0.8)`;
    ctx.fill();
  }

  // FX particles
  for (const p of S.fx) {
    const a = Math.min(p.life * 2, 1);
    const px2 = vx(p.x), py2 = vy(p.y);
    ctx.beginPath(); ctx.arc(px2, py2, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = p.color
      ? p.color + Math.floor(a * 200).toString(16).padStart(2, "0")
      : `hsla(${p.hue || 0}, 60%, 60%, ${a})`;
    ctx.fill();
  }

  // Wells
  for (const a of S.ais) drawWell(ctx, a, a.name, false, vx, vy);
  if (P.alive) drawWell(ctx, P, "YOU", true, vx, vy);

  // Dotted line to strongest attractor
  if (P.alive) {
    let maxPull = 0, attractor = null, attractorIsBH = false;
    for (const w of wells) {
      if (w === P) continue;
      const d = di(P, w); if (d < 1) continue;
      const pull = cfg.wellG * w.mass / (d * d);
      if (pull > maxPull) { maxPull = pull; attractor = w; attractorIsBH = false; }
    }
    for (const bh of S.bhs) {
      const d = di(P, bh); if (d < 1) continue;
      const pull = cfg.wellG * cfg.bhMass / (d * d);
      if (pull > maxPull) { maxPull = pull; attractor = bh; attractorIsBH = true; }
    }
    if (attractor && maxPull > 0.5) {
      const alpha = Math.min(maxPull * 0.004, 0.6);
      ctx.save();
      ctx.setLineDash([6 / zoom, 10 / zoom]);
      ctx.lineWidth = 1.5 / zoom;
      ctx.strokeStyle = attractorIsBH
        ? `rgba(180, 60, 255, ${alpha})`
        : `rgba(255, 80, 80, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(vx(P.x), vy(P.y));
      ctx.lineTo(vx(attractor.x), vy(attractor.y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    S._attractor = { src: attractor, isBH: attractorIsBH, pull: maxPull };
  }

  // ── Comets with trails ──────────────────────────────────────────────────────
  if (S.comets) {
    for (const c of S.comets) {
      // Trail
      for (let i = 1; i < c.trail.length; i++) {
        const alpha = (i / c.trail.length) * 0.55;
        const tr    = mr(c.mass) * (i / c.trail.length) * 0.7;
        ctx.beginPath();
        ctx.arc(vx(c.trail[i].x), vy(c.trail[i].y), Math.max(tr, 0.5), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${c.hue}, 85%, 65%, ${alpha})`;
        ctx.fill();
      }
      // Body
      const cx2 = vx(c.x), cy2 = vy(c.y);
      const cr  = mr(c.mass);
      const cg  = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, cr * 1.5);
      cg.addColorStop(0,   `hsl(${c.hue}, 100%, 95%)`);
      cg.addColorStop(0.4, `hsl(${c.hue}, 90%, 70%)`);
      cg.addColorStop(1,   `hsla(${c.hue}, 80%, 55%, 0)`);
      ctx.beginPath(); ctx.arc(cx2, cy2, cr * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = cg; ctx.fill();
      // Mass label
      const cfs = Math.max(9 / zoom, Math.min(cr * 0.6, 18 / zoom));
      ctx.font = `600 ${cfs}px 'JetBrains Mono', monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(`☄ ${Math.floor(c.mass)}`, cx2, cy2);
    }
  }

  // ── Orbit ring around player ────────────────────────────────────────────────
  if (S.orbitState?.active && P.alive) {
    const OS    = S.orbitState;
    const px2   = vx(P.x), py2 = vy(P.y);
    const or    = mr(P.mass) * 1.7;
    const combo = OS.combo;
    const color = comboRingColor(combo);
    // Progress arc for current orbit
    const arcProg = Math.min(OS.angleAcc / (Math.PI * 2), 1);
    ctx.beginPath();
    ctx.arc(px2, py2, or, -Math.PI / 2, -Math.PI / 2 + arcProg * Math.PI * 2);
    ctx.strokeStyle = color + "cc";
    ctx.lineWidth   = 3 / zoom;
    ctx.stroke();
    // Full dashed ring
    ctx.beginPath(); ctx.arc(px2, py2, or, 0, Math.PI * 2);
    ctx.strokeStyle = color + "44";
    ctx.lineWidth   = 1.5 / zoom;
    ctx.setLineDash([5 / zoom, 7 / zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Combo label
    if (combo > 0) {
      const fs = Math.max(9, 11) / zoom;
      ctx.font = `700 ${fs}px 'JetBrains Mono', monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = color + "dd";
      ctx.fillText(`×${combo}  ×${(Math.pow(1.5, combo - 1)).toFixed(1)}`, px2, py2 - or - 10 / zoom);
    }
  }

  // ── Bonus popups (slingshot + orbit combo, world space) ─────────────────────
  if (S.bonusPopups) {
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const b of S.bonusPopups) {
      const alpha = Math.min(b.life, 1);
      const fs    = Math.min(15, 13) / zoom;
      ctx.font      = `700 ${fs}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = hexAlpha(b.color, alpha);
      ctx.fillText(b.label, vx(b.x), vy(b.y));
    }
  }

  // ── Orbit combo broken notice (world space, near player) ─────────────────────
  if (S.orbitState?.broken && P.alive) {
    const br    = S.orbitState.broken;
    const alpha = Math.min(br.life, 1);
    const fs    = 12 / zoom;
    ctx.font      = `700 ${fs}px 'JetBrains Mono', monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = hexAlpha("#ff6b6b", alpha);
    ctx.fillText(`✕ ORBIT ×${br.combo} BROKEN`, vx(P.x), vy(P.y) - mr(P.mass) * 2.5);
  }

  ctx.restore();

  // HUD overlay (danger bars, arrows, minimap, velocity)
  drawHUD(ctx, S, P, W, H, zoom, cfg, vx, vy, wells);
}

function drawBlackHoles(ctx, S, W, H, zoom, vx, vy) {
  for (const bh of S.bhs) {
    const bx = vx(bh.x), by = vy(bh.y);
    const screenX = (bx - S.cam.x) * zoom, screenY = (by - S.cam.y) * zoom;
    if (Math.abs(screenX) > W / 2 + 400 || Math.abs(screenY) > H / 2 + 400) continue;

    for (let ring = 0; ring < 3; ring++) {
      const rr = BH_LJ_EQ * (0.7 + ring * 0.3) + Math.sin(bh.pulse * (1.5 - ring * 0.3)) * 15;
      ctx.beginPath(); ctx.arc(bx, by, rr, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(180, 100, 255, ${0.06 - ring * 0.015})`; ctx.lineWidth = 2; ctx.stroke();
    }

    const og = ctx.createRadialGradient(bx, by, BH_KILL_R, bx, by, 350);
    og.addColorStop(0, "rgba(100, 50, 180, 0.12)"); og.addColorStop(0.3, "rgba(80, 30, 150, 0.06)"); og.addColorStop(1, "transparent");
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(bx, by, 350, 0, Math.PI * 2); ctx.fill();

    const eg = ctx.createRadialGradient(bx, by, 0, bx, by, BH_KILL_R);
    eg.addColorStop(0, "#000000"); eg.addColorStop(0.7, "rgba(0,0,0,0.95)"); eg.addColorStop(1, "rgba(60, 20, 100, 0.4)");
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(bx, by, BH_KILL_R, 0, Math.PI * 2); ctx.fill();

    const ringR = BH_KILL_R * 1.3;
    for (let i = 0; i < 6; i++) {
      const angle = bh.pulse * 1.5 + (i / 6) * Math.PI * 2;
      const lx = bx + Math.cos(angle) * ringR;
      const ly = by + Math.sin(angle) * ringR;
      ctx.beginPath(); ctx.arc(lx, ly, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 150, 255, ${0.4 + Math.sin(angle + bh.pulse) * 0.2})`;
      ctx.fill();
    }
  }
}

function drawGravityLines(ctx, wells, S, vx, vy) {
  for (let i = 0; i < wells.length; i++) {
    for (let j = i + 1; j < wells.length; j++) {
      const a = wells[i], b = wells[j];
      const d = di(a, b);
      const range = (mr(a.mass) + mr(b.mass)) * 8;
      if (d >= range) continue;
      const alpha = (1 - d / range) * 0.18;
      const ax = vx(a.x), ay = vy(a.y), bxx = vx(b.x), byy = vy(b.y);
      const midX = (ax + bxx) / 2, midY = (ay + byy) / 2;
      const px = -(byy - ay) * 0.1, py = (bxx - ax) * 0.1;
      ctx.beginPath(); ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(midX + px * Math.sin(S.t * 2), midY + py * Math.sin(S.t * 2), bxx, byy);
      ctx.strokeStyle = `rgba(255,200,100,${alpha})`; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
}

function drawWell(ctx, w, name, isP, vx, vy) {
  if (!w.alive) return;
  const wx = vx(w.x), wy = vy(w.y);
  const r = mr(w.mass);
  const speed = Math.sqrt(w.vx * w.vx + w.vy * w.vy);

  const gr = ctx.createRadialGradient(wx, wy, r * 0.8, wx, wy, r * 6);
  gr.addColorStop(0, w.palette[0] + "18"); gr.addColorStop(0.6, w.palette[0] + "06"); gr.addColorStop(1, "transparent");
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(wx, wy, r * 6, 0, Math.PI * 2); ctx.fill();

  ctx.save(); ctx.translate(wx, wy);
  if (speed > 10) {
    const ang = Math.atan2(w.vy, w.vx); const s = Math.min(speed * 0.001, 0.15);
    ctx.rotate(ang); ctx.scale(1 + s, 1 - s * 0.5); ctx.rotate(-ang);
  }
  const bg = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 0, 0, 0, r);
  bg.addColorStop(0, "rgba(255,255,255,0.35)"); bg.addColorStop(0.35, w.palette[0]); bg.addColorStop(1, w.palette[1]);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill();
  if (isP) { ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 2.5; ctx.stroke(); }
  ctx.restore();

  const fs = Math.max(10, Math.min(r * 0.55, 22));
  ctx.font = `600 ${fs}px 'JetBrains Mono', monospace`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText(name, wx, wy - fs * 0.15);
  ctx.font = `300 ${Math.max(8, fs * 0.55)}px 'JetBrains Mono', monospace`;
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillText(Math.floor(w.mass), wx, wy + fs * 0.65);
}

function drawHUD(ctx, S, P, W, H, zoom, cfg, vx, vy, wells) {
  if (P.alive) {
    // Danger pull bar
    let maxPull = 0, pullSrc = "";
    for (const w of wells) {
      if (w === P || w.mass <= P.mass * 0.8) continue;
      const d = di(P, w);
      const pull = cfg.wellG * w.mass / (d * d);
      if (pull > maxPull) { maxPull = pull; pullSrc = w.name || ""; }
    }
    for (const bh of S.bhs) {
      const d = di(P, bh);
      const pull = cfg.wellG * cfg.bhMass / (d * d);
      if (pull > maxPull) { maxPull = pull; pullSrc = "BLACK HOLE"; }

      // Arrow to BH if off-screen
      if (d < 600) {
        const sx2 = (vx(bh.x) - S.cam.x) * zoom + W / 2;
        const sy2 = (vy(bh.y) - S.cam.y) * zoom + H / 2;
        if (sx2 < 0 || sx2 > W || sy2 < 0 || sy2 > H) {
          drawArrow(ctx, sx2, sy2, W, H, `rgba(180, 80, 255, ${Math.min(0.8, 400 / d)})`);
        }
      }
    }
    // Arrows to bigger wells
    for (const w of wells) {
      if (w === P || w.mass <= P.mass * 1.1) continue;
      const d = di(P, w);
      if (d > Math.sqrt(w.mass) * 50) continue;
      const sx2 = (vx(w.x) - S.cam.x) * zoom + W / 2;
      const sy2 = (vy(w.y) - S.cam.y) * zoom + H / 2;
      if (sx2 < -20 || sx2 > W + 20 || sy2 < -20 || sy2 > H + 20) {
        drawArrow(ctx, sx2, sy2, W, H, "rgba(255, 80, 80, 0.6)");
      }
    }
    if (maxPull > 3) {
      const barW = Math.min(maxPull * 0.4, 120);
      const alpha = Math.min(maxPull * 0.008, 0.8);
      const isBlackHole = pullSrc === "BLACK HOLE";
      const color = isBlackHole ? "rgba(180, 60, 255," : "rgba(255, 60, 60,";
      ctx.fillStyle = color + alpha + ")";
      ctx.fillRect(W / 2 - barW / 2, H - 36, barW, 4);
      ctx.font = "300 9px 'JetBrains Mono', monospace";
      ctx.fillStyle = color + alpha + ")"; ctx.textAlign = "center";
      ctx.fillText(`← ${pullSrc} PULL →`, W / 2, H - 42);
    }

    // Stats panel: speed / accel / mass
    const spd = Math.floor(Math.sqrt(P.vx ** 2 + P.vy ** 2));
    const acc = Math.floor(P.accel || 0);
    const stats = [
      { label: "SPD", value: spd },
      { label: "ACC", value: acc },
      { label: "MASS", value: Math.floor(P.mass) },
    ];
    ctx.font = "300 10px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    stats.forEach(({ label, value }, i) => {
      const y = H - 12 - i * 16;
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillText(label, 12, y);
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fillText(value, 46, y);
    });
  }

  // Minimap
  const ms = Math.min(110, W * 0.18);
  const mmx = W - ms - 10, mmy = H - ms - 10;
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(mmx, mmy, ms, ms);
  ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1;
  ctx.strokeRect(mmx, mmy, ms, ms);
  const sc = ms / MAP_W;
  for (const bh of S.bhs) {
    ctx.fillStyle = "rgba(140, 60, 220, 0.5)";
    ctx.beginPath(); ctx.arc(mmx + bh.x * sc, mmy + bh.y * sc, 4, 0, Math.PI * 2); ctx.fill();
  }
  if (P.alive) {
    ctx.fillStyle = P.palette[0]; ctx.beginPath(); ctx.arc(mmx + P.x * sc, mmy + P.y * sc, 3, 0, Math.PI * 2); ctx.fill();
  }
  for (const a of S.ais) {
    if (!a.alive) continue;
    ctx.fillStyle = a.palette[0] + "80"; ctx.beginPath(); ctx.arc(mmx + a.x * sc, mmy + a.y * sc, Math.max(1.5, mr(a.mass) * sc * 2), 0, Math.PI * 2); ctx.fill();
  }
  // Comets on minimap
  if (S.comets) {
    for (const c of S.comets) {
      ctx.fillStyle = `hsla(${c.hue}, 90%, 70%, 0.85)`;
      ctx.beginPath(); ctx.arc(mmx + c.x * sc, mmy + c.y * sc, 3, 0, Math.PI * 2); ctx.fill();
      // tiny trail on minimap
      if (c.trail.length > 1) {
        ctx.strokeStyle = `hsla(${c.hue}, 80%, 60%, 0.4)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(mmx + c.trail[0].x * sc, mmy + c.trail[0].y * sc);
        for (let ti = 1; ti < c.trail.length; ti += 3)
          ctx.lineTo(mmx + c.trail[ti].x * sc, mmy + c.trail[ti].y * sc);
        ctx.stroke();
      }
    }
  }
  const vw = W / zoom * sc, vh = H / zoom * sc;
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.strokeRect(mmx + S.cam.x * sc - vw / 2, mmy + S.cam.y * sc - vh / 2, vw, vh);

  // ── Orbit locked + slingshot HUD ──────────────────────────────────────────
  if (S.orbitState?.active) {
    const OS    = S.orbitState;
    const combo = OS.combo;
    const mult  = combo > 0 ? `×${(Math.pow(1.5, combo - 1)).toFixed(1)}` : "";
    const col   = comboRingColor(combo);
    ctx.font = "600 10px 'JetBrains Mono', monospace";
    ctx.fillStyle = col; ctx.textAlign = "center";
    ctx.fillText(`◎ ORBIT COMBO ${combo > 0 ? `×${combo}` : "LOCK"}  ${mult}`, W / 2, H - 56);
    if (OS.sessionBonus > 0) {
      ctx.font = "300 9px 'JetBrains Mono', monospace";
      ctx.fillStyle = col + "99";
      ctx.fillText(`+${fmt(OS.sessionBonus)} p this orbit`, W / 2, H - 44);
    }
  }
  // Slingshot session total (fades in when > 0)
  if ((S.slingshotSessionBonus || 0) > 0) {
    ctx.font = "300 9px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(255,212,59,0.5)"; ctx.textAlign = "left";
    ctx.fillText(`⚡ ${fmt(S.slingshotSessionBonus)} p slingshot`, 12, H - 28);
  }

  // ── Comet incoming alert ──────────────────────────────────────────────────
  if (S.cometAlert) {
    const a = Math.min(S.cometAlert.life, 1);
    ctx.save(); ctx.globalAlpha = a;
    ctx.font = "700 14px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#63e6be"; ctx.textAlign = "center";
    ctx.fillText("☄  COMET INCOMING", W / 2, 56);
    ctx.restore();
  }

  // ── Comet absorbed notification ───────────────────────────────────────────
  if (S.cometAbsorbed) {
    const a = Math.min(S.cometAbsorbed.life, 1);
    ctx.save(); ctx.globalAlpha = a;
    ctx.font = "700 18px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#63e6be"; ctx.textAlign = "center";
    ctx.fillText(`☄  +${S.cometAbsorbed.mass} MASS`, W / 2, H / 2 - 60);
    ctx.restore();
  }
}

function drawArrow(ctx, targetScreenX, targetScreenY, W, H, color) {
  const angle = Math.atan2(targetScreenY - H / 2, targetScreenX - W / 2);
  const eX = W / 2 + Math.cos(angle) * Math.min(W, H) * 0.42;
  const eY = H / 2 + Math.sin(angle) * Math.min(W, H) * 0.42;
  ctx.save(); ctx.translate(eX, eY); ctx.rotate(angle);
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-7, -8); ctx.lineTo(-7, 8); ctx.closePath();
  ctx.fillStyle = color; ctx.fill(); ctx.restore();
}
