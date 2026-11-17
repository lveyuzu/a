import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Site } from "../lib/data";
import { ramp, type ScoreClass } from "../lib/score";
import { ATLAS_DEM, earthLayer, tileUrl, type MapLayerDef } from "../lib/layers";
import { BORDERS_URL, COAST_URL, MAXLAT, cellOf, graticule, haversineKm, loadRegions, niceLength, parseCoord, type Region } from "../lib/geo";

const CORNERS: [[number, number], [number, number], [number, number], [number, number]] = [[-180, MAXLAT], [180, MAXLAT], [180, -MAXLAT], [-180, -MAXLAT]];
// A fully transparent pixel: what the similarity source holds until the first grid is painted.
const BLANK = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGBgAAAABQABeqhXUAAAAABJRU5ErkJggg==";
export const HOME = { center: [72, 30] as [number, number], zoom: 1.9 };
/** Whole-Earth view sized to the frame: the globe is fitted beside the legend rather than under it. */
export function homeView(c: HTMLElement) {
  // the title block sits top left inside the neatline; the globe is fitted beside and below it
  const wide = c.clientWidth > 620;
  const padding = wide ? { left: 96, top: 64, right: 0, bottom: 0 } : { left: 0, top: 64, right: 0, bottom: 0 };
  const d = Math.min(c.clientWidth - padding.left, c.clientHeight - padding.top) * 0.9;
  // globe diameter is about 0.89 x 512 x 2^zoom / pi pixels when centred at 30 degrees latitude
  return { center: HOME.center, zoom: Math.max(0.7, Math.min(2.6, Math.log2((d * Math.PI) / 456))), padding };
}

/* ------------------------------------------------------------------ shared atlas style pieces */
// FG is the chalk used for line work and symbols, BG the plate ground used for halos. Same values as --chalk and --plate in styles.css.
export const FG = "#E8EAEE", BG = "#050608", SEA = "#0A1630";
/** Symbol colours for lists outside the map (ranked list): the same chalk on the page's black. */
export const INK = "#E8EAEE", PAPER = "#08090B";

/** Hypsometric tint in graphite tones on a navy sea, lighter with altitude. Stops are metres. */
const TINT: any[] = ["interpolate", ["linear"], ["elevation"],
  -9000, "#030914", -200, "#071126", -1, SEA, 0, "#25292F", 500, "#2A2E34", 1500, "#32353A", 3000, "#3A3C40", 4500, "#444548", 6000, "#525356", 8000, "#66676A"];

/** Sources and layers of the "Atlas relief" basemap, reused by every Earth map in the app. */
export function atlasStyleParts() {
  const dem = () => ({ type: "raster-dem", tiles: [ATLAS_DEM.tiles], tileSize: 256, maxzoom: ATLAS_DEM.maxzoom, encoding: "terrarium", attribution: ATLAS_DEM.attribution });
  return {
    sources: { "dem-tint": dem(), "dem-shade": dem() } as Record<string, any>,
    layers: [
      { id: "bg", type: "background", paint: { "background-color": SEA } },
      { id: "relief-tint", type: "color-relief", source: "dem-tint", paint: { "color-relief-color": TINT } },
      { id: "relief-shade", type: "hillshade", source: "dem-shade", paint: { "hillshade-shadow-color": "#000000", "hillshade-highlight-color": "#A3AFBF", "hillshade-accent-color": "#05070C", "hillshade-exaggeration": ["interpolate", ["linear"], ["zoom"], 1, 0.75, 5, 0.55, 8, 0.65, 11, 0.8], "hillshade-illumination-direction": 315 } },
    ] as any[],
  };
}

