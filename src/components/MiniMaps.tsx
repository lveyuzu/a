import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Body, Target } from "../lib/data";
import { bodyLayers, dateLabel, earthLayer, latestDate, shiftDate, TREK_ATTR, type BodyLayerDef } from "../lib/layers";
import { registerTrek, trekTemplate } from "../lib/trek";
import { EE_H, EE_W, ddPair, equalEarth, graticule, loadLand, ortho, windowRing } from "../lib/geo";
import { Chevron } from "./Workspace";
import { BG, FG, MapBusy, NorthArrow, ScaleBar, addReferenceLayers, atlasStyleParts, setRasterSlot } from "./MapView";

/* ================================================================== SVG locator globe */
export interface Mark { lat: number; lon: number; label?: string; on?: boolean; id?: string; title?: string }

function useLand() {
  const [land, setLand] = useState<number[][]>([]);
  useEffect(() => { let live = true; loadLand().then((l) => { if (live) setLand(l); }); return () => { live = false; }; }, []);
  return land;
}

/** Orthographic locator. Earth gets Natural Earth land; the Moon and Mars get a graticule only
 *  (no coastline exists to draw, and the locator's only job is to say where on the body a point is). */
export function Locator({ lat, lon, size = 120, body = "earth", marks = [], onPick, caption }:
  { lat: number; lon: number; size?: number; body?: "earth" | Body; marks?: Mark[]; onPick?: (id: string) => void; caption?: string }) {
  const land = useLand();
  const lat0 = Math.max(-58, Math.min(58, lat)), lon0 = lon;
  const R = size / 2 - 3, C = size / 2;
  const P = (la: number, lo: number, clamp = true): [number, number] | null => {
    const q = ortho(la, lo, lat0, lon0);
    if (q) return [C + q[0] * R, C + q[1] * R];
    if (!clamp) return null;
    // far side: slide the point to the limb in its own direction so polygons close along the edge
    const p = la * Math.PI / 180, l = (lo - lon0) * Math.PI / 180, p0 = lat0 * Math.PI / 180;
    const x = Math.cos(p) * Math.sin(l), y = -(Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l)), n = Math.hypot(x, y) || 1;
    return [C + (x / n) * R, C + (y / n) * R];
  };
  const landPath = useMemo(() => {
    if (body !== "earth") return "";
    let d = "";
    for (const ring of land) {
      let any = false, s = "";
      for (let i = 0; i < ring.length; i += 2) {
        if (ortho(ring[i + 1], ring[i], lat0, lon0)) any = true;
        const q = P(ring[i + 1], ring[i])!;
        s += `${i ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`;
      }
      if (any) d += s + "Z";
    }
    return d;
  }, [land, lat0, lon0, size, body]);
  const grat = useMemo(() => {
    let d = "";
    const line = (pts: [number, number][]) => { let pen = false; for (const [la, lo] of pts) { const q = P(la, lo, false); if (!q) { pen = false; continue; } d += `${pen ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`; pen = true; } };
    for (let lo = -180; lo < 180; lo += 30) line(Array.from({ length: 37 }, (_, i) => [-90 + i * 5, lo] as [number, number]));
    for (let la = -60; la <= 60; la += 30) line(Array.from({ length: 73 }, (_, i) => [la, -180 + i * 5] as [number, number]));
    return d;
  }, [lat0, lon0, size]);
  const fill = body === "earth" ? "var(--sea)" : body === "mars" ? "color-mix(in srgb, var(--mars) 30%, var(--bg))" : "color-mix(in srgb, var(--moon) 26%, var(--bg))";
  return (
    <figure className="locator" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={caption ?? `Location on ${body}`}>
        <circle cx={C} cy={C} r={R} fill={fill} />
        {landPath && <path d={landPath} fill="var(--land)" />}
        <path d={grat} fill="none" stroke="var(--fg)" strokeOpacity={body === "earth" ? 0.14 : 0.22} strokeWidth={0.6} />
        <circle cx={C} cy={C} r={R} fill="none" stroke="var(--silver)" strokeWidth={1} />
        {marks.map((m, i) => {
          const q = P(m.lat, m.lon, false);
          if (!q) return null;
          return (
            <g key={m.id ?? i} className={`lmark ${m.on ? "on" : ""} ${onPick && m.id ? "pick" : ""}`} onClick={onPick && m.id ? () => onPick(m.id!) : undefined}>
              <title>{m.title ?? m.label ?? ""}</title>
              {onPick && <circle cx={q[0]} cy={q[1]} r={9} fill="transparent" />}
              {m.on && <circle cx={q[0]} cy={q[1]} r={6.5} fill="none" stroke="var(--fg)" strokeWidth={1} />}
              <circle cx={q[0]} cy={q[1]} r={m.on ? 3 : 2.4} fill={m.on ? "var(--accent)" : "var(--bg)"} stroke="var(--fg)" strokeWidth={1.1} />
              {m.label && <text x={q[0] + 7} y={q[1] + 3.5}>{m.label}</text>}
            </g>
          );
        })}
      </svg>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/* ================================================================== SVG world map (Equal Earth) */
export function WorldMap({ marks, minor = [], hover, onHover, onPick, lines = [] }:
  { marks: (Mark & { letter: string })[]; minor?: Mark[]; hover: string | null; onHover: (id: string | null) => void; onPick: (id: string) => void; lines?: string[] }) {
  const land = useLand();
  const W = 1000, H = Math.round((W * EE_H) / EE_W), sx = W / (2 * EE_W), sy = H / (2 * EE_H);
  const P = (la: number, lo: number): [number, number] => { const [x, y] = equalEarth(la, lo); return [W / 2 + x * sx, H / 2 + y * sy]; };
  const landPath = useMemo(() => land.map((ring) => {
    let s = "";
    for (let i = 0; i < ring.length; i += 2) { const q = P(ring[i + 1], ring[i]); s += `${i ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`; }
    return s + "Z";
  }).join(""), [land]);
  const edge = useMemo(() => {
    let s = "";
    for (let la = -90; la <= 90; la += 3) { const q = P(la, 180); s += `${s ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`; }
    for (let la = 90; la >= -90; la -= 3) { const q = P(la, -180); s += `L${q[0].toFixed(1)},${q[1].toFixed(1)}`; }
    return s + "Z";
  }, []);
  const grat = useMemo(() => {
    let d = "";
    for (let lo = -150; lo <= 150; lo += 30) for (let la = -90; la <= 90; la += 3) { const q = P(la, lo); d += `${la === -90 ? "M" : "L"}${q[0].toFixed(1)},${q[1].toFixed(1)}`; }
    for (let la = -60; la <= 60; la += 30) { const a = P(la, -180), b = P(la, 180); d += `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`; }
    return d;
  }, []);
  // Label placement: try the right side, then the left, then nudged up or down, and keep the first that
  // does not run into a label already placed. Widths are estimated from the text length.
  const placed = useMemo(() => {
    type Box = [number, number, number, number];
    const boxes: Box[] = [];
    // every site's own circle is an obstacle for every other site's label
    const discs: Box[] = marks.map((m) => { const q = P(m.lat, m.lon); return [q[0] - 14, q[1] - 14, q[0] + 14, q[1] + 14]; });
    const over = (b: Box, o: Box) => b[0] < o[2] && o[0] < b[2] && b[1] < o[3] && o[1] < b[3];
    return marks.map((m, i) => {
      const hit = (b: Box) => boxes.some((o) => over(b, o)) || discs.some((o, j) => j !== i && over(b, o));
      const q = P(m.lat, m.lon), w = Math.max((m.label ?? "").length * 8.6, (lines[i] ?? "").length * 5.6) + 8;
      const tries: [boolean, number][] = [[true, 0], [false, 0], [true, -34], [true, 34], [false, -34], [false, 34], [true, -66], [true, 66]];
      let best = { right: true, dy: 0, x: q[0] + 17 };
      for (const [right, dy] of tries) {
        const x = q[0] + (right ? 17 : -17);
        const box: Box = [right ? x : x - w, q[1] + dy - 15, right ? x + w : x, q[1] + dy + 18];
        if (box[0] < 4 || box[2] > W - 4 || hit(box)) continue;
        best = { right, dy, x };
        boxes.push(box);
        return best;
      }
      return best;
    });
  }, [marks.map((m) => m.id).join(), lines.join()]);
  return (
    <svg className="worldmap" viewBox={`-6 -6 ${W + 12} ${H + 12}`} role="img" aria-label="World map of the portfolio sites, Equal Earth projection">
      <path d={edge} fill="var(--sea)" />
      <path d={landPath} fill="var(--land)" stroke="var(--fg)" strokeOpacity={0.3} strokeWidth={0.5} />
      <path d={grat} fill="none" stroke="var(--fg)" strokeOpacity={0.09} strokeWidth={0.6} />
      <path d={edge} fill="none" stroke="var(--silver)" strokeWidth={1} />
      {[-60, -30, 0, 30, 60].map((la) => { const q = P(la, -180); return <text key={la} className="wm-tick" x={q[0] - 5} y={q[1] + 3} textAnchor="end">{Math.abs(la)}°{la > 0 ? "N" : la < 0 ? "S" : ""}</text>; })}
      {minor.map((m, i) => { const q = P(m.lat, m.lon); return <circle key={i} cx={q[0]} cy={q[1]} r={1.9} fill="var(--fg)" fillOpacity={0.34}><title>{m.title}</title></circle>; })}
      {marks.map((m, i) => {
        const q = P(m.lat, m.lon), on = hover === m.id, pl = placed[i];
        return (
          <g key={m.id} className={`wm-site ${on ? "on" : ""}`} onMouseEnter={() => onHover(m.id!)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(m.id!)} onBlur={() => onHover(null)}
            onClick={() => onPick(m.id!)} onKeyDown={(e) => { if (e.key === "Enter") onPick(m.id!); }} tabIndex={0} role="button" aria-label={`${m.letter}: ${m.label}. Open field report.`}>
            {pl.dy !== 0 && <line x1={q[0]} y1={q[1]} x2={pl.x + (pl.right ? -3 : 3)} y2={q[1] + pl.dy - 4} stroke="var(--silver)" strokeWidth={0.8} />}
            <circle cx={q[0]} cy={q[1]} r={on ? 15 : 12} fill="var(--bg)" stroke="var(--fg)" strokeWidth={on ? 2 : 1.3} />
            <text className="wm-letter" x={q[0]} y={q[1] + 5} textAnchor="middle">{m.letter}</text>
            <text className="wm-name" x={pl.x} y={q[1] + pl.dy - 1} textAnchor={pl.right ? "start" : "end"}>{m.label}</text>
            {lines[i] && <text className="wm-sub" x={pl.x} y={q[1] + pl.dy + 13} textAnchor={pl.right ? "start" : "end"}>{lines[i]}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/* ================================================================== Earth site map (dossier) */
export interface PassRequest { layer: "hls" | "sar"; date: string; n: number }

export function SiteMap({ lat, lon, name, halfKm, pass }: { lat: number; lon: number; name: string; halfKm: number; pass?: PassRequest | null }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState<maplibregl.Map | null>(null);
  const [base, setBase] = useState<"atlas" | "s2">("atlas");
  const [over, setOver] = useState<null | "geology" | "hls" | "sar">(null);
  const [date, setDate] = useState<string>("");
  const [scope, setScope] = useState<"site" | "region">("site");
  const [failed, setFailed] = useState(false);
  const def = over ? earthLayer(over)! : null;
  const polar = Math.abs(lat) > 84;

  useEffect(() => {
    const parts = atlasStyleParts();
    const m = new maplibregl.Map({
      container: el.current!, center: [lon, Math.max(-84.5, Math.min(84.5, lat))], zoom: 8.4, minZoom: 2, maxZoom: 12.5, attributionControl: false,
      dragRotate: false, pitchWithRotate: false, touchPitch: false, cooperativeGestures: true,
      style: { version: 8, sources: parts.sources, layers: parts.layers } as any,
    });
    map.current = m;
    m.touchZoomRotate.disableRotation();
    m.on("load", () => {
      for (const s of ["base", "geology", "obs"]) m.addLayer({ id: `slot-${s}`, type: "background", layout: { visibility: "none" }, paint: { "background-opacity": 0 } });
      addReferenceLayers(m);
      const ring = windowRing(lat, lon, halfKm);
      m.addSource("win", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ring } } as any });
      m.addLayer({ id: "win-halo", type: "line", source: "win", paint: { "line-color": BG, "line-width": 4, "line-opacity": 0.8 } });
      m.addLayer({ id: "win", type: "line", source: "win", paint: { "line-color": FG, "line-width": 1.4 } });
      const d = document.createElement("div");
      d.className = "reticle small";
      d.innerHTML = `<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="5"/><path d="M15 1v8M15 21v8M1 15h8M21 15h8"/></svg>`;
      new maplibregl.Marker({ element: d }).setLngLat([lon, lat]).addTo(m);
      const lons = ring.map((c) => c[0]), lats = ring.map((c) => c[1]);
      (m as any).__fit = (s: "site" | "region") => s === "site"
        ? m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 34, duration: 600, essential: false })
        : m.flyTo({ center: [lon, Math.max(-80, Math.min(80, lat))], zoom: 4.3, essential: false });
      (m as any).__fit("site");
      (window as any).__ptSiteMap = m;
      setReady(m);
    });
    m.on("error", (e: any) => { if (e?.sourceId === "obs" || e?.sourceId === "base") setFailed(true); });
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current!);
    return () => { ro.disconnect(); m.remove(); map.current = null; if ((window as any).__ptSiteMap === m) delete (window as any).__ptSiteMap; };
  }, [lat, lon, halfKm]);

  useEffect(() => {
    const m = ready;
    if (!m) return;
    setFailed(false);
    const atlas = base === "atlas";
    for (const id of ["relief-tint", "relief-shade"]) m.setLayoutProperty(id, "visibility", atlas ? "visible" : "none");
    setRasterSlot(m, "base", atlas ? null : earthLayer("s2")!, "");
    setRasterSlot(m, "geology", over === "geology" ? earthLayer("geology")! : null, "", { "raster-opacity": 0.7 });
    setRasterSlot(m, "obs", over === "hls" || over === "sar" ? earthLayer(over)! : null, date);
  }, [ready, base, over, date]);

  useEffect(() => { (ready as any)?.__fit?.(scope); }, [scope, ready]);
  useEffect(() => { if (pass) { setOver(pass.layer); setDate(pass.date); setScope("site"); } }, [pass?.n]);

  const pick = (o: typeof over) => {
    setOver(o === over ? null : o);
    if (o && o !== "geology" && o !== over) setDate(latestDate(earthLayer(o)!));
  };
  const caption = over && def ? `${def.name}${def.time !== "static" && date ? `, ${dateLabel(def, date)}` : ""} · ${def.attribution}`
    : base === "s2" ? earthLayer("s2")!.attribution : `Relief drawn from ${earthLayer("atlas")!.attribution}`;

  return (
    <div className="sitemap">
      <div className="maptools">
        <div className="seg" role="group" aria-label="Map extent">
          <button aria-pressed={scope === "site"} onClick={() => setScope("site")}>Site</button>
          <button aria-pressed={scope === "region"} onClick={() => setScope("region")}>Region</button>
        </div>
        <div className="seg" role="group" aria-label="Basemap">
          <button aria-pressed={base === "atlas"} onClick={() => setBase("atlas")}>Relief</button>
          <button aria-pressed={base === "s2"} onClick={() => setBase("s2")}>Sentinel-2</button>
        </div>
        <div className="seg" role="group" aria-label="Overlay">
          <button aria-pressed={over === "geology"} onClick={() => pick("geology")}>Geologic units</button>
          <button aria-pressed={over === "hls"} onClick={() => pick("hls")}>Dated pass</button>
          <button aria-pressed={over === "sar"} onClick={() => pick("sar")}>Radar</button>
        </div>
      </div>
      <div className="mapframe mini">
        <div ref={el} className="map" aria-label={`Map of ${name}`} />
        <NorthArrow />
        <ScaleBar map={ready} />
        <MapBusy map={ready} />
        <div className="mapnote">{ddPair(lat, lon)}<br />square: the {(halfKm * 2).toFixed(0)} km window that is scored</div>
      </div>
      {def && def.time !== "static" && (
        <div className="datebar">
          <button onClick={() => setDate(shiftDate(def, date, -1))} aria-label="Previous day"><Chevron dir="left" /></button>
          <input type="date" value={date} min={def.from} max={latestDate(def)} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Acquisition date" />
          <button onClick={() => setDate(shiftDate(def, date, 1))} aria-label="Next day"><Chevron dir="right" /></button>
          <span>{def.limits}</span>
        </div>
      )}
      {over === "sar" && <p className="caution">Radar brightness mixes roughness, moisture, slope facing and look angle. It shows texture and structure; it does not identify rock type and is not part of any score.</p>}
      {failed && <p className="caution">This layer did not load. The service may be unreachable or hold no data for this date.</p>}
      {polar && <p className="caution">This site is beyond 84° latitude, where a Mercator map cannot be drawn. The map is centred as close as the projection allows.</p>}
      <p className="credit">{caption}. Web Mercator, north up. Map layers are for orientation and are not scored.</p>
    </div>
  );
}

/* ================================================================== Moon / Mars map */
export function BodyMap({ body, targets, selected, onSelect, tall = false }:
  { body: Body; targets: Target[]; selected: string; onSelect?: (id: string) => void; tall?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState<maplibregl.Map | null>(null);
  const bases = bodyLayers(body, "base"), overs = bodyLayers(body, "overlay");
  const [base, setBase] = useState(bases[0].id);
  const [over, setOver] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const marks = useRef<maplibregl.Marker[]>([]);
  const latest = useRef({ onSelect });
  latest.current = { onSelect };
  const sel = targets.find((t) => t.id === selected) ?? targets[0];
  const baseDef = bases.find((l) => l.id === base) ?? bases[0];
  const overDef = overs.find((l) => l.id === over) ?? null;
  const polar = Math.abs(sel.lat) > 80;

  useEffect(() => { setBase(bodyLayers(body, "base")[0].id); setOver(null); }, [body]);

  useEffect(() => {
    registerTrek();
    const m = new maplibregl.Map({
      container: el.current!, center: [sel.lon, Math.max(-78, Math.min(78, sel.lat))], zoom: Math.abs(sel.lat) > 80 ? 1.6 : 2.6, minZoom: 0.4, maxZoom: 9.5, attributionControl: false,
      dragRotate: false, pitchWithRotate: false, touchPitch: false, cooperativeGestures: true,
      style: { version: 8, projection: { type: "globe" }, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#0B1222" } }], sky: { "atmosphere-blend": 0 } } as any,
    });
    map.current = m;
    m.touchZoomRotate.disableRotation();
    m.on("load", () => {
      m.addLayer({ id: "slot-base", type: "background", layout: { visibility: "none" }, paint: { "background-opacity": 0 } });
      m.addLayer({ id: "slot-over", type: "background", layout: { visibility: "none" }, paint: { "background-opacity": 0 } });
      m.addSource("graticule", { type: "geojson", data: graticule(30) as any });
      m.addLayer({ id: "graticule", type: "line", source: "graticule", paint: { "line-color": "#ffffff", "line-opacity": 0.22, "line-width": 0.6 } });
      (window as any).__ptBodyMap = m;
      setReady(m);
    });
    m.on("error", (e: any) => { if (e?.sourceId === "base") setFailed(true); });
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current!);
    return () => { ro.disconnect(); m.remove(); map.current = null; setReady(null); if ((window as any).__ptBodyMap === m) delete (window as any).__ptBodyMap; };
  }, [body]);

  useEffect(() => {
    const m = ready;
    if (!m) return;
    setFailed(false);
    const put = (slot: string, l: BodyLayerDef | null, opacity = 1) => {
      if (m.getLayer(slot)) m.removeLayer(slot);
      if (m.getSource(slot)) m.removeSource(slot);
      if (!l) return;
      m.addSource(slot, { type: "raster", tiles: [trekTemplate(l)], tileSize: 256, maxzoom: l.maxLevel + 1, attribution: TREK_ATTR });
      m.addLayer({ id: slot, type: "raster", source: slot, paint: { "raster-opacity": opacity, "raster-fade-duration": 150 } }, `slot-${slot}`);
    };
    put("base", baseDef);
    put("over", overDef, 0.72);
  }, [ready, baseDef.id, overDef?.id]);

  useEffect(() => {
    const m = ready;
    if (!m) return;
    marks.current.forEach((k) => k.remove());
    marks.current = targets.map((t) => {
      const d = document.createElement(latest.current.onSelect ? "button" : "div");
      d.className = `bmark ${t.id === selected ? "on" : ""}`;
      d.innerHTML = `<i></i><span>${t.name}</span>`;
      d.title = `${t.name}, ${ddPair(t.lat, t.lon, 1)}`;
      if (latest.current.onSelect) (d as HTMLButtonElement).onclick = (e) => { e.stopPropagation(); latest.current.onSelect?.(t.id); };
      return new maplibregl.Marker({ element: d, anchor: "left", offset: [-6, 0] }).setLngLat([t.lon, t.lat]).addTo(m);
    });
    m.flyTo({ center: [sel.lon, Math.max(-78, Math.min(78, sel.lat))], zoom: Math.max(m.getZoom(), polar ? 1.6 : 2.6), essential: false });
  }, [ready, selected, targets]);

  const active = overDef ?? baseDef;
  return (
    <div className="bodymap">
      <div className="maptools">
        <div className="seg" role="group" aria-label={`${body} basemap`}>
          {bases.map((l) => <button key={l.id} aria-pressed={base === l.id} onClick={() => setBase(l.id)} title={l.purpose}>{l.name}</button>)}
        </div>
        <div className="seg" role="group" aria-label={`${body} overlay`}>
          {overs.map((l) => <button key={l.id} aria-pressed={over === l.id} onClick={() => setOver(over === l.id ? null : l.id)} title={l.purpose}>{l.name}</button>)}
        </div>
      </div>
      <div className={`mapframe mini body well ${tall ? "tall" : ""}`}>
        <div ref={el} className="map" aria-label={`Map of ${body === "mars" ? "Mars" : "the Moon"}`} />
        <ScaleBar map={ready} body={body} />
        <MapBusy map={ready} />
        <div className="mapnote">{sel.name}<br />{ddPair(sel.lat, sel.lon)}</div>
      </div>
      {failed && <p className="caution">The imagery service did not answer. Region positions are still shown on the graticule.</p>}
      {polar && <p className="caution">{sel.name} lies beyond 80° latitude. The global mosaics are drawn to 85° only, so the pole is stretched here; use the polar relief panel for the terrain itself.</p>}
      <dl className="layerfacts">
        <dt>Shown</dt><dd>{active.product}</dd>
        <dt>Instrument</dt><dd>{active.instrument}, {active.resolution}</dd>
        <dt>Colours</dt><dd>{active.units}</dd>
        <dt>Limits</dt><dd>{active.limits}</dd>
        {active.scored && <><dt>In the score</dt><dd>{active.scored}</dd></>}
      </dl>
      <p className="credit">{TREK_ATTR}. Plate-carrée tiles re-projected to a globe in the browser. Scale bar uses the {body === "mars" ? "Mars radius of 3,389.5 km" : "lunar radius of 1,737.4 km"}. Display only.</p>
    </div>
  );
}
