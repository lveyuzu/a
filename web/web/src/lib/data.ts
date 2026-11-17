// Types and loader for the pipeline output in /public/data. Nothing here is synthetic:
// every number the UI shows is read from these files, which the Python pipeline writes.

export type Body = "mars" | "moon";
export type FactorId = "terrain" | "thermal" | "aridity" | "surface" | "atmosphere" | "ice" | "geology";

export interface Measured {
  value: number | null;
  unit: string;
  source: string;
  kind: "measured" | "model" | "literature" | "definition";
  note: string;
}

export interface Target {
  id: string;
  body: Body;
  name: string;
  sub: string;
  lat: number;
  lon: number;
  ice: boolean;
  mission: string;
  geology: string[];
  geology_assessable: string[];
  geology_note: string;
  geology_ref: string;
  features: Record<string, Measured>;
  slope_q: number[];
  terrain_spread: Record<string, [number, number]>;
  window: number[][];
  profile: number[];
  factors: FactorId[];
  grid: Partial<Record<FactorId, string>>;
  sensitivity: { rho_mean: number; rho_min: number };
  climate:
    | { kind: "mars"; diurnal_curves: Record<string, number[]>; seasonal_mean: number[]; ls: number[] }
    | { kind: "moon"; curve_lt: number[]; curve_t: number[]; polar: null | Record<string, number | null> };
}

export interface Confidence {
  value: number;
  coverage: number;
  evidence: number;
  stability: number;
  label: "high" | "moderate" | "low";
  pct_p10: number | null;
  pct_p50: number | null;
  pct_p90: number | null;
  top1: number | null;
  top5: number | null;
}

export interface SiteScore {
  f: Record<string, number | null>;
  fac: Partial<Record<FactorId, number | null>>;
  geo: { target: string; match: string | null; affinity: number }[];
  overall: Record<string, number | null>;
  cov: Record<string, number>;
  pct: Record<string, number | null>;
  matched: FactorId[];
  expected: FactorId[];
  conf: Confidence;
}

export interface GeoUnit { name: string; lith: string; descrip: string; age: string; scale: string; ref: string }

export interface Site {
  id: string;
  kind: "known" | "candidate";
  name: string;
  lat: number;
  lon: number;
  place?: { region: string | null; admin1: string | null; country: string | null };
  known?: { note: string; ref: string; basis: string[]; for_: string[] };
  found: [string, string, number][];
  probe?: string[];
  nearest_known?: { km: number; name: string };
  geology: null | { classes: string[]; units: GeoUnit[]; n_units: number; best_scale: string | null };
  window: number[][];
  profile: number[];
  features: (Record<string, number | null> & { slope_q?: any }) | null;
  sources?: { thermal: string; albedo: string; precip: string };
  scores: Record<string, SiteScore>;
}

export interface FeatureDef {
  id: string;
  factor: FactorId;
  method: "distribution" | "direct" | "direct_log" | "gap" | "gap_log" | "proxy_cryo" | "proxy_frozen";
  target: string | null;
  label: string;
  unit: string;
  earth_kind: string;
}

export interface Dataset {
  id: string; body: string; name: string; agency: string; kind: string; measures: string; resolution: string;
  temporal: string; coverage: string; format: string; url: string; citation: string; used_for: string; limits: string;
}

export interface Meta {
  generated: string;
  grid: { deg: number; nlat: number; nlon: number; land_cells: number };
  window: { n: number; step_km: number; size_km: number };
  factors: { id: FactorId; label: string }[];
  features: FeatureDef[];
  profiles: Record<string, { label: string; blurb: string; w: Record<FactorId, number> }>;
  params: { tol_k: number; precip_floor: number; agg: string; floor: number; match_threshold: number };
  earth_ref: Record<string, { median: number; sigma: number }>;
  slope_q: number[];
  geology: { labels: Record<string, string>; affinity: Record<string, Record<string, number>>; unassessed: string[] };
  evidence_grade: Record<string, number>;
  datasets: Dataset[];
  limitations: { title: string; body: string }[];
  counts: { sites: number; known: number; candidates: number; targets: number };
  sensitivity: { runs: number; description: string };
}

export interface ValSummary { n: number; mean_u: number; median_u: number; top1: number; top5: number; top10: number; top25: number; z: number; p: number }
export interface Validation {
  rows: { id: string; name: string; basis: string[]; env: boolean; best_target: string; best_pct: number; u: number;
          any_target: string; any_profile: string; any_pct: number; u_any: number; found: boolean;
          found_as: { target: string; profile: string; rank: number }[] }[];
  env: { balanced: ValSummary; any: ValSummary };
  other: { balanced: ValSummary; any: ValSummary };
  sensitivity: Record<string, { rho_mean: number; rho_min: number }>;
  n_runs: number;
  note: string;
}

export interface Portfolio {
  threshold: number;
  n_requirements: number;
  n_covered: number;
  chosen: { id: string; name: string; gain: [string, FactorId][]; total: number }[];
  best: Record<string, { score: number; site: string; name: string; covered: boolean }>;
  requirements: [string, FactorId][];
}

export interface Finding {
  id: string; site: string; target: string; headline: string; summary: string; why: string;
  differences: string[]; literature: { claim: string; source: string; url?: string }[]; novelty: string; uses: string[];
}

export interface Imagery { footprint_km: number; targets: Record<string, string>; sites: Record<string, boolean>; site_credit: string }

export interface Bundle {
  meta: Meta; targets: Target[]; sites: Site[]; validation: Validation; portfolio: Portfolio; findings: Finding[]; imagery: Imagery;
}

const base = import.meta.env.BASE_URL;
export const asset = (p: string) => `${base}${p}`;

async function get<T>(name: string, fallback?: T): Promise<T> {
  const r = await fetch(asset(`data/${name}`));
  if (!r.ok) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Could not load data/${name} (${r.status})`);
  }
  return r.json();
}

export async function loadBundle(): Promise<Bundle> {
  const [meta, targets, sites, validation, portfolio, findings, imagery] = await Promise.all([
    get<Meta>("meta.json"), get<Target[]>("targets.json"), get<Site[]>("sites.json"), get<Validation>("validation.json"),
    get<Portfolio>("portfolio.json"), get<Finding[]>("findings.json", []),
    get<Imagery>("imagery.json", { footprint_km: 60.8, targets: {}, sites: {}, site_credit: "" }),
  ]);
  return { meta, targets, sites: sites.filter((s) => s.features), validation, portfolio, findings, imagery };
}

/** Decode one factor raster (8-bit PNG: 0 = no data, 1..255 -> score 0..1) into a Float32Array. */
export async function loadGrid(path: string, w: number, h: number): Promise<Float32Array> {
  const img = new Image();
  img.src = asset(`data/${path}`);
  await img.decode();
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const v = px[i * 4];
    out[i] = v === 0 ? NaN : (v - 1) / 254;
  }
  return out;
}
