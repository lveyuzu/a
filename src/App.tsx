import { useCallback, useEffect, useMemo, useState } from "react";
import type { Body, Bundle, FactorId, Site, Target } from "./lib/data";
import { loadBundle, loadGrid } from "./lib/data";
import { cellValue, combine, distribution, fmt, gridOverall, rampFor, scoreClasses, type Weights } from "./lib/score";
import { earthLayer, latestDate } from "./lib/layers";
import { ddPair } from "./lib/geo";
import { MapView, type MapSite } from "./components/MapView";
import { SiteDetail } from "./components/SiteDetail";
import { ConfMark, Pips } from "./components/charts";
import { Findings, Method, Portfolio } from "./components/Pages";
import { BodyMap, Locator } from "./components/MiniMaps";
import { DEFAULT_LAYERS, Legend, LayerPanel, ProbeBar, SiteGlyph, attribution, type LayerState } from "./components/Workspace";

type View = "explore" | "findings" | "portfolio" | "method";
type Layer = "overall" | FactorId;
const VIEWS: { id: View; label: string }[] = [
  { id: "explore", label: "Explore" }, { id: "findings", label: "Findings" }, { id: "portfolio", label: "Portfolio" }, { id: "method", label: "Method & data" },
];
type ConfMin = "any" | "moderate" | "high";
// On narrow screens the four side panels share one place under the map; this bar chooses which is shown.
type Pane = "sites" | "reference" | "question" | "layers";
const PANES: { id: Pane; label: string }[] = [{ id: "sites", label: "Sites" }, { id: "reference", label: "Region" }, { id: "question", label: "Question" }, { id: "layers", label: "Layers" }];
const CONF_OK: Record<ConfMin, string[]> = { any: ["high", "moderate", "low"], moderate: ["high", "moderate"], high: ["high"] };

