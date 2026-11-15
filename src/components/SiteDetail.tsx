import { useEffect, useMemo, useState } from "react";
import { useActiveSection } from "../lib/useActiveSection";
import type { Bundle, FactorId, FeatureDef, Site, Target } from "../lib/data";
import { asset } from "../lib/data";
import { combine, fmt, smart, type Weights } from "../lib/score";
import { ddPair, dmsPair } from "../lib/geo";
import { browserLink, recentScenes, type Scene } from "../lib/stac";
import { ConfMark, Pips, ProfileChart, Relief, SlopeChart, ThermalChart, TINT, bodyColor, reliefExag } from "./charts";
import { BodyMap, Locator, SiteMap, type PassRequest } from "./MiniMaps";

const SITE_KEY: Record<string, string> = { slope: "slope_med", relief: "relief", hurst: "hurst", t_mean: "t_mean", t_dtr: "t_dtr", t_cold: "t_cold",
  precip: "precip", albedo: "albedo", bare: "ndvi", pressure: "pressure", dust: "dust", tqv: "tqv", cryo: "t_mean", frozen: "frozen" };
const TARGET_KEY: Record<string, string> = { slope: "slope_med", relief: "relief", hurst: "hurst", t_mean: "t_mean", t_dtr: "t_dtr", t_cold: "t_cold",
  precip: "precip", albedo: "albedo", bare: "ndvi", pressure: "pressure", dust: "dust", tqv: "tqv" };
const METHOD: Record<string, string> = { distribution: "distribution match", direct: "direct match", direct_log: "direct match (log)", gap: "gap closure",
  gap_log: "gap closure (log)", proxy_cryo: "proxy", proxy_frozen: "proxy" };
const BODY_NAME: Record<string, string> = { earth: "Earth", mars: "Mars", moon: "Moon" };
/** Weakest evidence kind decides how a score bar is drawn: solid = measured, hatched = model or blend, dotted = proxy. */
const KIND_RANK: Record<string, number> = { measured: 0, compiled: 0, category: 0, blend: 1, model: 1, literature: 1, proxy: 2, definition: 0 };
const KIND_CLASS = ["k-measured", "k-model", "k-proxy"];

export function describe(fid: FactorId, site: Site, target: Target, b: Bundle): string {
  const f = site.features!, t = (k: string) => target.features[k]?.value, sc = site.scores[target.id];
  const pc = (k: string) => (sc.f[k] == null ? "—" : `${Math.round(sc.f[k]! * 100)}%`);
  const L = b.meta.geology.labels;
  switch (fid) {
    case "terrain": return `Median slope ${fmt(f.slope_med, 2)}° against ${fmt(t("slope_med"), 2)}°, and ${smart(f.relief)} m of relief against ${smart(t("relief"))} m across the same 61 km window.`;
    case "surface": return `Shortwave albedo ${fmt(f.albedo, 2)} against ${fmt(t("albedo"), 2)}; peak NDVI ${fmt(f.ndvi, 2)} (bare ground is ≤ 0.08).`;
    case "aridity": return `${smart(f.precip)} mm of precipitation a year: ${pc("precip")} of the way from typical Earth land to no rain at all (scores saturate at 10 mm/yr, the precision of the rainfall products).`;
    case "thermal": return `Mean surface temperature ${fmt(f.t_mean, 0)} K against ${fmt(t("t_mean"), 0)} K closes ${pc("t_mean")} of the gap from typical Earth land; the daily swing is ${fmt(f.t_dtr, 0)} K against ${fmt(t("t_dtr"), 0)} K (${pc("t_dtr")}).`;
    case "atmosphere": return `Surface pressure ${fmt(f.pressure, 0)} kPa against ${fmt(t("pressure"), 2)} kPa (${pc("pressure")} of the gap on a log scale); aerosol optical depth ${fmt(f.dust, 2)} against a dust optical depth of ${fmt(t("dust"), 2)}.`;
    case "ice": return `Surface frozen ${Math.round((f.frozen ?? 0) * 12)} months of the year with a mean of ${fmt(f.t_mean, 0)} K — a temperature-based proxy for ground that can hold ice, not a detection of ice.`;
    case "geology": {
      const have = site.geology?.classes.map((c) => L[c] ?? c).join(", ") || "no mapped units";
      const want = target.geology_assessable.map((c) => L[c] ?? c).join(", ");
      return `Mapped at the site: ${have}. Documented at ${target.name}: ${want}.`;
    }
  }
}

