import { useEffect, useRef } from "react";
import type { Site, Target } from "../lib/data";

// Body colours: mineral green for Earth, iron oxide for Mars, anorthosite slate for the Moon.
// They are CSS variables so each chart takes the tone of the surface it sits on (ink-dark on paper, lit on a plate).
const C = { earth: "var(--earth)", mars: "var(--mars)", moon: "var(--moon)" };
const FG = "var(--fg)", NOTE = "var(--fg-3)";
export const bodyColor = (b: string) => (C as any)[b] ?? "var(--fg-3)";

/** Shaded relief drawn from the same 32 x 32 elevation window the algorithm scores.
 *  `exag` (vertical exaggeration) is shared between panels so reliefs stay comparable. */
export function Relief({ win, stepKm, exag, tint }: { win: number[][]; stepKm: number; exag: number; tint: [number, number, number] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const n = win.length, S = 192;
    cv.width = S; cv.height = S;
    const ctx = cv.getContext("2d")!;
    const img = ctx.createImageData(S, S);
    const z = (x: number, y: number) => {
      const fx = Math.max(0, Math.min(n - 1.001, x)), fy = Math.max(0, Math.min(n - 1.001, y));
      const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
      return win[j][i] * (1 - u) * (1 - v) + win[j][i + 1] * u * (1 - v) + win[j + 1][i] * (1 - u) * v + win[j + 1][i + 1] * u * v;
    };
    const d = (stepKm * 1000 * (n - 1)) / (S - 1);
    const az = (315 * Math.PI) / 180, alt = (38 * Math.PI) / 180;
    const lx = Math.sin(az) * Math.cos(alt), ly = Math.cos(az) * Math.cos(alt), lz = Math.sin(alt);
    let zmin = Infinity, zmax = -Infinity;
    for (const r of win) for (const v of r) { if (v < zmin) zmin = v; if (v > zmax) zmax = v; }
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const x = (px / (S - 1)) * (n - 1), y = (py / (S - 1)) * (n - 1), e = (n - 1) / (S - 1);
        const dzdx = ((z(x + e, y) - z(x - e, y)) / (2 * d)) * exag;
        const dzdy = ((z(x, y - e) - z(x, y + e)) / (2 * d)) * exag;
        const nl = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
        const sh = Math.max(0, (-dzdx * lx - dzdy * ly + lz) / nl);
        const h = zmax > zmin ? (z(x, y) - zmin) / (zmax - zmin) : 0.5;
        const k = (0.34 + 0.76 * sh) * (0.8 + 0.2 * h);
        const o = (py * S + px) * 4;
        img.data[o] = Math.min(255, tint[0] * k);
        img.data[o + 1] = Math.min(255, tint[1] * k);
        img.data[o + 2] = Math.min(255, tint[2] * k);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [win, stepKm, exag, tint]);
  return <canvas ref={ref} aria-label="Shaded relief of the terrain analysis window" />;
}

export const TINT: Record<string, [number, number, number]> = { earth: [206, 214, 190], mars: [236, 188, 152], moon: [200, 218, 230] };

