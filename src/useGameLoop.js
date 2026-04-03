import { useEffect, useRef, useCallback } from "react";
import { MAP_W, MAP_H, INITIAL_MASS, AI_COUNT, BH_COUNT, PALETTES } from "./constants.js";
import { wrapPos } from "./utils.js";
import { spawnFood, spawnBH, spawnAI } from "./spawners.js";
import { updatePhysics } from "./physics.js";
import { render } from "./renderer.js";

export function useGameLoop({ started, cfg, logVal, DEFAULTS, setScore, setDead, setLb }) {
  const canvasRef = useRef(null);
  const stRef = useRef(null);
  const afRef = useRef(null);
  const cfgRef = useRef(null);

  const init = useCallback(() => {
    const C = {
      drag: logVal(cfg.drag, DEFAULTS.drag),
      thrust: logVal(cfg.thrust, DEFAULTS.thrust),
      foodG: logVal(cfg.foodG, DEFAULTS.foodG),
      wellG: logVal(cfg.wellG, DEFAULTS.wellG),
      bhMass: logVal(cfg.bhMass, DEFAULTS.bhMass),
      foodCount: Math.round(logVal(cfg.foodCount, DEFAULTS.foodCount)),
    };
    cfgRef.current = C;

    const bhs = [];
    for (let i = 0; i < BH_COUNT; i++) bhs.push(spawnBH(bhs));

    stRef.current = {
      p: { x: MAP_W / 2, y: MAP_H / 2, vx: 0, vy: 0, mass: INITIAL_MASS, palette: PALETTES[0], alive: true },
      foods: Array.from({ length: C.foodCount }, spawnFood),
      ais: Array.from({ length: AI_COUNT }, (_, i) => spawnAI(i)),
      bhs,
      cam: { x: MAP_W / 2, y: MAP_H / 2 },
      mouse: { x: 0, y: 0 }, keys: {}, fx: [], t: 0,
    };

    setDead(false);
    setScore(0);
  }, [cfg, logVal, DEFAULTS, setScore, setDead]);

  useEffect(() => {
    if (!started) return;
    init();

    const cvs = canvasRef.current;
    const ctx = cvs.getContext("2d");
    let W, H;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const r = cvs.parentElement.getBoundingClientRect();
      W = r.width; H = r.height;
      cvs.width = W * dpr; cvs.height = H * dpr;
      cvs.style.width = W + "px"; cvs.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMM = (e) => {
      const r = cvs.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      if (stRef.current) { stRef.current.mouse.x = t.clientX - r.left; stRef.current.mouse.y = t.clientY - r.top; }
    };
    const onKD = (e) => { if (stRef.current) stRef.current.keys[e.code] = true; };
    const onKU = (e) => { if (stRef.current) stRef.current.keys[e.code] = false; };
    cvs.addEventListener("mousemove", onMM);
    cvs.addEventListener("touchmove", onMM, { passive: true });
    cvs.addEventListener("touchstart", onMM, { passive: true });
    window.addEventListener("keydown", onKD);
    window.addEventListener("keyup", onKU);

    let prev = performance.now(), lbT = 0;

    const loop = (now) => {
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;
      const S = stRef.current;
      if (!S) { afRef.current = requestAnimationFrame(loop); return; }
      S.t += dt;

      const playerDied = updatePhysics(S, dt, W, H, cfgRef.current, setDead);
      if (playerDied) setDead(true);

      if (S.p.alive) setScore(Math.floor(S.p.mass));

      lbT -= dt;
      if (lbT <= 0) {
        lbT = 0.4;
        const e = [];
        if (S.p.alive) e.push({ n: "YOU", m: S.p.mass, p: true });
        for (const a of S.ais) if (a.alive) e.push({ n: a.name, m: a.mass, p: false });
        e.sort((a, b) => b.m - a.m);
        setLb(e.slice(0, 6));
      }

      // Food pulse is updated in renderer; BH pulse updated here
      for (const bh of S.bhs) bh.pulse += dt;

      render(ctx, S, W, H, cfgRef.current);

      afRef.current = requestAnimationFrame(loop);
    };

    afRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(afRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKD);
      window.removeEventListener("keyup", onKU);
    };
  }, [started, init, setScore, setDead, setLb]);

  return { canvasRef, init };
}