function applications(site: Site, target: Target, matched: FactorId[]): string[] {
  const out: string[] = [], sc = site.scores[target.id], g = site.geology?.classes ?? [];
  const body = target.body === "mars" ? "Mars" : "lunar";
  if (matched.includes("terrain")) out.push(`Traverse planning, navigation and long-range mobility trials on slopes statistically like ${target.name} at kilometre scale.`);
  if (matched.includes("surface")) out.push(`Camera, spectrometer and thermal-instrument field calibration over bare ground with a similar albedo.`);
  if (matched.includes("aridity")) out.push(`Life-detection, contamination-control and soil-chemistry protocols in ground that almost never sees liquid water.`);
  if (matched.includes("ice") || (sc.fac.ice ?? 0) >= 0.5) out.push(`Rehearsal of drilling and sampling in frozen ground for ${target.body === "mars" ? "Martian ground ice" : "lunar polar volatiles"} — at far milder temperatures than the real thing.`);
  if ((sc.fac.thermal ?? 0) >= 0.3) out.push(`Cold-soak and thermal-cycling tests of hardware; the site closes ${Math.round((sc.fac.thermal ?? 0) * 100)}% of the thermal gap, more than most of Earth.`);
  if (g.includes("volc_mafic") && target.geology.includes("volc_mafic")) out.push(`Field geology and resource-processing studies on basaltic rock, the documented lithology at ${target.name}.`);
  if (g.includes("evaporite") && target.geology.includes("evaporite")) out.push(`Salt and sulfate mineralogy studies relevant to the evaporite-bearing strata at ${target.name}.`);
  if ((site.features!.pressure ?? 101) < 62) out.push(`Human-factors and equipment work at roughly half sea-level pressure (still ~${Math.round((site.features!.pressure ?? 0) / (target.features.pressure?.value ?? 0.7))}× the ${body} surface value).`);
  if (!out.length) out.push("No dimension reaches the match threshold for this reference region; the site is better used for a different target (see the comparison below).");
  return out;
}

