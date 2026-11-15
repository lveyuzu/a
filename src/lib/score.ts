// Client-side mirror of pipeline/score.py `combine`: lets users re-weight factors live.
// Feature and factor scores are computed in Python; only the final aggregation runs here.
import type { FactorId, Site, Target } from "./data";

export type Weights = Record<FactorId, number>;
const FLOOR = 0.02;

export function combine(fac: Partial<Record<FactorId, number | null>>, expected: FactorId[], w: Weights) {
  let num = 0, den = 0, wtot = 0;
  for (const k of expected) {
    const wk = w[k] ?? 0;
    if (wk <= 0) continue;
    wtot += wk;
    const s = fac[k];
    if (s == null || Number.isNaN(s)) continue;
    num += wk * Math.log(Math.max(s, FLOOR));
    den += wk;
  }
  return { overall: den > 0 ? Math.exp(num / den) : NaN, coverage: wtot > 0 ? den / wtot : 0 };
}

export function siteOverall(site: Site, target: Target, w: Weights) {
  const sc = site.scores[target.id];
  if (!sc) return { overall: NaN, coverage: 0 };
  return combine(sc.fac, sc.expected, w);
}

/** Overall score for every grid cell (stage-1 factors only; geology is a site-tier factor). */
export function gridOverall(grids: Partial<Record<FactorId, Float32Array>>, expected: FactorId[], w: Weights, n: number) {
  const out = new Float32Array(n);
  const keys = expected.filter((k) => grids[k] && (w[k] ?? 0) > 0);
  const arrs = keys.map((k) => grids[k]!);
  const ws = keys.map((k) => w[k]);
  for (let i = 0; i < n; i++) {
    let num = 0, den = 0;
    for (let j = 0; j < arrs.length; j++) {
      const s = arrs[j][i];
      if (s !== s) continue;
      num += ws[j] * Math.log(s > FLOOR ? s : FLOOR);
      den += ws[j];
    }
    out[i] = den > 0 ? Math.exp(num / den) : NaN;
  }
  return out;
}

/** Area-weighted score distribution of the land grid: percentile lookup + display stretch. */
export function distribution(grid: Float32Array, w: number, h: number) {
  const BINS = 2000;
  const hist = new Float64Array(BINS);
  let total = 0;
  for (let r = 0; r < h; r++) {
    const a = Math.cos(((90 - (r + 0.5) * (180 / h)) * Math.PI) / 180);
    for (let c = 0; c < w; c++) {
      const v = grid[r * w + c];
      if (v !== v) continue;
      hist[Math.min(BINS - 1, Math.floor(v * BINS))] += a;
      total += a;
    }
  }
  const cum = new Float64Array(BINS);
  let acc = 0;
  for (let i = 0; i < BINS; i++) { acc += hist[i]; cum[i] = acc / (total || 1); }
  const pct = (v: number) => (v !== v ? NaN : 100 * (cum[Math.max(0, Math.min(BINS - 1, Math.floor(v * BINS)) - 1)] ?? 0));
  const quantile = (q: number) => { let i = 0; while (i < BINS - 1 && cum[i] < q) i++; return (i + 0.5) / BINS; };
  return { pct, quantile, hist, total };
}
export type Distribution = ReturnType<typeof distribution>;

// ---- display classes ----
// The map shows the best-scoring 30% of land, cut into five classes by share of land area.
// Classes are a display choice only: scores, ranks and percentiles are untouched.
export const CLASS_TOPS = [30, 10, 3, 1, 0.1];
export interface ScoreClass { lo: number; hi: number; top: number; next: number; label: string }
export function scoreClasses(d: Distribution): ScoreClass[] {
  const cut = CLASS_TOPS.map((t) => d.quantile(1 - t / 100));
  const max = Math.max(d.quantile(0.99999), cut[cut.length - 1]);
  return CLASS_TOPS.map((t, i) => {
    const next = CLASS_TOPS[i + 1] ?? 0;
    return { lo: cut[i], hi: i + 1 < cut.length ? cut[i + 1] : max, top: t, next, label: next ? `top ${t}–${next}%` : `top ${t}%` };
  });
}
/** Coarse histogram of the land-area score distribution, for the legend. */
export function histogram(d: Distribution, lo: number, hi: number, n: number) {
  const out = new Array(n).fill(0), B = d.hist.length;
  for (let i = 0; i < B; i++) {
    const v = (i + 0.5) / B;
    if (v < lo || v >= hi) continue;
    out[Math.min(n - 1, Math.floor(((v - lo) / (hi - lo)) * n))] += d.hist[i];
  }
  const m = Math.max(...out, 1e-12);
  return out.map((x) => x / m);
}

export function cellValue(grid: Float32Array, w: number, h: number, lat: number, lon: number) {
  const r = Math.max(0, Math.min(h - 1, Math.floor((90 - lat) / (180 / h))));
  const c = ((Math.floor((lon + 180) / (360 / w)) % w) + w) % w;
  return grid[r * w + c];
}

// ---- colour ramps ----
// One ramp per body, ordered in lightness so it survives greyscale and colour-blind viewing.
// Every basemap in the observatory is dark, so the strongest match is always the brightest cell.
//   mars   oxblood -> copper -> apricot -> ivory
//   moon   slate teal -> ice blue -> near white (the low end stays clear of the navy sea)
type Stop = [number, number, number];
const RAMPS: Record<string, Stop[]> = {
  mars: [[62, 26, 24], [106, 40, 30], [160, 66, 38], [208, 104, 56], [236, 152, 96], [247, 198, 148], [253, 236, 208]],
  moon: [[34, 60, 68], [44, 90, 106], [58, 126, 148], [86, 164, 190], [138, 200, 224], [198, 230, 242], [244, 250, 252]],
};
export const rampFor = (body: string) => (RAMPS[body] ? body : "mars");
export function ramp(name: string, t: number): Stop {
  const st = RAMPS[name] ?? RAMPS.mars;
  const x = Math.max(0, Math.min(1, t)) * (st.length - 1);
  const i = Math.min(st.length - 2, Math.floor(x));
  const f = x - i;
  return [0, 1, 2].map((k) => Math.round(st[i][k] + (st[i + 1][k] - st[i][k]) * f)) as Stop;
}
export const rampCss = (name: string, t: number) => { const [r, g, b] = ramp(name, t); return `rgb(${r},${g},${b})`; };
export const rampGradient = (name: string) =>
  `linear-gradient(90deg, ${[0, 0.17, 0.33, 0.5, 0.67, 0.83, 1].map((t) => rampCss(name, t)).join(",")})`;

// ---- formatting ----
export const fmt = (v: number | null | undefined, d = 2) => (v == null || Number.isNaN(v) ? "—" : v.toFixed(d));
export const pctFmt = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : `${Math.round(v * 100)}`);
export function fmtCoord(lat: number, lon: number) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}  ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
}
export function smart(v: number | null | undefined, unit = "") {
  if (v == null || Number.isNaN(v)) return "—";
  const a = Math.abs(v);
  const s = a >= 1000 ? v.toFixed(0) : a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(3);
  return unit ? `${s} ${unit}` : s;
}