/** Graticule, coastline and border layers, drawn in chalk: every basemap is dark. */
export function addReferenceLayers(m: maplibregl.Map, before?: string) {
  m.addSource("graticule", { type: "geojson", data: graticule(10) as any });
  m.addLayer({ id: "graticule", type: "line", source: "graticule", filter: ["any", ["==", ["get", "major"], 1], [">=", ["zoom"], 3.2]],
    paint: { "line-color": FG, "line-opacity": ["case", ["==", ["get", "major"], 1], 0.16, 0.08], "line-width": ["case", ["==", ["get", "eq"], 1], 0.9, 0.5] } }, before);
  m.addSource("borders", { type: "geojson", data: BORDERS_URL() });
  m.addLayer({ id: "borders", type: "line", source: "borders", minzoom: 2.2, paint: { "line-color": FG, "line-opacity": 0.26, "line-width": 0.6, "line-dasharray": [3, 2] } }, before);
  m.addSource("coast", { type: "geojson", data: COAST_URL() });
  m.addLayer({ id: "coast", type: "line", source: "coast", paint: { "line-color": FG, "line-opacity": 0.5, "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.55, 6, 1] } }, before);
}

/** Put a raster layer in a named slot (or clear the slot). Slots keep the drawing order fixed. */
export function setRasterSlot(m: maplibregl.Map, slot: string, def: MapLayerDef | null, date: string, paint: Record<string, any> = {}) {
  if (m.getLayer(slot)) m.removeLayer(slot);
  if (m.getSource(slot)) m.removeSource(slot);
  if (!def) return;
  m.addSource(slot, { type: "raster", tiles: [tileUrl(def, date)], tileSize: 256, maxzoom: def.maxzoom, attribution: def.attribution });
  m.addLayer({ id: slot, type: "raster", source: slot, paint: { "raster-fade-duration": 120, ...paint } }, `slot-${slot}`);
}

/* ------------------------------------------------------------------ similarity raster */
/** Paint the 0.25° score grid into a Web-Mercator canvas (rows resampled by latitude, cells kept square-edged). */
function renderHeat(grid: Float32Array, w: number, h: number, rampName: string, classes: ScoreClass[] | null, lo: number, hi: number) {
  const H = 1440;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = H;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(w, H);
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    let t = i / 255;
    if (classes) { // snap to the class the value falls in: five flat steps
      const v = lo + t * (hi - lo);
      let k = 0;
      while (k < classes.length - 1 && v >= classes[k + 1].lo) k++;
      t = (k + 0.5) / classes.length;
    }
    const [r, g, b] = ramp(rampName, 0.04 + 0.96 * t);
    lut[i * 4] = r; lut[i * 4 + 1] = g; lut[i * 4 + 2] = b; lut[i * 4 + 3] = classes ? 218 : 255 * (0.55 + 0.45 * t);
  }
  const span = hi - lo || 1;
  let painted = 0;
  for (let y = 0; y < H; y++) {
    const my = Math.PI * (1 - (2 * (y + 0.5)) / H);
    const lat = (Math.atan(Math.sinh(my)) * 180) / Math.PI;
    const sr = Math.min(h - 1, Math.max(0, Math.floor((90 - lat) / (180 / h))));
    for (let x = 0; x < w; x++) {
      const v = grid[sr * w + x];
      if (v !== v || v < lo) continue;
      const k = Math.min(255, Math.floor(((v - lo) / span) * 255)) * 4, o = (y * w + x) * 4;
      img.data[o] = lut[k]; img.data[o + 1] = lut[k + 1]; img.data[o + 2] = lut[k + 2]; img.data[o + 3] = lut[k + 3];
      painted++;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: cv, painted };
}

/* ------------------------------------------------------------------ site symbols */
// Shape says what the site is; fill says how far to trust it. Colour is left to the similarity layer.
//   circle = candidate from the scan      square = established analog
//   solid = high confidence   half = moderate   open = low
export function siteSymbol(kind: "known" | "candidate", conf: string, px = 15, FG_ = FG, BG_ = BG): string {
  const FG = FG_, BG = BG_;
  const s = px, c = s / 2, r = s / 2 - 2.2;
  const shape = (fill: string) => kind === "known"
    ? `<rect x="${c - r}" y="${c - r}" width="${2 * r}" height="${2 * r}" fill="${fill}" stroke="${FG}" stroke-width="1.5"/>`
    : `<circle cx="${c}" cy="${c}" r="${r}" fill="${fill}" stroke="${FG}" stroke-width="1.5"/>`;
  const halo = kind === "known"
    ? `<rect x="${c - r - 1.6}" y="${c - r - 1.6}" width="${2 * r + 3.2}" height="${2 * r + 3.2}" fill="${BG}"/>`
    : `<circle cx="${c}" cy="${c}" r="${r + 1.7}" fill="${BG}"/>`;
  const half = `<clipPath id="h"><rect x="0" y="${c}" width="${s}" height="${c}"/></clipPath>`;
  const body = conf === "high" ? shape(FG) : conf === "moderate" ? shape(BG) + `<g clip-path="url(#h)">${shape(FG)}</g>` : shape(BG);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${half}${halo}${body}</svg>`;
}
async function addSiteImages(m: maplibregl.Map) {
  await Promise.all((["known", "candidate"] as const).flatMap((kind) => ["high", "moderate", "low"].map(async (conf) => {
    const img = new Image(30, 30);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(siteSymbol(kind, conf, 30));
    await img.decode();
    if (!m.hasImage(`${kind}-${conf}`)) m.addImage(`${kind}-${conf}`, img, { pixelRatio: 2 });
  })));
}

/* ------------------------------------------------------------------ cursor probe (kept out of React state) */
export interface Probe { lat: number; lon: number; pinned: boolean }
function createStore<T>(v: T) {
  let cur = v; const subs = new Set<() => void>();
  return { get: () => cur, set: (n: T) => { cur = n; subs.forEach((f) => f()); }, sub: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; } };
}
export const probeStore = createStore<Probe | null>(null);
export const useProbe = () => useSyncExternalStore(probeStore.sub, probeStore.get);

/* ------------------------------------------------------------------ scale bar, valid for any body radius */
export function ScaleBar({ map, body = "earth" }: { map: maplibregl.Map | null; body?: string }) {
  const bar = useRef<HTMLDivElement>(null), txt = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!map) return;
    const upd = () => {
      const c = map.getContainer(), cx = c.clientWidth / 2, cy = c.clientHeight / 2;
      const a = map.unproject([cx - 50, cy]), b = map.unproject([cx + 50, cy]);
      const kmPerPx = haversineKm(a.lat, a.lng, b.lat, b.lng, body) / 100;
      if (!bar.current || !txt.current || !(kmPerPx > 0)) return;
      const len = niceLength(kmPerPx * 120);
      bar.current.style.width = `${len / kmPerPx}px`;
      txt.current.textContent = len >= 1 ? `${len.toLocaleString("en-US")} km` : `${Math.round(len * 1000)} m`;
    };
    upd();
    map.on("move", upd); map.on("resize", upd);
    return () => { map.off("move", upd); map.off("resize", upd); };
  }, [map, body]);
  return <div className="scalebar" title="Ground distance at the centre of the map"><div ref={bar} className="scalebar-rule" /><span ref={txt} /></div>;
}

/** Says so while tiles are on their way, so a blank patch is never mistaken for missing data. */
export function MapBusy({ map }: { map: maplibregl.Map | null }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!map) return;
    let t = 0;
    const on = () => { clearTimeout(t); t = window.setTimeout(() => setBusy(true), 350); };
    const off = () => { clearTimeout(t); setBusy(false); };
    map.on("dataloading", on); map.on("idle", off);
    return () => { clearTimeout(t); map.off("dataloading", on); map.off("idle", off); };
  }, [map]);
  return busy ? <div className="mapbusy" role="status">Loading map tiles</div> : null;
}

/** Stars behind the globe, drawn once from a fixed seed on two canvases; the second one breathes slowly,
 *  so a few stars appear to twinkle. They exist only to set the Earth off; in flat view the map covers them. */
function StarField() {
  const a = useRef<HTMLCanvasElement>(null), b = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      for (const [cv, seed, n] of [[a.current, 7, 900], [b.current, 31, 260]] as const) {
        if (!cv) continue;
        const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
        cv.width = w * dpr; cv.height = h * dpr;
        const ctx = cv.getContext("2d")!;
        ctx.scale(dpr, dpr);
        let x = seed;
        const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
        const count = Math.round((n * w * h) / (1400 * 900));
        for (let i = 0; i < count; i++) {
          const px = rnd() * w, py = rnd() * h, m = rnd(), r = m > 0.982 ? 1.9 : m > 0.92 ? 1.3 : 0.6 + rnd() * 0.5;
          const tint = rnd() < 0.18 ? "200,216,255" : rnd() < 0.08 ? "255,232,210" : "236,240,248";
          ctx.fillStyle = `rgba(${tint},${0.75 + rnd() * 0.25})`;
          ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
          if (r > 1.1) { // the brightest few get a soft halo
            const g = ctx.createRadialGradient(px, py, 0, px, py, r * 6);
            g.addColorStop(0, `rgba(${tint},0.5)`); g.addColorStop(1, `rgba(${tint},0)`);
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r * 6, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    if (a.current) ro.observe(a.current);
    return () => ro.disconnect();
  }, []);
  return <div className="stars" aria-hidden="true"><canvas ref={a} /><canvas ref={b} className="twinkle" /><i className="halo" /></div>;
}

/** The neatline: a ruled inner frame with ticks and corner crosses, as on a survey plate. */
function Fiducials() {
  return <div className="fiducials" aria-hidden="true"><i /><i /><i /><i /></div>;
}

/** Live readout of where the map is pointed: centre, zoom and projection, in the corner of the plate. */
function CentreReadout({ map, flat }: { map: maplibregl.Map | null; flat: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!map) return;
    const upd = () => {
      const c = map.getCenter(), el = ref.current;
      if (!el) return;
      const lat = Math.abs(c.lat).toFixed(1) + "°" + (c.lat >= 0 ? "N" : "S");
      const lng = ((c.lng + 540) % 360) - 180, lon = Math.abs(lng).toFixed(1) + "°" + (lng >= 0 ? "E" : "W");
      el.querySelector("[data-c]")!.textContent = `${lat} ${lon}`;
      el.querySelector("[data-z]")!.textContent = map.getZoom().toFixed(1);
    };
    upd();
    map.on("move", upd);
    return () => { map.off("move", upd); };
  }, [map]);
  return (
    <div className="centre" ref={ref} aria-hidden="true">
      <span>Centre <b data-c className="num">—</b></span>
      <span>Zoom <b data-z className="num">—</b></span>
      <span>{flat ? "Web Mercator" : "Globe"}</span>
    </div>
  );
}

export function NorthArrow() {
  return (
    <svg className="north" width="22" height="34" viewBox="0 0 22 34" role="img" aria-label="North is up">
      <path d="M11 2 L17 22 L11 18 L5 22 Z" fill={FG} stroke={BG} strokeWidth="1" />
      <text x="11" y="32" textAnchor="middle">N</text>
    </svg>
  );
}

/* ------------------------------------------------------------------ main map */
export interface MapSite {
  site: Site; score: number; rank: number | null; conf: string; matched: number; expected: number;
  dims: { label: string; v: number | null; on: boolean }[];
}

interface Props {
  grid: Float32Array | null; w: number; h: number; rampName: string; domain: [number, number]; classes: ScoreClass[] | null;
  showOverlay: boolean; overlayOpacity: number;
  base: string; baseDate: string; obs: string | null; obsDate: string; obsOpacity: number;
  refs: { graticule: boolean; coast: boolean; borders: boolean; labels: boolean; geology: boolean };
  sites: MapSite[]; selected: string | null; onSelect: (id: string | null) => void;
  targetName: string; deg: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[c]);
const CONF_GLYPH: Record<string, string> = { high: "●", moderate: "◐", low: "○" };

function tipHtml(s: MapSite, targetName: string) {
  const [name, ...rest] = s.site.name.split(" · ");
  return `<div class="tip"><div class="tip-n">${esc(name)}</div>${rest.length ? `<div class="tip-p">${esc(rest.join(", "))}</div>` : ""}
    <dl><dt>Similarity</dt><dd>${Number.isFinite(s.score) ? s.score.toFixed(2) : "–"} <i>to ${esc(targetName)}</i></dd>
    <dt>Confidence</dt><dd>${CONF_GLYPH[s.conf] ?? ""} ${s.conf}</dd>
    <dt>Status</dt><dd>${s.site.kind === "known" ? "established analog" : "candidate from the scan"}</dd></dl>
    <div class="tip-d">${s.dims.map((d) => `<span class="${d.on ? "on" : ""}"><b style="width:${Math.round((d.v ?? 0) * 100)}%"></b><em>${esc(d.label)}</em><u>${d.v == null ? "n/a" : d.v.toFixed(2)}</u></span>`).join("")}</div>
    <div class="tip-h">${s.matched} of ${s.expected} dimensions matched. Click to open the field report.</div></div>`;
}

export function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState<maplibregl.Map | null>(null);
  const [flat, setFlat] = useState(false);
  const [goto, setGoto] = useState("");
  const [gotoErr, setGotoErr] = useState(false);
  const latest = useRef<Props>(p);
  latest.current = p;
  const marks = useRef<maplibregl.Marker[]>([]);
  const labels = useRef<Map<string, maplibregl.Marker>>(new Map());
  const reticle = useRef<maplibregl.Marker | null>(null);
  const regions = useRef<Region[]>([]);
  const heatUrl = useRef<string | null>(null);
  const heatJob = useRef(0);

  const syncHeat = () => {
    const m = map.current, q = latest.current;
    if (!m || !m.getSource("heat")) return;
    const job = ++heatJob.current;
    const src = m.getSource("heat") as maplibregl.ImageSource;
    // Hiding is done with layer visibility, never by swapping in a placeholder image:
    // two image loads can finish out of order and leave the placeholder on top.
    const on = !!q.grid && q.showOverlay;
    m.setLayoutProperty("heat", "visibility", on ? "visible" : "none");
    if (!on || !q.grid) { (window as any).__ptHeat = { painted: 0 }; return; }
    const { canvas, painted } = renderHeat(q.grid, q.w, q.h, q.rampName, q.classes, q.domain[0], q.domain[1]);
    canvas.toBlob((blob) => {
      if (!blob || job !== heatJob.current || !map.current) return;
      const url = URL.createObjectURL(blob), old = heatUrl.current;
      heatUrl.current = url;
      src.updateImage({ url, coordinates: CORNERS });
      (window as any).__ptHeat = { painted, bytes: blob.size, classed: !!q.classes };
      if (old) setTimeout(() => URL.revokeObjectURL(old), 4000);
    }, "image/png");
  };

  const syncSites = () => {
    const m = map.current, q = latest.current;
    if (!m || !m.getSource("sites")) return;
    (m.getSource("sites") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: q.sites.map(({ site, score, rank, conf }) => ({
        type: "Feature", geometry: { type: "Point", coordinates: [site.lon, site.lat] },
        properties: { id: site.id, name: site.name, kind: site.kind, conf, icon: `${site.kind}-${conf}`, score: Number.isFinite(score) ? score : 0, rank: rank ?? 999 },
      })),
    });
    marks.current.forEach((k) => k.remove());
    marks.current = q.sites.filter((s) => s.rank != null && s.rank <= 8).map(({ site, rank }) => {
      const d = document.createElement("button");
      d.className = "mk";
      d.textContent = String(rank);
      d.title = `Rank ${rank}: ${site.name}`;
      d.onclick = (e) => { e.stopPropagation(); latest.current.onSelect(site.id); };
      return new maplibregl.Marker({ element: d, anchor: "bottom-left", offset: [5, -5] }).setLngLat([site.lon, site.lat]).addTo(m);
    });
    const sel = q.sites.find((s) => s.site.id === q.selected)?.site;
    reticle.current?.remove();
    reticle.current = null;
    if (sel) {
      const d = document.createElement("div");
      d.className = "reticle";
      d.innerHTML = `<svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="15"/><path d="M23 2v10M23 34v10M2 23h10M34 23h10"/></svg>`;
      reticle.current = new maplibregl.Marker({ element: d }).setLngLat([sel.lon, sel.lat]).addTo(m);
    }
  };

  const syncLabels = () => {
    const m = map.current, q = latest.current;
    if (!m) return;
    const z = m.getZoom(), c = m.getCenter();
    const want = new Map<string, Region>();
    if (q.refs.labels) {
      const maxRank = z < 2.6 ? 1 : z < 3.7 ? 2 : z < 4.8 ? 3 : 4;
      const reach = z < 2.6 ? 62 : z < 4 ? 40 : 22;
      for (const r of regions.current) {
        if (r.rank > maxRank || want.size >= 36) continue;
        if (haversineKm(c.lat, c.lng, r.lat, r.lon) / 111.2 > reach) continue;
        want.set(r.name + r.lat, r);
      }
    }
    for (const [k, mk] of labels.current) if (!want.has(k)) { mk.remove(); labels.current.delete(k); }
    for (const [k, r] of want) {
      if (labels.current.has(k)) continue;
      const d = document.createElement("div");
      d.className = `geolabel r${r.rank}`;
      d.textContent = r.name;
      labels.current.set(k, new maplibregl.Marker({ element: d }).setLngLat([r.lon, r.lat]).addTo(m));
    }
  };

  const syncRasters = () => {
    const m = map.current, q = latest.current;
    if (!m || !m.getLayer("slot-base")) return;
    const base = earthLayer(q.base);
    const atlas = !base || base.id === "atlas";
    for (const id of ["relief-tint", "relief-shade"]) m.setLayoutProperty(id, "visibility", atlas ? "visible" : "none");
    m.setPaintProperty("bg", "background-color", atlas ? SEA : "#05080F");
    setRasterSlot(m, "base", atlas ? null : base!, q.baseDate, { "raster-saturation": q.showOverlay ? -0.35 : 0, "raster-brightness-max": q.showOverlay ? 0.82 : 1 });
    setRasterSlot(m, "geology", q.refs.geology ? earthLayer("geology")! : null, "", { "raster-opacity": 0.62 });
    const obs = earthLayer(q.obs);
    setRasterSlot(m, "obs", obs ?? null, q.obsDate, { "raster-opacity": q.obsOpacity, "raster-resampling": obs && obs.maxzoom <= 7 ? "nearest" : "linear" });
    m.setLayoutProperty("graticule", "visibility", q.refs.graticule ? "visible" : "none");
    m.setLayoutProperty("coast", "visibility", q.refs.coast ? "visible" : "none");
    m.setLayoutProperty("borders", "visibility", q.refs.borders ? "visible" : "none");
  };

  useEffect(() => {
    const parts = atlasStyleParts();
    const m = new maplibregl.Map({
      container: el.current!, center: HOME.center, zoom: homeView(el.current!).zoom, minZoom: 0.6, maxZoom: 12.5, attributionControl: false,
      dragRotate: false, pitchWithRotate: false, touchPitch: false,
      style: { version: 8, projection: { type: "globe" }, sources: parts.sources, layers: parts.layers, sky: { "atmosphere-blend": 0 } } as any,
    });
    map.current = m;
    m.setPadding(homeView(el.current!).padding);
    m.touchZoomRotate.disableRotation();
    m.keyboard.disableRotation();
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, maxWidth: "280px", className: "sitepop" });

    m.on("load", async () => {
      for (const s of ["base", "geology", "obs"]) m.addLayer({ id: `slot-${s}`, type: "background", layout: { visibility: "none" }, paint: { "background-opacity": 0 } });
      m.addSource("heat", { type: "image", url: BLANK, coordinates: CORNERS });
      m.addLayer({ id: "heat", type: "raster", source: "heat", paint: { "raster-opacity": latest.current.overlayOpacity, "raster-resampling": "nearest", "raster-fade-duration": 0 } });
      addReferenceLayers(m);
      m.addSource("cell", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "cell", type: "line", source: "cell", paint: { "line-color": ["case", ["==", ["get", "pin"], 1], FG, "#B5BCC2"], "line-width": ["case", ["==", ["get", "pin"], 1], 2, 1.1] } });
      m.addSource("sites", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      await addSiteImages(m);
      if (!map.current) return;
      const size: any = ["interpolate", ["linear"], ["zoom"], 1, 0.4, 2.5, 0.5, 4.5, 0.85, 7, 1.15];
      m.addLayer({ id: "cand", type: "symbol", source: "sites", filter: ["==", ["get", "kind"], "candidate"],
        layout: { "icon-image": ["get", "icon"], "icon-size": size, "icon-allow-overlap": true, "icon-ignore-placement": true, "symbol-sort-key": ["-", 0, ["get", "score"]] } });
      m.addLayer({ id: "known", type: "symbol", source: "sites", filter: ["==", ["get", "kind"], "known"],
        layout: { "icon-image": ["get", "icon"], "icon-size": size, "icon-allow-overlap": true, "icon-ignore-placement": true } });

      const hit = (pt: maplibregl.PointLike) => m.queryRenderedFeatures(pt as any, { layers: ["known", "cand"] })[0];
      let pinned: Probe | null = null;
      const drawCell = (hover: { lat: number; lon: number } | null) => {
        const q = latest.current, feats: any[] = [];
        const add = (c: { lat: number; lon: number }, pin: number) => feats.push({ type: "Feature", properties: { pin }, geometry: { type: "LineString", coordinates: cellOf(c.lat, c.lon, q.deg).ring } });
        if (hover && m.getZoom() >= 3.4) add(hover, 0);
        if (pinned) add(pinned, 1);
        (m.getSource("cell") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
      };
      const onGlobe = (e: maplibregl.MapMouseEvent) => {
        const back = m.project(e.lngLat);
        return Math.abs(back.x - e.point.x) < 3 && Math.abs(back.y - e.point.y) < 3 && Math.abs(e.lngLat.lat) < 89.9;
      };
      let raf = 0;
      m.on("mousemove", (e) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const f = hit(e.point);
          m.getCanvas().style.cursor = f ? "pointer" : "crosshair";
          if (f) {
            const s = latest.current.sites.find((x) => x.site.id === String(f.properties.id));
            if (s) popup.setLngLat((f.geometry as any).coordinates).setHTML(tipHtml(s, latest.current.targetName)).addTo(m);
          } else popup.remove();
          if (pinned) return;
          const ok = onGlobe(e);
          probeStore.set(ok ? { lat: e.lngLat.lat, lon: e.lngLat.lng, pinned: false } : null);
          drawCell(ok ? { lat: e.lngLat.lat, lon: e.lngLat.lng } : null);
        });
      });
      m.on("mouseout", () => { popup.remove(); if (!pinned) { probeStore.set(null); drawCell(null); } });
      m.on("click", (e) => {
        const f = hit(e.point);
        if (f) { latest.current.onSelect(String(f.properties.id)); return; }
        if (!onGlobe(e)) return;
        const same = pinned && cellOf(pinned.lat, pinned.lon, latest.current.deg).lat === cellOf(e.lngLat.lat, e.lngLat.lng, latest.current.deg).lat
          && cellOf(pinned.lat, pinned.lon, latest.current.deg).lon === cellOf(e.lngLat.lat, e.lngLat.lng, latest.current.deg).lon;
        pinned = same ? null : { lat: e.lngLat.lat, lon: e.lngLat.lng, pinned: true };
        probeStore.set(pinned ?? { lat: e.lngLat.lat, lon: e.lngLat.lng, pinned: false });
        drawCell(null);
      });
      (m as any).__pin = (c: { lat: number; lon: number } | null) => { pinned = c ? { ...c, pinned: true } : null; probeStore.set(pinned); drawCell(null); };
      const zoomClass = () => el.current?.classList.toggle("far", m.getZoom() < 3.2);
      m.on("zoom", zoomClass); zoomClass();
      m.on("zoomend", syncLabels); m.on("moveend", syncLabels);
      loadRegions().then((r) => { regions.current = r; syncLabels(); });

      (window as any).__ptMap = m; // handle for automated UI tests
      setReady(m);
      syncRasters(); syncHeat(); syncSites();
    });
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect(); popup.remove(); m.remove(); map.current = null; probeStore.set(null);
      if (heatUrl.current) URL.revokeObjectURL(heatUrl.current);
    };
  }, []);

  useEffect(syncHeat, [p.grid, p.rampName, p.domain[0], p.domain[1], p.showOverlay, p.classes?.map((c) => c.lo).join()]);
  useEffect(() => { const m = map.current; if (m?.getLayer("heat")) m.setPaintProperty("heat", "raster-opacity", p.overlayOpacity); }, [p.overlayOpacity]);
  useEffect(syncSites, [p.sites, p.selected]);
  useEffect(syncRasters, [p.base, p.baseDate, p.obs, p.obsDate, p.refs.geology, p.refs.graticule, p.refs.coast, p.refs.borders, p.showOverlay]);
  useEffect(() => { const m = map.current; if (m?.getLayer("obs")) m.setPaintProperty("obs", "raster-opacity", p.obsOpacity); }, [p.obsOpacity]);
  useEffect(syncLabels, [p.refs.labels]);
  useEffect(() => {
    const m = map.current;
    const s = p.sites.find((x) => x.site.id === p.selected)?.site;
    if (m && s) m.flyTo({ center: [s.lon, Math.max(-84, Math.min(84, s.lat))], zoom: Math.max(m.getZoom(), 5.2), speed: 1.4, essential: false });
  }, [p.selected, ready]);
  useEffect(() => { ready?.setProjection({ type: flat ? "mercator" : "globe" }); }, [flat, ready]);
  // keep the glow behind the globe on the globe: its centre follows the map padding, its size the zoom
  useEffect(() => {
    const m = ready;
    if (!m) return;
    const upd = () => {
      const f = frame.current;
      if (!f) return;
      const q = m.getPadding(), c = m.getContainer();
      const p = { left: q.left ?? 0, right: q.right ?? 0, top: q.top ?? 0, bottom: q.bottom ?? 0 };
      f.style.setProperty("--gx", `${p.left + (c.clientWidth - p.left - p.right) / 2}px`);
      f.style.setProperty("--gy", `${p.top + (c.clientHeight - p.top - p.bottom) / 2}px`);
      f.style.setProperty("--gr", `${0.93 * (512 / (2 * Math.PI)) * Math.pow(2, m.getZoom())}px`);
    };
    upd();
    m.on("move", upd); m.on("resize", upd);
    return () => { m.off("move", upd); m.off("resize", upd); };
  }, [ready]);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const c = parseCoord(goto), m = map.current;
    setGotoErr(!c);
    if (!c || !m) return;
    m.flyTo({ center: [c.lon, Math.max(-84, Math.min(84, c.lat))], zoom: Math.max(m.getZoom(), 5.5), essential: false });
    (m as any).__pin?.(c);
  };

  return (
    <div ref={frame} className={`mapframe well ${ready ? "ready" : ""} ${flat ? "flat" : ""}`}>
      <StarField />
      <div ref={el} className="map" />
      <Fiducials />
      <div className="mapctl" role="group" aria-label="Map view">
        <button onClick={() => map.current?.zoomIn()} aria-label="Zoom in" title="Zoom in">+</button>
        <button onClick={() => map.current?.zoomOut()} aria-label="Zoom out" title="Zoom out">−</button>
        <button className="wide" onClick={() => map.current?.flyTo({ ...homeView(el.current!), essential: false })} title="Return to the whole-Earth view">Reset</button>
        <button className="wide" aria-pressed={flat} onClick={() => setFlat(!flat)} title="Switch between a globe and a flat Web-Mercator map">{flat ? "Globe" : "Flat"}</button>
      </div>
      <form className={`goto ${gotoErr ? "err" : ""}`} onSubmit={go}>
        <label htmlFor="goto">Go to</label>
        <input id="goto" value={goto} onChange={(e) => { setGoto(e.target.value); setGotoErr(false); }} placeholder="25.4 N, 39.9 E" spellCheck={false} aria-invalid={gotoErr} />
        {gotoErr && <span role="alert">Enter latitude, then longitude</span>}
      </form>
      <CentreReadout map={ready} flat={flat} />
      <ScaleBar map={ready} />
      <MapBusy map={ready} />
    </div>
  );
}
