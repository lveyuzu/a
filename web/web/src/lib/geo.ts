// Small geodesy and projection helpers shared by the maps. Nothing here invents geography:
// graticules and analysis-window outlines are computed from coordinates, coastlines come from Natural Earth.
import { asset } from "./data";

export const RADIUS_KM: Record<string, number> = { earth: 6371.0088, mars: 3389.5, moon: 1737.4 };
export const D2R = Math.PI / 180;
export const MAXLAT = 85.0511;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number, body = "earth") {
  const a = Math.sin(((lat2 - lat1) * D2R) / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(((lon2 - lon1) * D2R) / 2) ** 2;
  return 2 * RADIUS_KM[body] * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Degrees, minutes, seconds: the form a field sheet uses. */
export function dms(v: number, pos: string, neg: string) {
  const a = Math.abs(v), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), s = Math.round((mf - m) * 60);
  const [dd, mm, ss] = s === 60 ? (m + 1 === 60 ? [d + 1, 0, 0] : [d, m + 1, 0]) : [d, m, s];
  return `${dd}°${String(mm).padStart(2, "0")}′${String(ss).padStart(2, "0")}″${v >= 0 ? pos : neg}`;
}
export const dmsPair = (lat: number, lon: number) => `${dms(lat, "N", "S")} ${dms(lon, "E", "W")}`;
export const ddPair = (lat: number, lon: number, d = 2) =>
  `${Math.abs(lat).toFixed(d)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(d)}°${lon >= 0 ? "E" : "W"}`;

/** Parse "25.4, 39.9", "25.4N 39.9E" or "25°24′N 39°54′E" into a coordinate. */
export function parseCoord(text: string): { lat: number; lon: number } | null {
  const parts = text.trim().toUpperCase().match(/-?\d+(?:\.\d+)?(?:\s*°\s*\d+(?:\.\d+)?\s*[′']?(?:\s*\d+(?:\.\d+)?\s*[″"]?)?)?\s*°?\s*[NSEW]?/g);
  if (!parts || parts.length < 2) return null;
  const one = (p: string) => {
    const nums = p.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    let v = Math.abs(nums[0]) + (nums[1] ?? 0) / 60 + (nums[2] ?? 0) / 3600;
    if (nums[0] < 0 || /[SW]/.test(p)) v = -v;
    return { v, axis: /[NS]/.test(p) ? "lat" : /[EW]/.test(p) ? "lon" : "" };
  };
  const a = one(parts[0]), b = one(parts[1]);
  const lat = a.axis === "lon" ? b.v : a.v, lon = a.axis === "lon" ? a.v : b.v;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Outline of the square analysis window (half-width in km) on a local equal-distance grid. */
export function windowRing(lat: number, lon: number, halfKm: number, body = "earth", n = 12): [number, number][] {
  const dlat = (halfKm / RADIUS_KM[body]) / D2R;
  const ring: [number, number][] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      const la = Math.max(-89.9, Math.min(89.9, lat + y * dlat));
      ring.push([lon + (x * dlat) / Math.max(Math.cos(la * D2R), 0.02), la]);
    }
  };
  edge(-1, -1, 1, -1); edge(1, -1, 1, 1); edge(1, 1, -1, 1); edge(-1, 1, -1, -1);
  ring.push(ring[0]);
  return ring;
}

/** The 0.25° grid cell that contains a coordinate, as a ring and its centre. */
export function cellOf(lat: number, lon: number, deg: number) {
  const r = Math.max(0, Math.min(180 / deg - 1, Math.floor((90 - lat) / deg)));
  const c = (((Math.floor((lon + 180) / deg)) % (360 / deg)) + 360 / deg) % (360 / deg);
  const n = 90 - r * deg, s = n - deg, w = -180 + c * deg, e = w + deg;
  return { lat: (n + s) / 2, lon: (w + e) / 2, ring: [[w, s], [e, s], [e, n], [w, n], [w, s]] as [number, number][] };
}

/** Graticule as GeoJSON lines. `step` in degrees; each line carries its value for styling. */
export function graticule(step: number) {
  const feats: any[] = [];
  for (let lon = -180; lon < 180; lon += step) {
    const c: [number, number][] = [];
    for (let lat = -85; lat <= 85; lat += 2.5) c.push([lon, lat]);
    feats.push({ type: "Feature", properties: { v: lon, major: lon % 30 === 0 ? 1 : 0 }, geometry: { type: "LineString", coordinates: c } });
  }
  for (let lat = -80; lat <= 80; lat += step) {
    const c: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += 2.5) c.push([lon, lat]);
    feats.push({ type: "Feature", properties: { v: lat, major: lat % 30 === 0 ? 1 : 0, eq: lat === 0 ? 1 : 0 }, geometry: { type: "LineString", coordinates: c } });
  }
  return { type: "FeatureCollection", features: feats };
}

/* ---------------------------------------------------------------- reference vectors (Natural Earth) */
export interface Region { name: string; cls: string; rank: number; lon: number; lat: number }
let landP: Promise<number[][]> | null = null, regionsP: Promise<Region[]> | null = null;
export const loadLand = () => (landP ??= fetch(asset("data/ref/land110.json")).then((r) => (r.ok ? r.json() : [])).catch(() => []));
export const loadRegions = () => (regionsP ??= fetch(asset("data/ref/regions.json")).then((r) => (r.ok ? r.json() : [])).catch(() => []));
export const COAST_URL = () => asset("data/ref/coast50.geojson");
export const BORDERS_URL = () => asset("data/ref/borders50.geojson");

/* ---------------------------------------------------------------- small-scale projections for SVG maps */
/** Orthographic projection centred on (lat0, lon0). Returns null for points on the far side. */
export function ortho(lat: number, lon: number, lat0: number, lon0: number): [number, number] | null {
  const p = lat * D2R, l = (lon - lon0) * D2R, p0 = lat0 * D2R;
  const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
  if (cosc < 0) return null;
  return [Math.cos(p) * Math.sin(l), -(Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l))];
}

/** Equal Earth projection (Šavrič, Patterson, Jenny 2018): equal-area, made for world thematic maps. */
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
export function equalEarth(lat: number, lon: number): [number, number] {
  const t = Math.asin(M * Math.sin(lat * D2R)), t2 = t * t, t6 = t2 * t2 * t2;
  const x = (lon * D2R * Math.cos(t)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [x, -y];
}
export const EE_W = 2.7066, EE_H = 1.3173; // half-extents of the projected world

/** Nice round length (1, 2 or 5 × 10ⁿ) not longer than `max`. */
export function niceLength(max: number) {
  const mag = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / mag;
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * mag;
}
