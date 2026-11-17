// Live acquisition search against the Copernicus Data Space Ecosystem STAC catalogue.
// Searching is open and needs no account or key; only downloading the products does, and the app never downloads them.
// The result is a list of what Sentinel-1 and Sentinel-2 actually recorded over a site: metadata, not measurements.

const STAC = "https://stac.dataspace.copernicus.eu/v1/search";

export interface Scene {
  id: string;
  date: string;          // ISO date (UTC)
  time: string;          // HH:MM UTC
  platform: string;
  kind: "optical" | "radar";
  cloud?: number;        // percent, optical only
  sunElevation?: number; // degrees, optical only
  orbit?: string;        // ascending / descending
  relOrbit?: number;
  mode?: string;         // radar instrument mode
  pols?: string[];       // radar polarisations
  incidence?: number;    // degrees
}

function parse(f: any, kind: Scene["kind"]): Scene {
  const p = f.properties ?? {}, dt = String(p.datetime ?? p.start_datetime ?? "");
  return {
    id: f.id, date: dt.slice(0, 10), time: dt.slice(11, 16), platform: String(p.platform ?? "").replace("sentinel-", "Sentinel-").toUpperCase().replace("SENTINEL-", "Sentinel-"),
    kind, cloud: p["eo:cloud_cover"], sunElevation: p["view:sun_elevation"], orbit: p["sat:orbit_state"], relOrbit: p["sat:relative_orbit"],
    mode: p["sar:instrument_mode"], pols: p["sar:polarizations"], incidence: p["view:incidence_angle"],
  };
}

async function search(params: Record<string, string>, signal: AbortSignal) {
  const r = await fetch(`${STAC}?${new URLSearchParams(params)}`, { signal, headers: { Accept: "application/geo+json" } });
  if (!r.ok) throw new Error(`Copernicus catalogue answered ${r.status}`);
  return (await r.json()).features ?? [];
}

/** Latest low-cloud Sentinel-2 scenes and latest Sentinel-1 scenes that cover a point. One scene per day. */
export async function recentScenes(lat: number, lon: number, signal: AbortSignal): Promise<{ optical: Scene[]; radar: Scene[] }> {
  const d = 0.02, bbox = [lon - d, lat - d, lon + d, lat + d].map((v) => v.toFixed(4)).join(",");
  const [s2, s1] = await Promise.all([
    search({ collections: "sentinel-2-l2a", bbox, limit: "24", sortby: "-datetime", filter: "eo:cloud_cover<15", "filter-lang": "cql2-text" }, signal),
    search({ collections: "sentinel-1-grd", bbox, limit: "16", sortby: "-datetime" }, signal),
  ]);
  const perDay = (xs: Scene[], n: number) => { const seen = new Set<string>(); return xs.filter((s) => s.date && !seen.has(s.date) && seen.add(s.date)).slice(0, n); };
  return { optical: perDay(s2.map((f: any) => parse(f, "optical")), 6), radar: perDay(s1.map((f: any) => parse(f, "radar")), 5) };
}

/** Link that opens the Copernicus Browser at a place and date, for readers who want the full-resolution product. */
export function browserLink(lat: number, lon: number, date: string, kind: Scene["kind"]) {
  const ds = kind === "radar" ? "S1_CDAS_IW_VVVH" : "S2_L2A_CDAS";
  return `https://browser.dataspace.copernicus.eu/?zoom=10&lat=${lat.toFixed(4)}&lng=${lon.toFixed(4)}&datasetId=${ds}&fromTime=${date}T00%3A00%3A00.000Z&toTime=${date}T23%3A59%3A59.999Z`;
}
