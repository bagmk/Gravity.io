import { useState, useCallback } from "react";
import { DEFAULTS } from "./constants.js";
import { useGameLoop } from "./useGameLoop.js";
import { MiniChart } from "./statsTracker.jsx";

const isMobile = () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;

// Log scale: pos 50 = default, 0 ≈ 0, 100 = default * ~1000
const logVal = (pos, def) => pos === 0 ? 0 : def * Math.pow(10, (pos - 50) * 0.06);

const fmtVal = (v) => {
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "k";
  if (v >= 1) return Math.round(v).toString();
  return v.toFixed(3);
};

export default function GravityIO() {
  const [score, setScore] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [momentum, setMomentum] = useState(0);
  const [dead, setDead] = useState(false);
  const [started, setStarted] = useState(false);
  const [lb, setLb] = useState([]);
  const [speedLb, setSpeedLb] = useState([]);
  const [endStats, setEndStats] = useState(null);
  const [cfg, setCfg] = useState({
    drag: 0,   // 마찰 없음
    thrust: 50, foodG: 50, wellG: 50, bhMass: 50, foodCount: 50,
  });

  const { canvasRef, stRef, init } = useGameLoop({
    started, cfg, logVal, DEFAULTS, setScore, setSpeed, setMomentum, setDead, setEndStats, setLb, setSpeedLb,
  });

  // Mobile boost button handlers — directly toggle "Space" key in game state
  const onBoostStart = useCallback(() => {
    if (stRef.current) stRef.current.keys["Space"] = true;
  }, [stRef]);
  const onBoostEnd = useCallback(() => {
    if (stRef.current) stRef.current.keys["Space"] = false;
  }, [stRef]);

  const sliderRow = (label, key, def) => {
    const val = logVal(cfg[key], def);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, width: 72, textAlign: "right", flexShrink: 0 }}>{label}</span>
        <input type="range" min={1} max={100} value={cfg[key]}
          onChange={(e) => setCfg(c => ({ ...c, [key]: Number(e.target.value) }))}
          style={{ flex: 1, height: 3, appearance: "none", WebkitAppearance: "none",
            background: `linear-gradient(to right, rgba(132,94,247,0.4) ${cfg[key]}%, rgba(255,255,255,0.08) ${cfg[key]}%)`,
            borderRadius: 2, outline: "none", cursor: "pointer", accentColor: "#845ef7" }} />
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, width: 48, textAlign: "left", fontVariantNumeric: "tabular-nums" }}>{fmtVal(val)}</span>
      </div>
    );
  };

  if (!started) {
    return (
      <div style={{ width: "100vw", height: "100vh", background: "#060610", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", color: "white", gap: 16, userSelect: "none", padding: "0 24px", boxSizing: "border-box" }}>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;800&display=swap" rel="stylesheet" />
        <div style={{ fontSize: 40, fontWeight: 800 }}>
          <span style={{ color: "#845ef7" }}>GRAVITY</span><span style={{ opacity: 0.35 }}>.io</span>
        </div>
        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, textAlign: "center", lineHeight: 2, maxWidth: 300 }}>
          마우스 방향으로 추력 · 중력이 모든 것을 끌어당긴다<br />
          <span style={{ color: "rgba(160,100,255,0.5)" }}>⬤ 블랙홀</span> 주변 = 고위험 고보상<br />
          <span style={{ color: "rgba(255,200,80,0.6)", fontSize: 10 }}>Space / Shift</span>
          <span style={{ fontSize: 10, opacity: 0.5 }}> = 부스트 (질량 소모)</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 320, marginTop: 4 }}>
          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, letterSpacing: "0.1em", marginBottom: 2 }}>PARAMETERS</div>
          {sliderRow("마찰", "drag", DEFAULTS.drag)}
          {sliderRow("추력", "thrust", DEFAULTS.thrust)}
          {sliderRow("먹이 인력", "foodG", DEFAULTS.foodG)}
          {sliderRow("웰 중력", "wellG", DEFAULTS.wellG)}
          {sliderRow("블랙홀", "bhMass", DEFAULTS.bhMass)}
          {sliderRow("먹이 수", "foodCount", DEFAULTS.foodCount)}
        </div>
        <button onClick={() => setStarted(true)}
          style={{ background: "rgba(132,94,247,0.2)", border: "1px solid rgba(132,94,247,0.4)", color: "#b197fc", padding: "12px 36px", borderRadius: 8, fontSize: 15, fontFamily: "inherit", fontWeight: 600, cursor: "pointer", letterSpacing: "0.08em", marginTop: 8 }}>
          START
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#060610", position: "relative", overflow: "hidden", fontFamily: "'JetBrains Mono', monospace", cursor: "crosshair", userSelect: "none" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;800&display=swap" rel="stylesheet" />
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />

      {/* Center HUD: mass / speed / momentum */}
      <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", textAlign: "center", pointerEvents: "none", whiteSpace: "nowrap" }}>
        <div>
          <span style={{ fontSize: 26, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{score}</span>
          <span style={{ marginLeft: 4, fontSize: 9, color: "rgba(255,255,255,0.25)" }}>kg</span>
        </div>
        <div style={{ marginTop: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(105,219,124,0.85)" }}>{fmtVal(speed)}</span>
          <span style={{ marginLeft: 3, fontSize: 9, color: "rgba(105,219,124,0.35)" }}>m/s</span>
        </div>
        <div style={{ marginTop: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(99,230,190,0.8)" }}>{fmtVal(momentum)}</span>
          <span style={{ marginLeft: 3, fontSize: 9, color: "rgba(99,230,190,0.3)" }}>kg·m/s</span>
        </div>
      </div>

      {/* Mass leaderboard */}
      <div style={{ position: "absolute", top: 14, right: 10, color: "rgba(255,255,255,0.35)", fontSize: 10, lineHeight: 1.9, pointerEvents: "none", textAlign: "right" }}>
        <div style={{ color: "rgba(255,255,255,0.15)", fontSize: 8, letterSpacing: "0.1em", marginBottom: 2 }}>MASS</div>
        {lb.map((e, i) => (
          <div key={i} style={{ color: e.p ? "#845ef7" : "rgba(255,255,255,0.3)" }}>
            {i + 1}. {e.n} — {Math.floor(e.m)}
          </div>
        ))}
      </div>

      {/* Speed leaderboard */}
      <div style={{ position: "absolute", top: 14, left: 10, color: "rgba(255,255,255,0.35)", fontSize: 10, lineHeight: 1.9, pointerEvents: "none" }}>
        <div style={{ color: "rgba(255,255,255,0.15)", fontSize: 8, letterSpacing: "0.1em", marginBottom: 2 }}>TOP SPEED</div>
        {speedLb.map((e, i) => (
          <div key={i} style={{ color: e.p ? "#63e6be" : "rgba(255,255,255,0.3)" }}>
            {i + 1}. {e.n} — {Math.floor(e.v)}
          </div>
        ))}
      </div>

      {/* Mobile boost button */}
      {isMobile() && !dead && (
        <button
          onTouchStart={(e) => { e.preventDefault(); onBoostStart(); }}
          onTouchEnd={(e) => { e.preventDefault(); onBoostEnd(); }}
          onMouseDown={onBoostStart}
          onMouseUp={onBoostEnd}
          style={{
            position: "absolute", bottom: 32, right: 24,
            width: 72, height: 72, borderRadius: "50%",
            background: "rgba(132,94,247,0.25)",
            border: "2px solid rgba(132,94,247,0.5)",
            color: "#b197fc", fontSize: 11, fontFamily: "inherit",
            fontWeight: 600, cursor: "pointer", userSelect: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            letterSpacing: "0.05em", touchAction: "none",
          }}
        >BOOST</button>
      )}

      {/* Back to start */}
      <button
        onClick={() => { setStarted(false); setDead(false); }}
        style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)", padding: "5px 10px", borderRadius: 4, fontSize: 9, fontFamily: "inherit", cursor: "pointer", letterSpacing: "0.05em" }}
        onMouseEnter={(e) => { e.target.style.color = "rgba(255,255,255,0.7)"; e.target.style.background = "rgba(255,255,255,0.1)"; }}
        onMouseLeave={(e) => { e.target.style.color = "rgba(255,255,255,0.3)"; e.target.style.background = "rgba(255,255,255,0.04)"; }}
      >처음으로</button>

      {/* Death screen */}
      {dead && endStats && (
        <DeathScreen
          stats={endStats.stats}
          history={endStats.history}
          onRetry={init}
          onHome={() => { setStarted(false); setDead(false); }}
        />
      )}
    </div>
  );
}

// ─── Death Screen ─────────────────────────────────────────────────────────────
function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return Math.floor(n).toLocaleString();
}
function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function DeathScreen({ stats, history, onRetry, onHome }) {
  const spdData  = history.map(h => h.spd);
  const massData = history.map(h => h.mass);
  const momData  = history.map(h => h.momentum);

  const statCards = [
    { label: "생존 시간",      value: fmtTime(stats.survivalTime),           color: "#748ffc" },
    { label: "최고 질량",      value: fmt(stats.peakMass),                   color: "#ffd43b" },
    { label: "최고 속도",      value: fmt(stats.peakSpeed),                  color: "#69db7c" },
    { label: "최고 모멘텀",    value: fmt(stats.peakMomentum),               color: "#63e6be" },
    { label: "킬",             value: stats.kills,                           color: "#ff6b6b" },
    { label: "혜성 흡수",      value: stats.cometsAbsorbed,                  color: "#63e6be" },
    { label: "슬링샷 보너스",  value: fmt(stats.slingshotTotal) + " p",      color: "#ffd43b" },
    { label: "궤도 시간",      value: fmtTime(stats.orbitTime),              color: "#b197fc" },
  ];

  return (
    <div style={{
      position: "absolute", inset: 0, background: "rgba(6,6,16,0.95)",
      display: "flex", flexDirection: "column", alignItems: "center",
      overflowY: "auto", fontFamily: "'JetBrains Mono', monospace", color: "white",
      padding: "24px 20px", boxSizing: "border-box", gap: 20,
    }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#ff6b6b", letterSpacing: "0.05em" }}>ABSORBED</div>

      {/* Graphs */}
      <div style={{ width: "100%", maxWidth: 480 }}>
        <MiniChart data={momData}  color="#63e6be" label="모멘텀 (p = mv)" W={440} H={55} />
        <MiniChart data={massData} color="#ffd43b" label="질량"             W={440} H={45} />
        <MiniChart data={spdData}  color="#69db7c" label="속도"             W={440} H={45} />
      </div>

      {/* Stat cards */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: 8, width: "100%", maxWidth: 360,
      }}>
        {statCards.map(({ label, value, color }) => (
          <div key={label} style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 6, padding: "8px 12px",
          }}>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onRetry} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", padding: "10px 28px", borderRadius: 6, fontSize: 13, fontFamily: "inherit", fontWeight: 600, cursor: "pointer" }}>다시하기</button>
        <button onClick={onHome}  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",  color: "rgba(255,255,255,0.4)", padding: "10px 28px", borderRadius: 6, fontSize: 13, fontFamily: "inherit", fontWeight: 600, cursor: "pointer" }}>처음으로</button>
      </div>
    </div>
  );
}