function readHash() {
  const [path, query] = window.location.hash.replace(/^#\/?/, "").split("?");
  const q = new URLSearchParams(query ?? "");
  return { view: (VIEWS.find((v) => v.id === path)?.id ?? "explore") as View, t: q.get("t"), s: q.get("s"), l: q.get("l"), b: q.get("b"), o: q.get("o") };
}

export default function App() {
  const [b, setB] = useState<Bundle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const init = useMemo(readHash, []);
  const [view, setView] = useState<View>(init.view);
  const [targetId, setTargetId] = useState<string>(init.t ?? "jezero");
  const [siteId, setSiteId] = useState<string | null>(init.s);
  const [profile, setProfile] = useState<string>("balanced");
  const [weights, setWeights] = useState<Weights | null>(null);
  const [layer, setLayer] = useState<Layer>((init.l as Layer) ?? "overall");
  const [kind, setKind] = useState<"all" | "known" | "candidate">("all");
  const [confMin, setConfMin] = useState<ConfMin>("any");
  const [ls, setLs] = useState<LayerState>(() => {
    const base = earthLayer(init.b)?.role === "base" ? init.b! : DEFAULT_LAYERS.base;
    const obs = earthLayer(init.o)?.role === "observation" ? init.o! : null;
    const bl = earthLayer(base)!, ol = earthLayer(obs);
    return { ...DEFAULT_LAYERS, base, baseDate: bl.time === "static" ? "" : latestDate(bl), obs, obsDate: ol && ol.time !== "static" ? latestDate(ol) : "" };
  });
  const [railTab, setRailTab] = useState<"question" | "layers">("question");
  const [sideTab, setSideTab] = useState<"ranking" | "reference">("ranking");
  const [pane, setPane] = useState<Pane>("sites");
  const [grids, setGrids] = useState<{ id: string; g: Partial<Record<FactorId, Float32Array>> } | null>(null);
  const patchLs = useCallback((p: Partial<LayerState>) => setLs((s) => ({ ...s, ...p })), []);

  useEffect(() => { loadBundle().then((x) => { setB(x); setWeights({ ...x.meta.profiles.balanced.w }); }).catch((e) => setErr(String(e.message ?? e))); }, []);
  useEffect(() => {
    const on = () => { const h = readHash(); setView(h.view); if (h.t) setTargetId(h.t); setSiteId(h.s); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => {
    const q = new URLSearchParams();
    if (view === "explore") {
      q.set("t", targetId);
      if (siteId) q.set("s", siteId);
      if (layer !== "overall") q.set("l", layer);
      if (ls.base !== DEFAULT_LAYERS.base) q.set("b", ls.base);
      if (ls.obs) q.set("o", ls.obs);
    }
    const h = `#/${view}${q.toString() ? "?" + q : ""}`;
    if (window.location.hash !== h) window.history.replaceState(null, "", h);
  }, [view, targetId, siteId, layer, ls.base, ls.obs]);
  useEffect(() => { document.title = `${VIEWS.find((v) => v.id === view)!.label} · Planetary Twin`; }, [view]);

  const target: Target | undefined = b?.targets.find((t) => t.id === targetId) ?? b?.targets[0];
  const body: Body = target?.body ?? "mars";
  const gw = b?.meta.grid.nlon ?? 1440, gh = b?.meta.grid.nlat ?? 720;

  useEffect(() => {
    if (!b || !target) return;
    let live = true;
    Promise.all(Object.entries(target.grid).map(async ([k, p]) => [k, await loadGrid(p!, gw, gh)] as const)).then((pairs) => {
      if (live) setGrids({ id: target.id, g: Object.fromEntries(pairs) as any });
    });
    return () => { live = false; };
  }, [b, target?.id]);

  const liveGrids = grids && target && grids.id === target.id ? grids.g : null;
  const overallGrid = useMemo(() => {
    if (!liveGrids || !target || !weights) return null;
    return gridOverall(liveGrids, target.factors, weights, gw * gh);
  }, [liveGrids, weights, target?.id]);
  const dist = useMemo(() => (overallGrid ? distribution(overallGrid, gw, gh) : null), [overallGrid]);
  const activeLayer: Layer = layer !== "overall" && target && !target.factors.includes(layer) ? "overall" : layer;
  const shown = activeLayer === "overall" ? overallGrid : liveGrids?.[activeLayer] ?? null;
  const shownDist = useMemo(() => (!shown ? null : shown === overallGrid && dist ? dist : distribution(shown, gw, gh)), [shown, dist]);
  const domain = useMemo<[number, number]>(() => {
    if (!shownDist) return [0, 1];
    return [shownDist.quantile(0.7), Math.max(shownDist.quantile(0.999), shownDist.quantile(0.7) + 0.02)];
  }, [shownDist]);
  const classes = useMemo(() => (shownDist ? scoreClasses(shownDist) : null), [shownDist]);

  const ranked = useMemo(() => {
    if (!b || !target || !weights) return [] as { site: Site; overall: number; coverage: number }[];
    return b.sites.filter((s) => s.scores[target.id]).map((s) => ({ site: s, ...combine(s.scores[target.id].fac, s.scores[target.id].expected, weights) }))
      .filter((x) => Number.isFinite(x.overall)).sort((x, y) => y.overall - x.overall);
  }, [b, target?.id, weights]);
  const list = useMemo(() => ranked.filter((x) => (kind === "all" || x.site.kind === kind) && CONF_OK[confMin].includes(x.site.scores[target!.id].conf.label)), [ranked, kind, confMin]);
  const mapSites: MapSite[] = useMemo(() => {
    if (!b || !target) return [];
    const rk = new Map(list.slice(0, 8).map((x, i) => [x.site.id, i + 1]));
    const lab = (k: FactorId) => b.meta.factors.find((f) => f.id === k)!.label;
    // the map follows the filters; the open site always stays visible
    const vis = list.some((x) => x.site.id === siteId) ? list : [...list, ...ranked.filter((x) => x.site.id === siteId)];
    return vis.map((x) => {
      const sc = x.site.scores[target.id];
      return { site: x.site, score: x.overall, rank: rk.get(x.site.id) ?? null, conf: sc.conf.label, matched: sc.matched.length, expected: sc.expected.length,
        dims: sc.expected.map((k) => ({ label: lab(k), v: sc.fac[k] ?? null, on: sc.matched.includes(k) })) };
    });
  }, [list, ranked, siteId]);

  const go = useCallback((v: View) => { setView(v); }, []);
  const openSite = useCallback((sid: string, tid?: string) => { if (tid) setTargetId(tid); setSiteId(sid); setView("explore"); }, []);
  const pickTarget = (id: string) => { setTargetId(id); setLayer("overall"); };
  const pickBody = (bd: Body) => { if (bd !== body && b) pickTarget(b.targets.find((t) => t.body === bd)!.id); };
  const pickProfile = (p: string) => { setProfile(p); if (b) setWeights({ ...b.meta.profiles[p].w }); };

  if (err) return (
    <div className="loading failed" role="alert">
      <Mark size={44} />
      <h1>The analysis data did not load</h1>
      <p>{err}</p>
      <p className="fine">Run the data pipeline to generate <span className="num">web/public/data</span> (the README explains how), then reload this page.</p>
    </div>
  );
  if (!b || !target || !weights) return (
    <div className="loading" role="status">
      <Mark size={44} />
      <p>Loading the analysis</p>
      <i className="loadbar" aria-hidden="true" />
    </div>
  );

  const site = siteId ? b.sites.find((s) => s.id === siteId) : undefined;
  const sitePct = site && overallGrid && dist ? dist.pct(cellValue(overallGrid, gw, gh, site.lat, site.lon)) : NaN;
  const facLabel = (k: FactorId) => b.meta.factors.find((f) => f.id === k)!.label;
  const tf = (k: string, d = 0) => fmt(target.features[k]?.value, d);
  const rampName = rampFor(body);
  const bodyTargets = b.targets.filter((t) => t.body === body);
  const bodyName = body === "mars" ? "Mars" : "the Moon";
  const layerLabel = activeLayer === "overall" ? "overall similarity" : `${facLabel(activeLayer).toLowerCase()} score`;
  const profileLabel = profile === "custom" ? "custom weights" : `${b.meta.profiles[profile].label} profile`;
  const dossier = !!(site && site.scores[target.id]);
  const showPane = (p: Pane) => {
    setPane(p);
    if (p === "question" || p === "layers") setRailTab(p);
    else setSideTab(p === "sites" ? "ranking" : "reference");
  };
  const clearFilters = () => { setKind("all"); setConfMin("any"); };

  return (
    <div className="app" data-body={body}>
      <header className="masthead">
        <a className="brand" href="#/explore" onClick={() => go("explore")}>
          <Mark />
          <b>Planetary Twin</b><span>Earth analogs for the Moon and Mars</span>
        </a>
        <nav className="nav" aria-label="Sections">
          {VIEWS.map((v) => <button key={v.id} aria-current={view === v.id ? "page" : undefined} onClick={() => go(v.id)}>{v.label}</button>)}
        </nav>
        <div className="bodyswitch" role="group" aria-label="Planetary body">
          <span>Compare Earth with</span>
          <button data-b="mars" aria-pressed={body === "mars"} onClick={() => pickBody("mars")}><i aria-hidden="true" />Mars</button>
          <button data-b="moon" aria-pressed={body === "moon"} onClick={() => pickBody("moon")}><i aria-hidden="true" />Moon</button>
        </div>
      </header>

      {view === "explore" && (
        <div className={`explore view ${dossier ? "dossier-open" : ""}`} data-pane={pane}>
          <aside className="rail" aria-label="Question and map layers">
            <div className="railtabs" role="tablist">
              <button role="tab" aria-selected={railTab === "question"} onClick={() => setRailTab("question")}>Question</button>
              <button role="tab" aria-selected={railTab === "layers"} onClick={() => setRailTab("layers")}>Map layers</button>
            </div>
            {railTab === "question" ? (
              <>
                <div className="section">
                  <h3><span className="stepno" aria-hidden="true">1</span>Which place on {bodyName}?</h3>
                  <div className="refpick">
                    <Locator lat={target.lat} lon={target.lon} body={body} size={104} onPick={pickTarget}
                      marks={bodyTargets.map((t) => ({ id: t.id, lat: t.lat, lon: t.lon, on: t.id === target.id, title: t.name }))} />
                    <p className="fine">{bodyTargets.length} reference regions on {bodyName}. The ringed dot is the one selected; regions on the far side are hidden. Its imagery is under Reference region.</p>
                  </div>
                  <div className="tlist">
                    {bodyTargets.map((t) => (
                      <button key={t.id} className="titem" aria-pressed={t.id === target.id} onClick={() => pickTarget(t.id)}>
                        <span className="n">{t.name}</span><span className="c">{ddPair(t.lat, t.lon, 1)}</span>
                        <span className="s">{t.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="section">
                  <h3><span className="stepno" aria-hidden="true">2</span>What matters for the mission?</h3>
                  <div className="chips">
                    {Object.entries(b.meta.profiles).map(([k, p]) => <button key={k} className="chip" aria-pressed={profile === k} onClick={() => pickProfile(k)} title={p.blurb}>{p.label}</button>)}
                  </div>
                  <p className="note blurb">{profile === "custom" ? "Custom weights. The map and the ranking update as you drag." : b.meta.profiles[profile].blurb}</p>
                  <div className="weights">
                    {b.meta.factors.map((fa) => {
                      const on = fa.id === "geology" ? target.geology_assessable.length > 0 : target.factors.includes(fa.id);
                      return (
                        <div key={fa.id} className={`wrow ${on ? "" : "off"}`} title={on ? "" : "Not applicable to this reference region"}>
                          <span>{fa.label}</span>
                          <input type="range" min={0} max={4} step={0.25} value={weights[fa.id]} disabled={!on} aria-label={`${fa.label} weight`}
                            style={{ ["--v" as any]: `${(weights[fa.id] / 4) * 100}%` }}
                            onChange={(e) => { setProfile("custom"); setWeights({ ...weights, [fa.id]: Number(e.target.value) }); }} />
                          <span className="num">{weights[fa.id].toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="note">Geology is scored only for listed sites (it needs a map lookup), so it re-orders the ranking but not the global layer.</p>
                </div>
              </>
            ) : <LayerPanel s={ls} set={patchLs} />}
          </aside>

          <div className="mapcol">
            <div className="mapwrap">
              <MapView grid={shown} w={gw} h={gh} rampName={rampName} domain={domain} classes={ls.classed ? classes : null} showOverlay={ls.overlay} overlayOpacity={ls.overlayOpacity}
                base={ls.base} baseDate={ls.baseDate} obs={ls.obs} obsDate={ls.obsDate} obsOpacity={ls.obsOpacity} refs={ls.refs}
                sites={mapSites} selected={siteId} onSelect={setSiteId} targetName={target.name} deg={b.meta.grid.deg} />
              <div className="maphud">
                <div className="cartouche">
                  <p>Where Earth resembles</p>
                  <h2>{target.name}</h2>
                  <p className="sub">{target.sub}, {body === "mars" ? "Mars" : "Moon"} <span className="num">{ddPair(target.lat, target.lon)}</span></p>
                  <p className="sub">Showing {layerLabel}, {profileLabel}</p>
                </div>
                <div className="segs" role="group" aria-label="Dimension shown on the map">
                  <button aria-pressed={activeLayer === "overall"} onClick={() => setLayer("overall")}>Overall</button>
                  {target.factors.map((k) => <button key={k} aria-pressed={activeLayer === k} onClick={() => setLayer(k)}>{facLabel(k)}</button>)}
                </div>
              </div>
              <Legend title={activeLayer === "overall" ? "Overall similarity" : `${facLabel(activeLayer)} score`} unitLabel={activeLayer === "overall" ? "similarity" : `${facLabel(activeLayer).toLowerCase()} score`}
                classes={classes} classed={ls.classed} rampName={rampName} domain={domain} dist={shownDist} shown={ls.overlay} obs={earthLayer(ls.obs) ?? null} obsDate={ls.obsDate} />
            </div>
            <ProbeBar b={b} target={target} grids={liveGrids} overall={overallGrid} dist={dist} gw={gw} gh={gh} sites={b.sites} onOpen={setSiteId} />
            <div className="mapfoot">{attribution(ls, b.meta.grid.land_cells, b.meta.grid.deg)}</div>
          </div>

          {!dossier && (
            <div className="panebar" role="tablist" aria-label="Panels">
              {PANES.map((p) => <button key={p.id} role="tab" aria-selected={pane === p.id} onClick={() => showPane(p.id)}>{p.label}</button>)}
            </div>
          )}

          <aside className="side" aria-label={dossier ? "Field report" : "Ranked sites and reference region"}>
            {dossier ? (
              <SiteDetail key={site!.id + target.id} b={b} site={site!} target={target} weights={weights} pct={sitePct} onBack={() => setSiteId(null)} onTarget={pickTarget} />
            ) : (
              <>
                <div className="railtabs" role="tablist">
                  <button role="tab" aria-selected={sideTab === "ranking"} onClick={() => setSideTab("ranking")}>Ranked sites</button>
                  <button role="tab" aria-selected={sideTab === "reference"} onClick={() => setSideTab("reference")}>Reference region</button>
                </div>
                {sideTab === "ranking" ? (
                  <>
                    <div className="section">
                      <h3><span className="count num">{list.length}</span> sites ranked by similarity to {target.name}</h3>
                      <div className="filters">
                        {(["all", "known", "candidate"] as const).map((k) => <button key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === "all" ? "All" : k === "known" ? "Established" : "New candidates"}</button>)}
                      </div>
                      <div className="filters conf-filter" role="group" aria-label="Minimum confidence">
                        <span>Confidence</span>
                        {(["any", "moderate", "high"] as const).map((k) => <button key={k} className="chip" aria-pressed={confMin === k} onClick={() => setConfMin(k)}>{k === "any" ? "Any" : k === "moderate" ? "Moderate or high" : "High only"}</button>)}
                      </div>
                    </div>
                    {list.length === 0 && (
                      <div className="section empty-state">
                        <p>No listed site passes these filters for {target.name}.</p>
                        <p className="note">Leads with lower confidence still exist; they need checking before they can be trusted.</p>
                        <button className="btn" onClick={clearFilters}>Show every site</button>
                      </div>
                    )}
                    <ol className="ranklist">
                      {list.slice(0, 40).map((x, i) => {
                        const sc = x.site.scores[target.id];
                        const [nm, ...pl] = x.site.name.split(" · ");
                        return (
                          <li key={x.site.id}>
                            <button className="rk" onClick={() => setSiteId(x.site.id)}>
                              <span className="r num">{i + 1}</span>
                              <span className="nm" title={x.site.name}>{x.site.name}</span>
                              <span className="nm2" aria-hidden="true"><b>{nm}</b>{pl.length ? <i>{pl.join(", ")}</i> : null}</span>
                              <span className="sc">{fmt(x.overall, 2)}</span>
                              <span className="meta">
                                <SiteGlyph kind={x.site.kind} conf={sc.conf.label} />
                                <span className={`tag ${x.site.kind === "known" ? "known" : "cand"}`}>{x.site.kind === "known" ? "established" : "candidate"}</span>
                                <Pips expected={sc.expected} matched={sc.matched} have={(k) => sc.fac[k as FactorId] != null} />
                                <span className="num">{sc.matched.length}/{sc.expected.length}</span>
                                <ConfMark label={sc.conf.label} />
                                <span className="num dim">{ddPair(x.site.lat, x.site.lon, 1)}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                    <div className="section"><p className="note">Squares show which dimensions reach the match threshold ({b.meta.params.match_threshold}). Similarity and confidence are separate: a high score with low confidence is a lead, not a conclusion.</p></div>
                  </>
                ) : (
                  <div className="refsheet">
                    <div className="section">
                      <h3>{target.name}</h3>
                      <p className="prose">{target.sub}. {target.mission}.</p>
                      <p className="num small muted">{ddPair(target.lat, target.lon, 2)}</p>
                      <BodyMap body={body} targets={bodyTargets} selected={target.id} onSelect={pickTarget} />
                    </div>
                    <div className="section">
                      <h3>What Earth is compared against here</h3>
                      <table className="ftable ref"><tbody>
                        {([["Median slope", "slope_med", 2, "°"], ["Relief in 61 km", "relief", 0, " m"], ["Mean temperature", "t_mean", 0, " K"], ["Daily swing", "t_dtr", 0, " K"], ["Albedo", "albedo", 2, ""],
                          ...(body === "mars" ? [["Pressure", "pressure", 2, " kPa"]] : [])] as [string, string, number, string][]).map(([l, k, d, u]) => {
                          const m = target.features[k];
                          return <tr key={k}><td className="l">{l}<span className="m">{m?.source}</span></td><td className="n">{tf(k, d)}{u}</td><td className="n"><span className={`tag ${m?.kind}`}>{m?.kind}</span></td></tr>;
                        })}
                      </tbody></table>
                    </div>
                    <div className="section">
                      <h3>Documented geology</h3>
                      <p className="prose">{target.geology_note}</p>
                      <p className="credit">{target.geology_ref}</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      )}
      {view === "findings" && <Findings b={b} openSite={openSite} />}
      {view === "portfolio" && <Portfolio b={b} openSite={openSite} />}
      {view === "method" && <Method b={b} openSite={openSite} />}
    </div>
  );
}

/** The wordmark: Earth and its planetary twin, overlapping where they resemble each other. */
function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size * 0.62} viewBox="0 0 34 21" aria-hidden="true">
      <circle cx="11.5" cy="10.5" r="8.6" fill="none" stroke="var(--earth)" strokeWidth="1.5" />
      <circle cx="22.5" cy="10.5" r="8.6" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      <path d="M17 3.9a8.6 8.6 0 0 1 0 13.2a8.6 8.6 0 0 1 0-13.2z" fill="var(--fg)" />
    </svg>
  );
}