/* ------------------------------------------------------------------ satellite passes (live catalogue search) */
function Passes({ site, onShow }: { site: Site; onShow: (p: PassRequest) => void }) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; optical: Scene[]; radar: Scene[]; msg?: string }>({ status: "idle", optical: [], radar: [] });
  const [n, setN] = useState(0);
  useEffect(() => { setState({ status: "idle", optical: [], radar: [] }); }, [site.id]);
  const load = () => {
    const ac = new AbortController();
    setState({ status: "loading", optical: [], radar: [] });
    recentScenes(site.lat, site.lon, ac.signal)
      .then((r) => setState({ status: "done", ...r }))
      .catch((e) => setState({ status: "error", optical: [], radar: [], msg: String(e.message ?? e) }));
  };
  const show = (layer: "hls" | "sar", date: string) => { setN(n + 1); onShow({ layer, date, n: n + 1 }); document.querySelector(".sitemap")?.scrollIntoView({ block: "center", behavior: "smooth" }); };
  return (
    <div className="dsec" id="passes">
      <h3>Recent satellite passes over this site</h3>
      <p className="prose">A live search of the Copernicus catalogue for what Sentinel-2 (optical) and Sentinel-1 (radar) recorded here. It lists acquisitions, not measurements, and nothing from it enters a score. Choose a pass to draw it on the site map above.</p>
      {state.status === "idle" && <button className="btn" onClick={load}>Search the Copernicus catalogue</button>}
      {state.status === "loading" && <p className="note" role="status">Asking the Copernicus Data Space catalogue…</p>}
      {state.status === "error" && <p className="caution">The catalogue could not be reached ({state.msg}). The rest of the report does not depend on it. <button className="link" onClick={load}>Try again</button></p>}
      {state.status === "done" && (
        <>
          <table className="ledger passes">
            <caption>Sentinel-2 MSI, Level-2A, scenes with under 15% cloud</caption>
            <thead><tr><th>Date (UTC)</th><th>Satellite</th><th className="r">Cloud</th><th className="r">Sun elevation</th><th>Orbit</th><th></th></tr></thead>
            <tbody>
              {state.optical.length ? state.optical.map((s) => (
                <tr key={s.id}><td className="num">{s.date} {s.time}</td><td>{s.platform}</td><td className="num r">{s.cloud == null ? "—" : `${s.cloud.toFixed(1)}%`}</td><td className="num r">{s.sunElevation == null ? "—" : `${s.sunElevation.toFixed(0)}°`}</td><td>{s.orbit ?? "—"}{s.relOrbit ? ` R${s.relOrbit}` : ""}</td>
                  <td className="r"><button className="link" onClick={() => show("hls", s.date)}>Show on map</button> <a href={browserLink(site.lat, site.lon, s.date, "optical")} target="_blank" rel="noreferrer">Full product</a></td></tr>
              )) : <tr><td colSpan={6} className="muted">No low-cloud scene in the most recent results. Snow-covered and polar-night sites often return none.</td></tr>}
            </tbody>
          </table>
          <table className="ledger passes">
            <caption>Sentinel-1 C-band radar, ground-range detected (Level-1 GRD)</caption>
            <thead><tr><th>Date (UTC)</th><th>Satellite</th><th>Mode</th><th>Polarisation</th><th>Pass</th><th className="r">Incidence</th><th></th></tr></thead>
            <tbody>
              {state.radar.length ? state.radar.map((s) => (
                <tr key={s.id}><td className="num">{s.date} {s.time}</td><td>{s.platform}</td><td>{s.mode ?? "—"}</td><td className="num">{s.pols?.join(" + ") ?? "—"}</td><td>{s.orbit ?? "—"}{s.relOrbit ? ` R${s.relOrbit}` : ""}</td><td className="num r">{s.incidence == null ? "—" : `${s.incidence.toFixed(0)}°`}</td>
                  <td className="r"><button className="link" onClick={() => show("sar", s.date)}>Show on map</button> <a href={browserLink(site.lat, site.lon, s.date, "radar")} target="_blank" rel="noreferrer">Full product</a></td></tr>
              )) : <tr><td colSpan={7} className="muted">No radar scene returned. Sentinel-1 does not image every land area on every cycle.</td></tr>}
            </tbody>
          </table>
          <p className="caution">How to read radar here. Backscatter depends on surface roughness at centimetre scale, moisture, slope facing, look angle and polarisation at once. Two passes are comparable only when mode, polarisation, pass direction and relative orbit agree, which is why those columns are listed. Radar is shown as texture and structure. It is not evidence of rock type and does not show that this site and a planetary surface are geologically alike.</p>
          <p className="credit">Catalogue: Copernicus Data Space Ecosystem STAC (contains modified Copernicus Sentinel data). Map pictures: NASA GIBS, HLS S30 for optical and OPERA RTC-S1 for radar, which are processed from the same acquisitions and may lag them by several days.</p>
        </>
      )}
    </div>
  );
}