export function reliefExag(a: number[][], b: number[][]) {
  const range = (w: number[][]) => { let lo = Infinity, hi = -Infinity; for (const r of w) for (const v of r) { lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; };
  const r = Math.max(range(a), range(b), 1);
  return Math.max(1, Math.min(60, Math.round(9000 / r)));
}

function ticks(lo: number, hi: number, n = 4) {
  const span = hi - lo || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** West–east elevation profiles through both window centres, each relative to its own mean, same vertical scale. */
export function ProfileChart({ a, b, stepKm, la, lb, cb }: { a: number[]; b: number[]; stepKm: number; la: string; lb: string; cb: string }) {
  const W = 520, H = 170, L = 44, R = 8, T = 8, B = 24;
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const ra = a.map((v) => v - mean(a)), rb = b.map((v) => v - mean(b));
  const lo = Math.min(...ra, ...rb), hi = Math.max(...ra, ...rb);
  const pad = (hi - lo) * 0.08 || 10;
  const y = (v: number) => T + (H - T - B) * (1 - (v - (lo - pad)) / (hi - lo + 2 * pad));
  const x = (i: number, n: number) => L + ((W - L - R) * i) / (n - 1);
  const path = (v: number[]) => v.map((p, i) => `${i ? "L" : "M"}${x(i, v.length).toFixed(1)},${y(p).toFixed(1)}`).join("");
  const km = (a.length - 1) * stepKm;
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Elevation profiles">
        {ticks(lo, hi).map((t) => (<g key={t}><line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} /><text x={L - 6} y={y(t) + 3} textAnchor="end">{t}</text></g>))}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (<text key={f} x={L + (W - L - R) * f} y={H - 7} textAnchor="middle">{Math.round(km * f)}</text>))}
        <text x={W - R} y={H - 7} textAnchor="end" dx={0} dy={-12}>km →</text>
        <text x={4} y={T + 6}>m</text>
        <path d={path(rb)} fill="none" stroke={cb} strokeWidth={1.6} />
        <path d={path(ra)} fill="none" stroke={C.earth} strokeWidth={1.6} />
      </svg>
      <div className="lg"><span style={{ ["--c" as any]: C.earth }}>{la}</span><span style={{ ["--c" as any]: cb }}>{lb}</span><span style={{ ["--c" as any]: "transparent" }}>elevation relative to each window's mean</span></div>
    </>
  );
}

/** Slope distributions as quantile curves (log axis): the comparison the terrain score is built on. */
export function SlopeChart({ qa, qb, qs, la, lb, cb }: { qa: number[]; qb: number[]; qs: number[]; la: string; lb: string; cb: string }) {
  const W = 520, H = 170, L = 44, R = 8, T = 8, B = 24;
  const lg = (v: number) => Math.log10(Math.max(v, 0.02));
  const all = [...qa, ...qb].map(lg);
  const lo = Math.floor(Math.min(...all) * 2) / 2, hi = Math.ceil(Math.max(...all) * 2) / 2;
  const y = (v: number) => T + (H - T - B) * (1 - (lg(v) - lo) / (hi - lo || 1));
  const x = (q: number) => L + ((W - L - R) * (q - 5)) / 95;
  const path = (v: number[]) => v.map((p, i) => `${i ? "L" : "M"}${x(qs[i]).toFixed(1)},${y(p).toFixed(1)}`).join("");
  const yt = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 40].filter((t) => lg(t) >= lo && lg(t) <= hi);
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Slope distributions">
        {yt.map((t) => (<g key={t}><line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} /><text x={L - 6} y={y(t) + 3} textAnchor="end">{t}°</text></g>))}
        {qs.map((q) => (<text key={q} x={x(q)} y={H - 7} textAnchor="middle">p{q}</text>))}
        <path d={path(qb)} fill="none" stroke={cb} strokeWidth={1.6} />
        <path d={path(qa)} fill="none" stroke={C.earth} strokeWidth={1.6} />
        {qa.map((p, i) => <circle key={i} cx={x(qs[i])} cy={y(p)} r={2.3} fill={C.earth} />)}
        {qb.map((p, i) => <circle key={i} cx={x(qs[i])} cy={y(p)} r={2.3} fill={cb} />)}
      </svg>
      <div className="lg"><span style={{ ["--c" as any]: C.earth }}>{la}</span><span style={{ ["--c" as any]: cb }}>{lb}</span><span style={{ ["--c" as any]: "transparent" }}>slope over a 3.8 km baseline, log scale</span></div>
    </>
  );
}

