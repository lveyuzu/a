// Pieces of the Explore workspace that sit around the map: legend, cursor readout, layer panel.
import { useMemo } from "react";
import type { Bundle, FactorId, Site, Target } from "../lib/data";
import { cellValue, fmt, histogram, rampCss, type Distribution, type ScoreClass } from "../lib/score";
import { EARTH_LAYERS, dateLabel, earthLayer, earthLayers, latestDate, shiftDate, type MapLayerDef } from "../lib/layers";
import { cellOf, ddPair, haversineKm } from "../lib/geo";
import { INK, PAPER, siteSymbol, useProbe } from "./MapView";
import { ConfMark } from "./charts";

const svgUri = (s: string) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
/** Site symbol outside the map. `tone` picks chalk-on-plate (as on the map) or ink-on-paper. */
export function SiteGlyph({ kind, conf, size = 13, tone = "plate" }: { kind: "known" | "candidate"; conf: string; size?: number; tone?: "plate" | "paper" }) {
  const src = tone === "paper" ? siteSymbol(kind, conf, 30, INK, PAPER) : siteSymbol(kind, conf, 30);
  return <img className="glyph" width={size} height={size} alt="" src={svgUri(src)} />;
}

/* ------------------------------------------------------------------ legend */
// The legend lives in the margin under the map, as on an atlas sheet: unit boxes with their score ranges,
// and beside them the land-area histogram, each bar painted in the colour that cell would get on the map.
export function Legend({ title, unitLabel, classes, classed, rampName, domain, dist, shown, obs, obsDate }:
  { title: string; unitLabel: string; classes: ScoreClass[] | null; classed: boolean; rampName: string; domain: [number, number]; dist: Distribution | null; shown: boolean; obs: MapLayerDef | null; obsDate: string }) {
  const N = 56;
  const hi = Math.max(domain[1], 0.05) * 1.04;
  const hist = useMemo(() => (dist ? histogram(dist, 0, hi, N) : []), [dist, hi]);
  const tone = (k: number, n: number) => rampCss(rampName, 0.04 + 0.96 * ((k + 0.5) / n));
  const barColour = (x: number) => {
    if (x < domain[0]) return "var(--chalk-4)";
    if (classed && classes) { let k = 0; while (k < classes.length - 1 && x >= classes[k + 1].lo) k++; return tone(k, classes.length); }
    return rampCss(rampName, 0.04 + 0.96 * Math.min(1, (x - domain[0]) / Math.max(1e-6, domain[1] - domain[0])));
  };
  return (
    <aside className="legend" aria-label="Map legend">
      <h3>{title}<span>{shown ? (classed ? "five classes by share of land" : "continuous") : "hidden"}</span></h3>
      {shown ? (
        <div className="lg-body">
          {classed && classes ? (
            <ol className="classes" reversed aria-label="Classes by share of land area, with score range">
              {[...classes].reverse().map((c, i) => <li key={c.top}><i style={{ background: tone(classes.length - 1 - i, classes.length) }} /><span>{c.label}</span><span className="num">{fmt(c.lo, 2)}–{fmt(c.hi, 2)}</span></li>)}
              <li className="none"><i /><span>other 70%</span><span className="num">&lt; {fmt(domain[0], 2)}</span></li>
            </ol>
          ) : (
            <div className="lg-cont">
              <div className="legendbar" style={{ background: `linear-gradient(90deg, ${[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => rampCss(rampName, 0.04 + 0.96 * t)).join(",")})` }} />
              <div className="legendticks"><span className="num">{fmt(domain[0], 2)}</span><span>{unitLabel}</span><span className="num">{fmt(domain[1], 2)}</span></div>
            </div>
          )}
          {hist.length > 0 && (
            <figure className="lg-dist">
              <svg className="hist" viewBox={`0 0 ${N * 3} 40`} preserveAspectRatio="none" role="img" aria-label="Land area by score. Coloured bars are the cells drawn on the map; grey bars are the other 70% of land.">
                {hist.map((v, i) => { const x0 = (i / N) * hi; return <rect key={i} x={i * 3} y={40 - Math.max(v * 38, v > 0 ? 0.8 : 0)} width={2.3} height={Math.max(v * 38, v > 0 ? 0.8 : 0)} fill={barColour(x0)} />; })}
              </svg>
              <figcaption className="legendticks"><span className="num">0</span><span>{unitLabel}</span><span className="num">{fmt(hi, 2)}</span></figcaption>
            </figure>
          )}
        </div>
      ) : <p className="fine">The similarity layer is hidden. Turn it on under Map layers.</p>}
      {obs && (
        <div className="obsleg">
          <h3>{obs.name}{obs.time !== "static" ? `, ${dateLabel(obs, obsDate)}` : ""}</h3>
          {obs.legend ? <img src={obs.legend} alt={`Legend: ${obs.units}`} /> : <p className="fine">{obs.units}</p>}
          <p className="fine">A picture of the product, {obs.resolution}. Not read as numbers.</p>
        </div>
      )}
      <div className="symkey">
        <p><em>Site</em><span><SiteGlyph kind="candidate" conf="high" /> candidate</span><span><SiteGlyph kind="known" conf="high" /> established</span></p>
        <p><em>Fill is confidence</em><span><SiteGlyph kind="candidate" conf="high" /> high</span><span><SiteGlyph kind="candidate" conf="moderate" /> moderate</span><span><SiteGlyph kind="candidate" conf="low" /> low</span></p>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ cursor readout */
export function ProbeBar({ b, target, grids, overall, dist, gw, gh, sites, onOpen }:
  { b: Bundle; target: Target; grids: Partial<Record<FactorId, Float32Array>> | null; overall: Float32Array | null; dist: Distribution | null; gw: number; gh: number; sites: Site[]; onOpen: (id: string) => void }) {
  const pr = useProbe();
  if (!pr) return (
    <div className="probe idle" role="status">
      <p>Move over the map to read any land cell. Click to pin it. Click a site symbol to open its field report.</p>
    </div>
  );
  const c = cellOf(pr.lat, pr.lon, b.meta.grid.deg);
  const v = overall ? cellValue(overall, gw, gh, pr.lat, pr.lon) : NaN;
  const land = Number.isFinite(v);
  const pct = land && dist ? dist.pct(v) : NaN;
  const near = pr.pinned ? sites.map((s) => ({ s, km: haversineKm(pr.lat, pr.lon, s.lat, s.lon) })).filter((x) => x.km < 45).sort((x, y) => x.km - y.km)[0] : undefined;
  const th = b.meta.params.match_threshold;
  return (
    <div className={`probe ${pr.pinned ? "pinned" : ""}`} role="status">
      <div className="pf where"><span className="pk">{pr.pinned ? "Pinned cell" : "Cursor"}</span><span className="pv num">{ddPair(pr.lat, pr.lon, 2)}</span></div>
      {land ? (
        <>
          <div className="pf what">
            <span className="pk">similarity to {target.name}</span>
            <span className="pv"><b className="num">{fmt(v, 2)}</b>{Number.isFinite(pct) ? <span className="pct"> <span className="num">{pct >= 99.95 ? "top 0.1" : `top ${(100 - pct).toFixed(pct > 99 ? 1 : 0)}`}%</span> of land</span> : null}</span>
          </div>
          <div className="dims">{target.factors.map((k) => {
            const g = grids?.[k]; const x = g ? cellValue(g, gw, gh, pr.lat, pr.lon) : NaN; const ok = Number.isFinite(x);
            return (
              <span key={k} className={ok && x >= th ? "dm on" : "dm"}>
                <em>{b.meta.factors.find((f) => f.id === k)!.label}</em> <b className="num">{ok ? x.toFixed(2) : "–"}</b>
                <i aria-hidden="true"><s style={{ width: `${ok ? x * 100 : 0}%` }} /><u style={{ left: `${th * 100}%` }} /></i>
              </span>
            );
          })}</div>
        </>
      ) : <div className="pf what"><span className="pk">no score</span><span className="pv nodata">No scored land in this cell (sea, or outside the land mask)</span></div>}
      {pr.pinned && <p className="pinnote">Cell centre {ddPair(c.lat, c.lon, 3)}. {near ? <button className="link" onClick={() => onOpen(near.s.id)}>{near.s.name.split(" · ")[0]} is {Math.round(near.km)} km away: open its field report</button> : <>No listed site within 45 km, so no confidence value exists here.</>} Click the cell again to release it.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ layer panel */
export interface LayerState {
  base: string; baseDate: string; obs: string | null; obsDate: string; obsOpacity: number;
  overlay: boolean; overlayOpacity: number; classed: boolean;
  refs: { graticule: boolean; coast: boolean; borders: boolean; labels: boolean; geology: boolean };
}
export const DEFAULT_LAYERS: LayerState = {
  base: "atlas", baseDate: "", obs: null, obsDate: "", obsOpacity: 0.8, overlay: true, overlayOpacity: 0.9, classed: true,
  refs: { graticule: true, coast: true, borders: true, labels: true, geology: false },
};

export function Chevron({ dir }: { dir: "left" | "right" }) {
  return <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d={dir === "left" ? "M6.5 1.5 3 5l3.5 3.5" : "M3.5 1.5 7 5 3.5 8.5"} fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>;
}

function DateControl({ l, date, set }: { l: MapLayerDef; date: string; set: (d: string) => void }) {
  if (l.time === "static") return null;
  const step = l.time === "daily" ? "day" : l.time === "monthly" ? "month" : "year";
  return (
    <div className="datebar">
      <button onClick={() => set(shiftDate(l, date, -1))} aria-label={`Previous ${step}`}><Chevron dir="left" /></button>
      <input type="date" value={date} min={l.from} max={latestDate(l)} onChange={(e) => e.target.value && set(shiftDate(l, e.target.value, 0))} aria-label={`${l.name} date`} />
      <button onClick={() => set(shiftDate(l, date, 1))} aria-label={`Next ${step}`}><Chevron dir="right" /></button>
      <span>{dateLabel(l, date)}</span>
    </div>
  );
}

function Facts({ l }: { l: MapLayerDef }) {
  return (
    <dl className="layerfacts">
      <dt>Product</dt><dd>{l.product}</dd>
      <dt>Resolution</dt><dd>{l.resolution}</dd>
      <dt>Colours</dt><dd>{l.units}</dd>
      <dt>Period</dt><dd>{l.period}</dd>
      <dt>Limits</dt><dd>{l.limits}</dd>
      <dt>In the score</dt><dd>{l.scored ?? "No. Context only."}</dd>
      <dt>Source</dt><dd><a href={l.info} target="_blank" rel="noreferrer">{l.source}</a></dd>
    </dl>
  );
}

export function LayerPanel({ s, set }: { s: LayerState; set: (patch: Partial<LayerState>) => void }) {
  const base = earthLayer(s.base)!, obs = earthLayer(s.obs);
  const pickBase = (id: string) => { const l = earthLayer(id)!; set({ base: id, baseDate: l.time === "static" ? "" : latestDate(l) }); };
  const pickObs = (id: string | null) => { const l = earthLayer(id); set({ obs: id, obsDate: l && l.time !== "static" ? latestDate(l) : "" }); };
  const ref = (k: keyof LayerState["refs"], v: boolean) => set({ refs: { ...s.refs, [k]: v } });
  return (
    <div className="layerpanel">
      <fieldset>
        <legend>Similarity layer <span>from the scan</span></legend>
        <label className="opt"><input type="checkbox" checked={s.overlay} onChange={(e) => set({ overlay: e.target.checked })} /><span><b>Show similarity</b><small>Best-scoring 30% of land for the chosen region and dimension. Pipeline output, 0.25° cells.</small></span></label>
        <div className="seg" role="group" aria-label="Similarity style">
          <button aria-pressed={s.classed} onClick={() => set({ classed: true })}>Five classes</button>
          <button aria-pressed={!s.classed} onClick={() => set({ classed: false })}>Continuous</button>
        </div>
        <label className="slider"><span>Opacity</span><input type="range" min={0.2} max={1} step={0.05} value={s.overlayOpacity} style={{ ["--v" as any]: `${((s.overlayOpacity - 0.2) / 0.8) * 100}%` }} onChange={(e) => set({ overlayOpacity: +e.target.value })} aria-label="Similarity layer opacity" /><span className="num">{Math.round(s.overlayOpacity * 100)}%</span></label>
      </fieldset>

      <fieldset>
        <legend>Basemap <span>one at a time</span></legend>
        {earthLayers("base").map((l) => (
          <label className="opt" key={l.id}><input type="radio" name="base" checked={s.base === l.id} onChange={() => pickBase(l.id)} /><span><b>{l.name}</b><small>{l.purpose}</small><small className="src">{l.source} · {l.resolution}</small></span></label>
        ))}
        <DateControl l={base} date={s.baseDate} set={(d) => set({ baseDate: d })} />
      </fieldset>

      <fieldset>
        <legend>Observations <span>pictures of data, not scored</span></legend>
        <label className="opt"><input type="radio" name="obs" checked={!s.obs} onChange={() => pickObs(null)} /><span><b>None</b></span></label>
        {earthLayers("observation").map((l) => (
          <div key={l.id} className={s.obs === l.id ? "optwrap on" : "optwrap"}>
            <label className="opt"><input type="radio" name="obs" checked={s.obs === l.id} onChange={() => pickObs(l.id)} /><span><b>{l.name}</b>{l.scored && <em title={l.scored}>same product is scored</em>}<small>{l.purpose}</small></span></label>
            {s.obs === l.id && (
              <div className="optbody">
                <DateControl l={l} date={s.obsDate} set={(d) => set({ obsDate: d })} />
                <label className="slider"><span>Opacity</span><input type="range" min={0.2} max={1} step={0.05} value={s.obsOpacity} style={{ ["--v" as any]: `${((s.obsOpacity - 0.2) / 0.8) * 100}%` }} onChange={(e) => set({ obsOpacity: +e.target.value })} aria-label="Observation layer opacity" /><span className="num">{Math.round(s.obsOpacity * 100)}%</span></label>
                <Facts l={l} />
              </div>
            )}
          </div>
        ))}
      </fieldset>

      <fieldset>
        <legend>Reference <span>any combination</span></legend>
        <label className="opt"><input type="checkbox" checked={s.refs.graticule} onChange={(e) => ref("graticule", e.target.checked)} /><span><b>Graticule</b><small>Latitude and longitude every 10°, computed.</small></span></label>
        <label className="opt"><input type="checkbox" checked={s.refs.coast} onChange={(e) => ref("coast", e.target.checked)} /><span><b>Coastlines</b><small>Natural Earth 1:50m.</small></span></label>
        <label className="opt"><input type="checkbox" checked={s.refs.borders} onChange={(e) => ref("borders", e.target.checked)} /><span><b>Country boundaries</b><small>Natural Earth 1:50m, de facto lines.</small></span></label>
        <label className="opt"><input type="checkbox" checked={s.refs.labels} onChange={(e) => ref("labels", e.target.checked)} /><span><b>Names of deserts, plateaus and ranges</b><small>Natural Earth physical regions.</small></span></label>
        <div className={s.refs.geology ? "optwrap on" : "optwrap"}>
          <label className="opt"><input type="checkbox" checked={s.refs.geology} onChange={(e) => ref("geology", e.target.checked)} /><span><b>Geologic map units</b><em title={earthLayer("geology")!.scored}>same source is scored</em><small>{earthLayer("geology")!.purpose}</small></span></label>
          {s.refs.geology && <div className="optbody"><Facts l={earthLayer("geology")!} /></div>}
        </div>
      </fieldset>
      <p className="fine">{EARTH_LAYERS.length} outside layers in all. Every one is listed with its limits on the Method &amp; data page.</p>
    </div>
  );
}

/** One line of credit for whatever is on the map right now. */
export function attribution(s: LayerState, landCells: number, deg: number) {
  const parts = [`${landCells.toLocaleString()} land cells scored on a ${deg}° grid`];
  const base = earthLayer(s.base)!;
  parts.push(`Basemap: ${base.attribution}`);
  const obs = earthLayer(s.obs);
  if (obs) parts.push(`Overlay: ${obs.attribution}`);
  if (s.refs.geology) parts.push(earthLayer("geology")!.attribution);
  if (s.refs.coast || s.refs.borders || s.refs.labels) parts.push("Natural Earth");
  return parts.join("; ");
}

export { ConfMark };