function Back() {
  return <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2 3.5 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

export function SiteDetail({ b, site, target, weights, pct, onBack, onTarget }:
  { b: Bundle; site: Site; target: Target; weights: Weights; pct: number; onBack: () => void; onTarget: (id: string) => void }) {
  const [view, setView] = useState<"image" | "relief">("image");
  const [pass, setPass] = useState<PassRequest | null>(null);
  const sc = site.scores[target.id];
  const { overall, coverage } = combine(sc.fac, sc.expected, weights);
  const cb = bodyColor(target.body);
  const exag = useMemo(() => reliefExag(site.window, target.window), [site, target]);
  const TH = b.meta.params.match_threshold;
  const facs = sc.expected.map((k) => ({ k, v: sc.fac[k] })).filter((x) => x.v != null) as { k: FactorId; v: number }[];
  const sorted = [...facs].sort((a, c) => c.v - a.v);
  const holds = sorted.filter((x) => x.v >= TH), fails = sorted.filter((x) => x.v < TH);
  const missing = sc.expected.filter((k) => sc.fac[k] == null);
  const label = (k: FactorId) => b.meta.factors.find((f) => f.id === k)!.label;
  const hasImg = b.imagery.sites[site.id];
  const feats = (k: FactorId) => b.meta.features.filter((f) => f.factor === k && f.id in sc.f);
  const f = site.features!;
  const best = (body: string) => b.targets.filter((t) => t.body === body).map((t) => ({ t, o: site.scores[t.id]?.overall.balanced ?? 0 })).sort((x, y) => y.o - x.o)[0]?.t;
  const [marsId, setMarsId] = useState<string | null>(null), [moonId, setMoonId] = useState<string | null>(null);
  const mars = b.targets.find((t) => t.id === marsId) ?? (target.body === "mars" ? target : best("mars")), moon = b.targets.find((t) => t.id === moonId) ?? (target.body === "moon" ? target : best("moon"));
  const triExag = Math.min(reliefExag(site.window, mars.window), reliefExag(site.window, moon.window));
  const [name, ...place] = site.name.split(" · ");
  const tBody = BODY_NAME[target.body];
  const polarTarget = Math.abs(target.lat) > 80;
  const targetImg = b.imagery.targets[target.id] ?? "";
  const polar = target.climate.kind === "moon" ? target.climate.polar : null;
  const sections: [string, string][] = [
    ["verdict", "Matches"], ["sitemap", "Site map"], ["imagery", "Imagery"], ["terrain", "Terrain"], ["thermal", "Thermal"], ["scores", "Scores"],
    ["confidence", "Confidence"], ["geology", "Geology"], ["passes", "Satellite passes"], ["uses", "Uses"], ["reference", tBody], ["triptych", "Three bodies"],
  ];
  const active = useActiveSection(sections.map(([id]) => id));
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });

  const row = (fd: FeatureDef) => {
    const ev = f[SITE_KEY[fd.id]] as number | null, tk = TARGET_KEY[fd.id], tf = tk ? target.features[tk] : undefined;
    const tval = fd.id === "bare" ? "none" : fd.id === "cryo" ? "ground ice" : fd.id === "frozen" ? "always" : tf ? smart(tf.value, fd.unit === "deg" ? "°" : fd.unit) : "—";
    const eval_ = fd.id === "frozen" ? `${Math.round((ev ?? 0) * 12)} / 12 mo` : smart(ev, fd.unit === "deg" ? "°" : fd.unit);
    const s = sc.f[fd.id], kc = KIND_CLASS[Math.max(KIND_RANK[fd.earth_kind] ?? 0, tf ? KIND_RANK[tf.kind] ?? 0 : 0)];
    return (
      <tr key={fd.id}>
        <td className="l">{fd.label}<span className="m">{METHOD[fd.method]}. Earth <span className={`tag ${fd.earth_kind}`}>{fd.earth_kind}</span>{tf && <> {tBody} <span className={`tag ${tf.kind}`}>{tf.kind}</span></>}</span></td>
        <td className="n"><span className="e-c">{eval_}</span><span className="vs">vs</span><span className="p-c">{tval}</span></td>
        <td className="b"><div className={`bar thin ${kc}`}><i style={{ width: `${(s ?? 0) * 100}%` }} /></div></td>
        <td className="n s">{fmt(s, 2)}</td>
      </tr>
    );
  };

  return (
    <article className="report" data-body={target.body}>
      <div className="dbar">
        <button className="back" onClick={onBack} title={`Back to the ranking for ${target.name}`}><Back />Ranking</button>
        <nav className="dindex" aria-label="Sections of this report">
          {sections.map(([id, t]) => <a key={id} href={`#${id}`} aria-current={active === id ? "true" : undefined} onClick={(e) => { e.preventDefault(); jump(id); }}>{t}</a>)}
        </nav>
      </div>
      <header className="dhead">
        <div className="dtitle">
          <div>
            <p className="reportline">Field report {site.id.toUpperCase()}, compared with {target.name}, {tBody}</p>
            <h2>{name}</h2>
            {place.length > 0 && <p className="place">{place.join(", ")}</p>}
            <p className="coords num"><span>{dmsPair(site.lat, site.lon)}</span><span>{ddPair(site.lat, site.lon, 3)}</span><span>{smart(f.elev)} m elevation</span></p>
            <p className="status">
              <span className={`tag ${site.kind === "known" ? "known" : "cand"}`}>{site.kind === "known" ? "established analog" : "scan candidate"}</span>
              {site.nearest_known && <span className="muted"> {site.nearest_known.km} km from the nearest established analog ({site.nearest_known.name})</span>}
            </p>
          </div>
          <Locator lat={site.lat} lon={site.lon} size={104} marks={[{ lat: site.lat, lon: site.lon, on: true }]} />
        </div>
        <div className="kpis">
          <div className="kpi lead"><div className="k">Similarity to {target.name}</div><div className="v">{fmt(overall, 2)}</div><div className="tiny muted">0 to 1, current weights</div></div>
          <div className="kpi"><div className="k">Dimensions matched</div><div className="v">{sc.matched.length}<small> of {sc.expected.length}</small></div><Pips expected={sc.expected} matched={sc.matched} have={(k) => sc.fac[k as FactorId] != null} /></div>
          <div className="kpi"><div className="k">Earth rank</div><div className="v">{Number.isFinite(pct) ? <>{pct >= 99.95 ? "top 0.1" : `top ${(100 - pct).toFixed(pct > 99 ? 1 : 0)}`}<small>%</small></> : "—"}</div><div className="tiny muted">{Number.isFinite(pct) ? "of land, before geology" : "computing from the grid…"}</div></div>
          <div className="kpi"><div className="k">Confidence</div><div className="v conf-v"><ConfMark label={sc.conf.label} /></div><div className="tiny muted">coverage {Math.round(coverage * 100)}%, kept apart from similarity</div></div>
        </div>
      </header>

      {site.known && (
        <div className="dsec">
          <h3>Established use</h3>
          <p className="prose">{site.known.note}</p>
          <p className="credit">{site.known.ref} · used for {site.known.for_.join(" and ")} · basis: {site.known.basis.map((x) => ({ env: "environment", geo: "geology", ops: "operations heritage" } as any)[x]).join(", ")}</p>
        </div>
      )}

      <div className="dsec verdict" id="verdict">
        <h3>What matches, what does not</h3>
        <div className="holdfail">
          <section>
            <h4>Where the analogy holds <span className="num">{holds.length}</span></h4>
            {holds.length ? <ul className="plain">{holds.map((x) => <li key={x.k} className="plus"><b>{label(x.k)} {fmt(x.v, 2)} — matched.</b> {describe(x.k, site, target, b)}</li>)}</ul>
              : <p className="note">No dimension reaches the match threshold of {TH} for this reference region.</p>}
          </section>
          <section>
            <h4>Where it fails <span className="num">{fails.length}</span></h4>
            {fails.length ? <ul className="plain">{fails.map((x) => <li key={x.k} className="minus"><b>{label(x.k)} {fmt(x.v, 2)}.</b> {describe(x.k, site, target, b)}</li>)}</ul>
              : <p className="note">Every dimension with data reaches the threshold. Read the limits at the end of this report before treating that as equivalence.</p>}
            {missing.length > 0 && <p className="note">No data, so not counted either way: {missing.map(label).join(", ")}.</p>}
          </section>
        </div>
      </div>

      <div className="dsec" id="sitemap">
        <h3>Site map</h3>
        <SiteMap key={site.id} lat={site.lat} lon={site.lon} name={site.name} halfKm={b.imagery.footprint_km / 2} pass={pass} />
      </div>

      <div className="dsec" id="imagery">
        <h3><span>Same footprint, same scale, {b.imagery.footprint_km.toFixed(0)} km across</span>
          <span className="tabs2"><button aria-pressed={view === "image"} onClick={() => setView("image")}>Imagery</button><button aria-pressed={view === "relief"} onClick={() => setView("relief")}>Relief</button></span></h3>
        <div className="twocol">
          <div>
            <div className="frame">
              {view === "image" ? (hasImg ? <img src={asset(`img/sites/${site.id}.jpg`)} alt={`Satellite image of ${site.name}`} loading="lazy" /> : <div className="empty">No usable imagery snapshot for this site (featureless snow or no mosaic coverage). Switch to Relief.</div>)
                : <Relief win={site.window} stepKm={b.meta.window.step_km} exag={exag} tint={TINT.earth} />}
              <div className="cap e">Earth</div><div className="scale" style={{ width: "32.9%" }}>20 km</div>
            </div>
            <div className="credit">{view === "image" ? b.imagery.site_credit : `ETOPO 2022 shaded relief · vertical exaggeration ×${exag}`}</div>
          </div>
          <div>
            <div className="frame">
              {view === "image" ? <img src={asset(`img/targets/${target.id}.jpg`)} alt={`Orbital image of ${target.name}`} loading="lazy" />
                : <Relief win={target.window} stepKm={b.meta.window.step_km} exag={exag} tint={TINT[target.body]} />}
              <div className="cap p">{target.name}</div><div className="scale" style={{ width: "32.9%" }}>20 km</div>
            </div>
            <div className="credit">{view === "image" ? targetImg : `${target.body === "mars" ? "MOLA" : "LOLA"} shaded relief · vertical exaggeration ×${exag}`}</div>
          </div>
        </div>
        <p className="note">Imagery is for orientation only and never enters a score. Relief is drawn from the exact elevation samples the terrain score uses.</p>
        <table className="ledger compare">
          <caption>What is and is not comparable between these two panels</caption>
          <thead><tr><th></th><th>Earth panel</th><th>{target.name} panel</th><th>Comparable?</th></tr></thead>
          <tbody>
            <tr><th>Ground footprint</th><td>{b.imagery.footprint_km.toFixed(1)} km square</td><td>{b.imagery.footprint_km.toFixed(1)} km square</td><td>Yes. Each is sized with its own body's radius.</td></tr>
            <tr><th>Imagery</th><td>Sentinel-2 visible true colour, 10 m source, cloud-free composite of 2020</td>
              <td>{target.body === "mars" ? "THEMIS daytime thermal infrared, 100 m mosaic" : polarTarget ? "No image: shaded relief computed from LOLA 240 m elevation" : "LROC WAC visible, single band, 100 m mosaic"}</td>
              <td>{target.body === "mars" ? "Shape only. Infrared brightness is temperature, not colour or albedo." : polarTarget ? "Shape only. The lunar panel is synthetic shading, not a photograph." : "Shape and relative tone. Colour exists only on the Earth side."}</td></tr>
            <tr><th>Lighting</th><td>Many dates and sun angles merged</td><td>{target.body === "mars" ? "Daytime, mixed local times" : polarTarget ? "Artificial light from the north-west, 25° high" : "Mosaic with sun angle varying about 28° across a month"}</td><td>No. Do not compare shadows or brightness.</td></tr>
            <tr><th>Projection</th><td colSpan={2}>Both are simple cylindrical boxes scaled by the cosine of latitude{polarTarget ? "; the lunar polar panel is cut from a polar stereographic grid" : ""}</td><td>{polarTarget ? "Approximately. Shapes near the pole are sheared on a cylindrical grid, so the polar panel uses its own." : "Yes at this size; distortion across 61 km is under 1%."}</td></tr>
            <tr><th>Relief view</th><td>NOAA ETOPO 2022, 1.85 km</td><td>{target.body === "mars" ? "MGS MOLA MEGDR, 1.85 km" : "LRO LOLA LDEM, 1.90 km"}</td><td>Yes. Same 32 × 32 sampling at {b.meta.window.step_km} km, same light, same vertical exaggeration. This is the view the terrain score is built on.</td></tr>
          </tbody>
        </table>
      </div>

      <div className="dsec" id="terrain">
        <h3>Terrain: elevation profile through the window centre</h3>
        <ProfileChart a={site.profile} b={target.profile} stepKm={b.meta.window.step_km} la={site.name} lb={target.name} cb={cb} />
        <h3 className="sub">Terrain: slope distribution</h3>
        <SlopeChart qa={f.slope_q as unknown as number[]} qb={target.slope_q} qs={b.meta.slope_q} la={site.name} lb={target.name} cb={cb} />
        <p className="credit">Earth: NOAA ETOPO 2022 (1.85 km). {target.body === "mars" ? "Mars: MGS MOLA MEGDR 32 px/deg (1.85 km)." : "Moon: LRO LOLA LDEM 16 px/deg (1.90 km)."} Identical sampling on both bodies.</p>
      </div>

      <div className="dsec" id="thermal">
        <h3>Thermal, in kelvin</h3>
        <ThermalChart target={target} site={site} />
        <p className="credit">Earth: MERRA-2 skin temperature sharpened with MODIS LST ({site.sources?.thermal === "MODIS" ? "MODIS detail available" : "no MODIS detail here"}). {target.features.t_mean?.source}.</p>
        {polar && (
          <div className="polar">
            <h4>Inside the lunar polar window: Diviner Polar Resource Product</h4>
            <dl className="facts">
              <div><dt>Median annual mean</dt><dd>{fmt(polar.t_avg_median, 0)} K</dd></div>
              <div><dt>Coldest annual mean</dt><dd>{fmt(polar.t_avg_min, 0)} K</dd></div>
              <div><dt>Median annual maximum</dt><dd>{fmt(polar.t_max_median, 0)} K</dd></div>
              <div><dt>Hottest annual maximum</dt><dd>{fmt(polar.t_max_max, 0)} K</dd></div>
              <div><dt>Never above 110 K</dt><dd>{polar.trap_frac == null ? "—" : `${(polar.trap_frac * 100).toFixed(1)}% of the window`}</dd></div>
              <div><dt>Ice stable within 1 m</dt><dd>{polar.ice_stable_frac == null ? "—" : `${(polar.ice_stable_frac * 100).toFixed(0)}% of the window`}</dd></div>
            </dl>
            <p className="note">From {polar.n?.toLocaleString()} samples of the 0.5 km polar mesh (LRO-L-DLRE-5-PRP-V2.0, Paige et al. 2010). Temperatures are measured; the ice-stability depth is a thermal model built on them. At the poles these values replace the 0.5° global bin, which mixes sunlit ridge and permanent shadow. The Earth site is compared with the window median, so it says nothing about the cold traps themselves.</p>
          </div>
        )}
      </div>

      <div className="dsec" id="scores">
        <h3><span>Score breakdown</span><span>score 0 to 1</span></h3>
        {sc.expected.map((k) => (
          <div className="fac" key={k}>
            <div className="fachead">
              <span className="fn">{label(k)}</span>
              <div className="bar"><i style={{ width: `${(sc.fac[k] ?? 0) * 100}%`, opacity: sc.fac[k] == null ? 0 : 1 }} /><u style={{ left: `${TH * 100}%` }} /></div>
              <span className="v">{sc.fac[k] == null ? "n/a" : fmt(sc.fac[k], 2)}</span>
            </div>
            {k === "geology" ? (
              <table className="ftable"><tbody>
                {sc.geo.length ? sc.geo.map((g) => (
                  <tr key={g.target}><td className="l">{b.meta.geology.labels[g.target]}<span className="m">category affinity. <span className="tag category">compiled maps</span></span></td>
                    <td className="n"><span className="e-c">{g.match ? b.meta.geology.labels[g.match] : "not mapped"}</span></td><td className="b"><div className="bar thin k-measured"><i style={{ width: `${g.affinity * 100}%` }} /></div></td><td className="n s">{fmt(g.affinity, 2)}</td></tr>
                )) : <tr><td className="l">No lithology data returned for this point — geology is excluded from the score and lowers coverage.</td></tr>}
              </tbody></table>
            ) : <table className="ftable"><tbody>{feats(k).map(row)}</tbody></table>}
          </div>
        ))}
        <p className="barkey"><span className="bar thin k-measured"><i /></span> measured <span className="bar thin k-model"><i /></span> model or blend on either side <span className="bar thin k-proxy"><i /></span> proxy</p>
        <p className="note">The tick on each bar marks the match threshold ({TH}). Factors combine as a weighted geometric mean, so one failed dimension cannot be bought back by another.</p>
      </div>

      <div className="dsec" id="confidence">
        <h3>Confidence, kept separate from similarity</h3>
        <div className="meters">
          <div className="meter"><div className="k">Evidence coverage</div><div className="v">{Math.round(sc.conf.coverage * 100)}%</div><div className="bar ink"><i style={{ width: `${sc.conf.coverage * 100}%` }} /></div><div className="tiny muted">share of the profile backed by data</div></div>
          <div className="meter"><div className="k">Evidence quality</div><div className="v">{fmt(sc.conf.evidence, 2)}</div><div className="bar ink"><i style={{ width: `${sc.conf.evidence * 100}%` }} /></div><div className="tiny muted">measured 1.0 · model 0.7 · proxy 0.5</div></div>
          <div className="meter"><div className="k">Rank stability</div><div className="v">{fmt(sc.conf.stability, 2)}</div><div className="bar ink"><i style={{ width: `${sc.conf.stability * 100}%` }} /></div><div className="tiny muted">percentile {fmt(sc.conf.pct_p10, 1)}–{fmt(sc.conf.pct_p90, 1)} over {b.meta.sensitivity.runs} perturbed runs</div></div>
        </div>
        <p className="note">Confidence is the product of the three, here {fmt(sc.conf.value, 2)}: <ConfMark label={sc.conf.label} />. It is drawn as a fill, never in the similarity colours, and it never changes the similarity number.</p>
        <p className="note">Cross-checks at this cell — temperature: MODIS {fmt(f.modis_t_mean, 0)} K vs MERRA-2 {fmt(f.merra_t_mean, 0)} K · precipitation: IMERG {smart(f.imerg_precip)} vs MERRA-2 {smart(f.merra_precip)} mm/yr · albedo: MODIS {fmt(f.modis_albedo, 2)} vs CERES {fmt(f.ceres_albedo, 2)}.</p>
      </div>

      <div className="dsec" id="geology">
        <h3>Geological context</h3>
        <p className="prose"><b>{target.name}:</b> {target.geology_note} <span className="dim">({target.geology_ref})</span></p>
        {site.geology?.units.length ? site.geology.units.slice(0, 3).map((u, i) => (
          <div className="unit" key={i}>
            <div className="u1"><b>{u.name || u.lith || "Unnamed unit"}</b><span className="tag">{u.scale} scale</span></div>
            <div className="muted">{u.lith}{u.age ? ` · ${u.age}` : ""}</div>
            {u.ref && <div className="credit">{u.ref}</div>}
          </div>
        )) : <p className="note">Macrostrat returned no mapped unit at this point.</p>}
        <p className="credit">Lithology from Macrostrat (CC-BY 4.0). Turn on “Geologic units” in the site map above to see the mapped boundaries. Not assessed from maps: {target.geology.filter((c) => b.meta.geology.unassessed.includes(c)).map((c) => b.meta.geology.labels[c]).join(", ") || "—"}.</p>
      </div>

      <Passes site={site} onShow={setPass} />

      <div className="dsec" id="uses">
        <h3>What this site could be used for</h3>
        <ul className="plain">{applications(site, target, sc.matched).map((a, i) => <li key={i}>{a}</li>)}</ul>
      </div>

      <div className="dsec" id="reference">
        <h3>{target.name} on {target.body === "mars" ? "Mars" : "the Moon"}</h3>
        <BodyMap body={target.body} targets={b.targets.filter((t) => t.body === target.body)} selected={target.id} onSelect={onTarget} />
      </div>

      <div className="dsec" id="triptych">
        <h3>Earth, Mars and the Moon at the same scale</h3>
        <div className="tri">
          {[{ body: "earth", name: site.name, win: site.window, t: null as Target | null }, { body: "mars", name: mars.name, win: mars.window, t: mars }, { body: "moon", name: moon.name, win: moon.window, t: moon }].map((c) => {
            const v = (k: string) => (c.t ? c.t.features[k]?.value : (f[k] as number | null));
            return (
              <div key={c.body}>
                <div className="frame"><Relief win={c.win} stepKm={b.meta.window.step_km} exag={triExag} tint={TINT[c.body]} /><div className={`cap ${c.body === "earth" ? "e" : c.body}`}>{BODY_NAME[c.body]}</div></div>
                {c.t ? (
                  <select className="sel" value={c.t.id} onChange={(e) => (c.body === "mars" ? setMarsId : setMoonId)(e.target.value)} aria-label={`${c.body} reference region`}>
                    {b.targets.filter((t) => t.body === c.body).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                ) : <h4>{name}</h4>}
                <p className="num tiny muted">{c.t ? ddPair(c.t.lat, c.t.lon) : ddPair(site.lat, site.lon)}</p>
                <div className="kv">
                  <span>Median slope</span><span>{fmt(v("slope_med"), 2)}°</span>
                  <span>Relief</span><span>{smart(v("relief"))} m</span>
                  <span>Mean temperature</span><span>{fmt(v("t_mean"), 0)} K</span>
                  <span>Daily swing</span><span>{fmt(v("t_dtr"), 0)} K</span>
                  <span>Albedo</span><span>{fmt(v("albedo"), 2)}</span>
                  <span>Pressure</span><span>{c.body === "moon" ? "vacuum" : `${smart(v("pressure"))} kPa`}</span>
                  {c.t && <><span>Similarity to site</span><span style={{ color: bodyColor(c.body) }}>{fmt(site.scores[c.t.id]?.overall.balanced, 2)}</span></>}
                </div>
                {c.t && c.t.id !== target.id && <button className="chip" onClick={() => onTarget(c.t!.id)}>Compare against this</button>}
              </div>
            );
          })}
        </div>
        <p className="credit">Relief: ETOPO 2022, MOLA, LOLA at ~1.9 km sampling, shared vertical exaggeration ×{triExag}. Mars temperatures and pressure are Mars Climate Database model values; lunar temperatures are Diviner measurements. A lunar day lasts 29.5 Earth days and a Martian sol 24.66 hours, so the three daily swings are not over the same length of time.</p>
      </div>

      <div className="dsec">
        <div className="callout"><b>Read this before visiting.</b> No site on Earth reproduces {target.body === "mars" ? "0.38 g, a 0.6 kPa CO₂ atmosphere" : "0.17 g, hard vacuum"} or the surface radiation environment. The score says the measured variables resemble {target.name}; it is an argument for field work, not a replacement for it.</div>
      </div>
    </article>
  );
}