/** Planetary diurnal temperature curve(s) beside the annual temperature envelope of the Earth site. */
export function ThermalChart({ target, site }: { target: Target; site: Site }) {
  const W = 520, H = 200, L = 44, R = 96, T = 10, B = 24;
  const cb = bodyColor(target.body);
  const f = site.features!;
  const half = (f.t_dtr ?? 0) / 2;
  const eLo = (f.t_cold ?? NaN) - half, eHi = (f.t_warm ?? NaN) + half, eMean = f.t_mean ?? NaN;
  let curves: { label: string; x: number[]; y: number[] }[] = [];
  if (target.climate.kind === "mars") {
    const names: Record<string, string> = { "0": "Ls 0°", "90": "Ls 90°", "180": "Ls 180°", "270": "Ls 270°" };
    curves = Object.entries(target.climate.diurnal_curves).map(([k, v]) => ({ label: names[k] ?? k, x: v.map((_, i) => i), y: v }));
  } else {
    curves = [{ label: "Diviner", x: target.climate.curve_lt, y: target.climate.curve_t }];
  }
  const tv = (k: string) => target.features[k]?.value ?? NaN;
  const pLo = tv("t_min"), pHi = tv("t_max"), pMean = tv("t_mean");
  const ys = [...curves.flatMap((c) => c.y), eLo, eHi, pLo, pHi].filter((v) => Number.isFinite(v));
  const lo = Math.floor(Math.min(...ys) / 20) * 20, hi = Math.ceil(Math.max(...ys) / 20) * 20;
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const x = (h: number) => L + ((W - L - R) * h) / 24;
  const bx = W - R + 26;
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Temperature comparison">
        {ticks(lo, hi, 5).map((t) => (<g key={t}><line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} /><text x={L - 6} y={y(t) + 3} textAnchor="end">{t}</text></g>))}
        {lo < 273.15 && hi > 273.15 && (<g><line x1={L} x2={W - 6} y1={y(273.15)} y2={y(273.15)} stroke={NOTE} strokeDasharray="2 3" /><text x={L + 4} y={y(273.15) - 3}>0 °C</text></g>)}
        {[0, 6, 12, 18, 24].map((h) => (<text key={h} x={x(h)} y={H - 7} textAnchor="middle">{String(h).padStart(2, "0")}h</text>))}
        <text x={4} y={T + 6}>K</text>
        {curves.map((c, i) => (
          <path key={c.label} d={c.y.map((v, k) => `${k ? "L" : "M"}${x(c.x[k]).toFixed(1)},${y(v).toFixed(1)}`).join("")} fill="none" stroke={cb} strokeWidth={1.5} strokeDasharray={target.climate.kind === "mars" ? "5 3" : undefined} opacity={curves.length > 1 ? 0.5 + 0.16 * i : 1} />
        ))}
        {/* envelopes */}
        <line x1={bx} x2={bx} y1={y(pHi)} y2={y(pLo)} stroke={cb} strokeWidth={7} opacity={0.75} />
        <line x1={bx - 7} x2={bx + 7} y1={y(pMean)} y2={y(pMean)} stroke={FG} strokeWidth={1.5} />
        <line x1={bx + 34} x2={bx + 34} y1={y(eHi)} y2={y(eLo)} stroke={C.earth} strokeWidth={7} opacity={0.8} />
        <line x1={bx + 27} x2={bx + 41} y1={y(eMean)} y2={y(eMean)} stroke={FG} strokeWidth={1.5} />
        <text x={bx} y={H - 7} textAnchor="middle">{target.body === "mars" ? "Mars" : "Moon"}</text>
        <text x={bx + 34} y={H - 7} textAnchor="middle">Earth</text>
      </svg>
      <div className="lg">
        <span className={target.climate.kind === "mars" ? "dash" : ""} style={{ ["--c" as any]: cb }}>{target.climate.kind === "mars" ? "Surface temperature through one sol at four seasons (Mars Climate Database: a model, so drawn dashed)" : "Bolometric temperature through one lunar day (Diviner, measured)"}</span>
        <span style={{ ["--c" as any]: C.earth }}>Earth site: coldest-month night to warmest-month day; tick = annual mean</span>
      </div>
    </>
  );
}

export function Pips({ expected, matched, have }: { expected: string[]; matched: string[]; have: (k: string) => boolean }) {
  return (
    <span className="pips" title={expected.map((k) => `${k}: ${matched.includes(k) ? "matched" : have(k) ? "not matched" : "no data"}`).join("\n")}>
      {expected.map((k) => <i key={k} className={matched.includes(k) ? "on" : have(k) ? "" : "na"} />)}
    </span>
  );
}

/** Confidence is always drawn in ink: solid = high, half = moderate, open = low. Never in a similarity colour. */
export function ConfMark({ label, bare = false }: { label: string; bare?: boolean }) {
  return <span className={`conf ${label}`} title={`${label} confidence`}><i aria-hidden="true" />{bare ? <span className="sr">{label} confidence</span> : label}</span>;
}
