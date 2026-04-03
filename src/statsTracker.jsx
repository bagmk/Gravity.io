// Samples every INTERVAL seconds, max MAX_SAMPLES points
const INTERVAL   = 1.0;
const MAX_SAMPLES = 180;

export function initStats(S) {
  S.stats = {
    kills:           0,
    slingshotTotal:  0,
    orbitTime:       0,
    orbitCount:      0,
    orbitRevolves:   0,   // total completed 360° orbits
    orbitBonusTotal: 0,   // total momentum from orbit combos
    cometsAbsorbed:  0,
    peakSpeed:       0,
    peakMass:        0,
    peakMomentum:    0,
    survivalTime:    0,
  };
  S.history = [];      // [{ t, spd, mass, momentum }]
  S._histTimer = 0;
}

export function recordStats(S, P, dt) {
  if (!P.alive) return;
  const spd      = Math.sqrt(P.vx ** 2 + P.vy ** 2);
  const momentum = spd * P.mass;

  S.stats.survivalTime += dt;
  if (spd      > S.stats.peakSpeed)    S.stats.peakSpeed    = spd;
  if (P.mass   > S.stats.peakMass)     S.stats.peakMass     = P.mass;
  if (momentum > S.stats.peakMomentum) S.stats.peakMomentum = momentum;

  S._histTimer -= dt;
  if (S._histTimer <= 0) {
    S._histTimer = INTERVAL;
    if (S.history.length >= MAX_SAMPLES) S.history.shift();
    S.history.push({
      t:        Math.floor(S.stats.survivalTime),
      spd:      Math.floor(spd),
      mass:     Math.floor(P.mass),
      momentum: Math.floor(momentum),
    });
  }
}

// ─── SVG Line Chart ──────────────────────────────────────────────────────────
export function MiniChart({ data, color, label, W = 220, H = 60 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - (v / max) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 8, letterSpacing: "0.1em", marginBottom: 3 }}>
        {label} <span style={{ color, opacity: 0.8 }}>peak {Math.floor(max).toLocaleString()}</span>
      </div>
      <svg width={W} height={H} style={{ display: "block" }}>
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeOpacity="0.8"
        />
        {/* Area fill */}
        <polyline
          points={`0,${H} ${pts} ${W},${H}`}
          fill={color}
          fillOpacity="0.08"
          stroke="none"
        />
      </svg>
    </div>
  );
}
