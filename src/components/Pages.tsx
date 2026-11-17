import { useState, type ReactNode } from "react";
import type { Bundle, FactorId, SiteScore } from "../lib/data";
import { useActiveSection } from "../lib/useActiveSection";
import { asset } from "../lib/data";
import { fmt, smart } from "../lib/score";
import { ddPair } from "../lib/geo";
import { BODY_LAYERS, EARTH_LAYERS } from "../lib/layers";
import { ASSESSED } from "../lib/sources";
import { ConfMark, Pips, Relief, TINT, bodyColor, reliefExag } from "./charts";
import { describe } from "./SiteDetail";
import { Locator, WorldMap } from "./MiniMaps";

type Open = (siteId: string, targetId?: string) => void;
const tname = (b: Bundle, id: string) => b.targets.find((t) => t.id === id)?.name ?? id;
const flabel = (b: Bundle, k: string) => b.meta.factors.find((f) => f.id === k)?.label ?? k;
const BODY = { mars: "Mars", moon: "the Moon" } as const;
const pval = (p: number) => (p < 0.001 ? p.toExponential(0).replace("e-", " × 10⁻").replace(/⁻(\d)$/, (_, d) => "⁻" + "⁰¹²³⁴⁵⁶⁷⁸⁹"[+d]) : p.toFixed(3));

/* ------------------------------------------------------------------ FINDINGS */
export function Findings({ b, openSite }: { b: Bundle; openSite: Open }) {
  const v = b.validation, env = v.env.balanced;
  const lead = b.findings[0];
  const leadSite = lead && b.sites.find((s) => s.id === lead.site);
  const leadSc = leadSite?.scores[lead.target];
  return (
    <div className="page findings"><div className="pagein">
      <header className="pagehead">
        <h1>What a blind search of Earth's land surface turned up</h1>
        <p className="lede">Every one of {b.meta.grid.land_cells.toLocaleString()} land cells was scored against {b.targets.length} specific regions of the Moon and Mars using measured terrain, temperature, moisture, surface and atmosphere, then checked against independent geological maps. Nothing below was placed by hand: each site is where the numbers put it.</p>
      </header>

      <ol className="argument" aria-label="The three results">
        <li className="step">
          <div className="stephead"><h2>Proof</h2><div className="figure num">{env.top25}<small> of {env.n}</small></div></div>
          <div className="steptext">
            <p>analog sites that the community chose for their environment fall in the top quarter of Earth's land in our ranking; {env.top10} are in the top tenth. Chance alone would put about {Math.round(env.n * 0.25)} there (p = {pval(env.p)}).</p>
            <a href="#validation">See how each established site ranked</a>
          </div>
          <figure className="stepfig"><ProofStrip b={b} /></figure>
        </li>
        <li className="step">
          <div className="stephead"><h2>Surprise</h2><div className="figure num">{leadSc ? leadSc.matched.length : "—"}<small> of {leadSc ? leadSc.expected.length : "—"}</small></div></div>
          <div className="steptext">
            <p>dimensions matched by a site that appears on no established analog list we could find: {leadSite ? [leadSite.name.split(" · ")[0], leadSite.name.split(" · ").slice(-1)[0]].join(", ") : "—"}, against {lead ? tname(b, lead.target) : "—"}.</p>
            <a href="#finding-1">Read the evidence and its limits</a>
          </div>
          {leadSc && lead && <figure className="stepfig" data-body={b.targets.find((t) => t.id === lead.target)?.body}><DimBars b={b} sc={leadSc} /></figure>}
        </li>
        <li className="step">
          <div className="stephead"><h2>Usefulness</h2><div className="figure num">{b.portfolio.n_covered}<small> of {b.portfolio.n_requirements}</small></div></div>
          <div className="steptext">
            <p>region-by-dimension requirements are covered by a portfolio of {b.portfolio.chosen.length} complementary sites. The rest cannot be covered anywhere on Earth, and we say which.</p>
            <a href="#/portfolio">Open the portfolio</a>
          </div>
          <figure className="stepfig"><CoverageUnits b={b} /></figure>
        </li>
      </ol>

      {b.findings.map((f, i) => {
        const site = b.sites.find((s) => s.id === f.site), target = b.targets.find((t) => t.id === f.target);
        if (!site || !target || !site.scores[target.id]) return null;
        const sc = site.scores[target.id], ft = site.features!, cb = bodyColor(target.body), ex = reliefExag(site.window, target.window);
        const tv = (k: string) => target.features[k]?.value;
        return (
          <article className="finding" key={f.id} id={`finding-${i + 1}`} data-body={target.body}>
            <div className="ftext">
              <p className="kicker">Finding {i + 1}, compared with {target.name} on {BODY[target.body]}</p>
              <h3>{f.headline}</h3>
              <p className="prose lead">{f.summary}</p>
              <dl className="evgrid">
                <div className="ev"><dt>Dimensions matched</dt><dd>{sc.matched.length} of {sc.expected.length} <Pips expected={sc.expected} matched={sc.matched} have={(k) => sc.fac[k as FactorId] != null} /></dd></div>
                <div className="ev"><dt>Earth rank in the scan</dt><dd>top {(100 - (sc.pct.balanced ?? 0)).toFixed((sc.pct.balanced ?? 0) > 99 ? 2 : 1)}%</dd></div>
                <div className="ev"><dt>Rank under stress</dt><dd>{fmt(sc.conf.pct_p10, 1)}–{fmt(sc.conf.pct_p90, 1)}</dd></div>
                <div className="ev"><dt>Confidence</dt><dd><ConfMark label={sc.conf.label} /></dd></div>
                <div className="ev"><dt>Median slope</dt><dd><span className="e-c">{fmt(ft.slope_med, 2)}°</span> <span className="dim">vs</span> <span className="p-c">{fmt(tv("slope_med"), 2)}°</span></dd></div>
                <div className="ev"><dt>Relief</dt><dd><span className="e-c">{smart(ft.relief)}</span> <span className="dim">vs</span> <span className="p-c">{smart(tv("relief"))} m</span></dd></div>
                <div className="ev"><dt>Albedo</dt><dd><span className="e-c">{fmt(ft.albedo, 2)}</span> <span className="dim">vs</span> <span className="p-c">{fmt(tv("albedo"), 2)}</span></dd></div>
                <div className="ev"><dt>Mean temperature</dt><dd><span className="e-c">{fmt(ft.t_mean, 0)}</span> <span className="dim">vs</span> <span className="p-c">{fmt(tv("t_mean"), 0)} K</span></dd></div>
              </dl>
              <h4>Why the score is what it is</h4>
              <ul className="plain">
                {sc.expected.filter((k) => sc.fac[k] != null).map((k) => <li key={k} className={sc.matched.includes(k) ? "plus" : "minus"}><b>{flabel(b, k)} {fmt(sc.fac[k], 2)}.</b> {describe(k, site, target, b)}</li>)}
              </ul>
              <h4>Independent evidence</h4>
              <ul className="plain">{f.literature.map((l, j) => <li key={j}>{l.claim} <span className="dim">— {l.url ? <a href={l.url} target="_blank" rel="noreferrer">{l.source}</a> : l.source}</span></li>)}</ul>
              <h4>Important differences</h4>
              <ul className="plain">{f.differences.map((d, j) => <li key={j} className="minus">{d}</li>)}</ul>
              <div className="callout info"><b>How new is this?</b> {f.novelty}</div>
              <p className="prose"><b>Why it matters.</b> {f.why}</p>
              <p><button className="btn primary" onClick={() => openSite(site.id, target.id)}>Open the field report for {site.name.split(" · ")[0]}</button></p>
            </div>
            <figure className="fvis">
              <div className="fvis-loc">
                <Locator lat={site.lat} lon={site.lon} size={92} marks={[{ lat: site.lat, lon: site.lon, on: true }]} />
                <div><b>{site.name.split(" · ").join(", ")}</b><span className="num">{ddPair(site.lat, site.lon)}</span>
                  <span>compared with</span><b>{target.name}</b><span className="num">{ddPair(target.lat, target.lon)} on {BODY[target.body]}</span></div>
                <Locator lat={target.lat} lon={target.lon} size={92} body={target.body} marks={[{ lat: target.lat, lon: target.lon, on: true }]} />
              </div>
              <div className="twocol">
                <div><div className="frame">{b.imagery.sites[site.id] ? <img src={asset(`img/sites/${site.id}.jpg`)} alt={site.name} loading="lazy" /> : <Relief win={site.window} stepKm={b.meta.window.step_km} exag={ex} tint={TINT.earth} />}<div className="cap e">Earth</div><div className="scale" style={{ width: "32.9%" }}>20 km</div></div></div>
                <div><div className="frame"><img src={asset(`img/targets/${target.id}.jpg`)} alt={target.name} loading="lazy" /><div className={`cap ${target.body}`}>{target.body}</div><div className="scale" style={{ width: "32.9%" }}>20 km</div></div></div>
                <div><div className="frame"><Relief win={site.window} stepKm={b.meta.window.step_km} exag={ex} tint={TINT.earth} /><div className="cap e">Relief</div></div></div>
                <div><div className="frame"><Relief win={target.window} stepKm={b.meta.window.step_km} exag={ex} tint={TINT[target.body]} /><div className={`cap ${target.body}`}>Relief</div></div></div>
              </div>
              <figcaption className="credit">All four panels cover 61 km. Relief uses the same vertical exaggeration (×{ex}) and the same light. The upper pair differ in instrument and lighting and show shape only. {b.imagery.site_credit}. {b.imagery.targets[target.id]}.</figcaption>
            </figure>
          </article>
        );
      })}

      <section id="validation">
        <h2>How the proof step was scored</h2>
        <p className="lede">Established analog sites were never shown to the scoring code. Afterwards we asked where each one landed. Sites picked for their environment should rank high; sites picked for a mineral, a crater or a nearby research station should not, because the scan cannot see those reasons.</p>
        <ValidationTable b={b} openSite={openSite} />
      </section>
    </div></div>
  );
}

function ValidationTable({ b, openSite }: { b: Bundle; openSite: Open }) {
  const v = b.validation;
  const basis = (x: string[]) => x.map((k) => ({ env: "environment", geo: "geology", ops: "operations" } as any)[k]).join(", ");
  return (
    <div className="sheet">
      <div className="valsum">
        {[{ k: "Chosen for environment", s: v.env.balanced, env: true }, { k: "Chosen for geology or operations only", s: v.other.balanced, env: false }].map((g) => (
          <div key={g.k}>
            <p className="k"><i className={`dotkey ${g.env ? "env" : ""}`} />{g.k}, n = {g.s.n}</p>
            <p className="v num">{fmt(g.s.mean_u, 2)} <span>mean calibrated rank (chance = 0.50)</span></p>
            <p className="small muted">top 10% of land: {g.s.top10} · top 25%: {g.s.top25} · one-sided p = {g.s.p < 0.001 ? g.s.p.toExponential(1) : g.s.p.toFixed(3)}</p>
          </div>
        ))}
      </div>
      <div className="scroll-x">
        <table className="data">
          <thead><tr><th>Established analog</th><th>Chosen for</th><th>Best-matching region</th><th className="r">Percentile</th><th style={{ width: "28%" }}>Calibrated rank: 0 worst land, 1 best</th></tr></thead>
          <tbody>
            {[...v.rows].sort((x, y) => y.u - x.u).map((r) => (
              <tr key={r.id} className="clk" onClick={() => openSite(r.id, r.best_target)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") openSite(r.id, r.best_target); }}>
                <td>{r.name}</td><td className="muted">{basis(r.basis)}</td><td>{tname(b, r.best_target)}</td><td className="n">{r.best_pct.toFixed(1)}</td>
                <td><div className="strip"><u style={{ left: "50%" }} /><u className="q" style={{ left: "75%" }} /><i className={r.env ? "env" : ""} style={{ left: `${r.u * 100}%` }} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note pad">{v.note} Filled marks are environment-motivated sites; open marks were chosen for geology or logistics. The centre tick is where a random land location would sit on average; the second tick marks the top quarter. Select a row to open that site.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ figures for the three results */
/** Every established analog on the calibrated-rank axis, split by why it was chosen. */
function ProofStrip({ b }: { b: Bundle }) {
  const rows = b.validation.rows;
  const W = 400, H = 118, L = 4, R = 4;
  const x = (u: number) => L + (W - L - R) * u;
  const groups = [
    { env: true, y: 34, label: `Chosen for environment, n = ${b.validation.env.balanced.n}` },
    { env: false, y: 78, label: `Chosen for geology or operations, n = ${b.validation.other.balanced.n}` },
  ];
  return (
    <svg className="chart proof" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Calibrated rank of every established analog, grouped by why it was chosen">
      <rect className="topq" x={x(0.75)} y={12} width={x(1) - x(0.75)} height={H - 34} />
      {groups.map((g) => (
        <g key={String(g.env)}>
          <text className="glabel" x={L} y={g.y - 13}>{g.label}</text>
          <line className="axis" x1={L} x2={W - R} y1={g.y} y2={g.y} />
          <line className="ref" x1={x(0.5)} x2={x(0.5)} y1={g.y - 9} y2={g.y + 9} />
          {rows.filter((r) => r.env === g.env).map((r, i) => (
            <circle key={r.id} className={g.env ? "dot env" : "dot"} cx={x(r.u)} cy={g.y + ((i % 3) - 1) * 4.5} r={4.2}><title>{`${r.name}: calibrated rank ${r.u.toFixed(2)}`}</title></circle>
          ))}
        </g>
      ))}
      <text x={x(0)} y={H - 6}>0, worst land</text>
      <line className="ref" x1={x(0.5)} x2={x(0.5)} y1={H - 26} y2={H - 18} />
      <text x={x(0.5)} y={H - 6} textAnchor="middle">chance</text>
      <text x={x(0.875)} y={H - 6} textAnchor="middle">top quarter</text>
      <text x={x(1)} y={H - 6} textAnchor="end">1</text>
    </svg>
  );
}

/** One bar per dimension with the match threshold marked: why the lead site matches four of five. */
function DimBars({ b, sc }: { b: Bundle; sc: SiteScore }) {
  const th = b.meta.params.match_threshold;
  return (
    <div className="dimbars" role="img" aria-label={sc.expected.map((k) => `${flabel(b, k)} ${fmt(sc.fac[k], 2)}`).join(", ")}>
      {sc.expected.map((k) => (
        <div className="fachead" key={k}>
          <span className="fn">{flabel(b, k)}</span>
          <div className="bar"><i style={{ width: `${(sc.fac[k] ?? 0) * 100}%`, opacity: sc.fac[k] == null ? 0 : 1 }} /><u style={{ left: `${th * 100}%` }} /></div>
          <span className="v">{sc.fac[k] == null ? "n/a" : fmt(sc.fac[k], 2)}</span>
        </div>
      ))}
      <p className="fine">The tick marks the match threshold, {th}.</p>
    </div>
  );
}

/** Each square is one requirement (a dimension of one reference region); filled squares are covered by the portfolio. */
function CoverageUnits({ b }: { b: Bundle }) {
  const p = b.portfolio;
  const covered = new Set(p.chosen.flatMap((c) => c.gain.map(([t, k]) => `${t}|${k}`)));
  return (
    <div className="units">
      {b.meta.factors.map((f) => {
        const req = p.requirements.filter((r) => r[1] === f.id);
        if (!req.length) return null;
        const n = req.filter(([t, k]) => covered.has(`${t}|${k}`)).length;
        return (
          <div className="urow" key={f.id}>
            <span className="ul">{f.label}</span>
            <span className="sq">{req.map(([t, k]) => <i key={t} className={covered.has(`${t}|${k}`) ? "on" : ""} title={`${f.label} like ${tname(b, t)}: ${covered.has(`${t}|${k}`) ? "covered" : "not covered"}`} />)}</span>
            <span className="num">{n}/{req.length}</span>
          </div>
        );
      })}
    </div>
  );
}

/** A stacked fraction for the typeset formulas on the Method page. */
function Frac({ n, d }: { n: ReactNode; d: ReactNode }) {
  return <span className="frac"><span>{n}</span><span>{d}</span></span>;
}

/* ------------------------------------------------------------------ PORTFOLIO */
export function Portfolio({ b, openSite }: { b: Bundle; openSite: Open }) {
  const p = b.portfolio;
  const [hover, setHover] = useState<string | null>(null);
  const owner = new Map<string, number>();
  p.chosen.forEach((c, i) => c.gain.forEach(([t, k]) => owner.set(`${t}|${k}`, i)));
  const cols = b.meta.factors.map((f) => f.id);
  const letters = "ABCDEFGH";
  const uncovered = p.requirements.filter(([t, k]) => !owner.has(`${t}|${k}`));
  const byFactor = cols.map((k) => ({ k, n: uncovered.filter((r) => r[1] === k).length, tot: p.requirements.filter((r) => r[1] === k).length }));
  const chosen = p.chosen.map((c, i) => {
    const s = b.sites.find((x) => x.id === c.id)!;
    const groups = new Map<string, string[]>();
    c.gain.forEach(([t, k]) => groups.set(k, [...(groups.get(k) ?? []), tname(b, t)]));
    const bodies = new Set(c.gain.map(([t]) => b.targets.find((x) => x.id === t)!.body));
    return { c, s, i, letter: letters[i], groups, role: [...groups.keys()].map((k) => flabel(b, k).toLowerCase()).join(", "), bodies };
  });
  const chosenIds = new Set(p.chosen.map((c) => c.id));
  return (
    <div className="page portfolio"><div className="pagein wide">
      <header className="pagehead">
        <h1>No single place is enough. Which few, together, cover the most?</h1>
        <p className="lede">A requirement is one dimension of one reference region, for example “terrain like Gale Crater”. A site covers it when its score for that dimension reaches {p.threshold}. Sites are added greedily: each pick is the one that covers the most requirements still open (a standard set-cover heuristic). {p.n_covered} of {p.n_requirements} requirements end up covered.</p>
      </header>

      <section className="plate">
        <WorldMap hover={hover} onHover={setHover} onPick={(id) => { const c = p.chosen.find((x) => x.id === id)!; openSite(id, c.gain[0][0]); }}
          marks={chosen.map((x) => ({ id: x.c.id, lat: x.s.lat, lon: x.s.lon, letter: x.letter, label: x.c.name.split(" · ")[0].split(" — ")[0] }))}
          lines={chosen.map((x) => `adds ${x.c.gain.length}: ${x.role}`)}
          minor={b.sites.filter((s) => !chosenIds.has(s.id)).map((s) => ({ lat: s.lat, lon: s.lon, title: s.name }))} />
        <p className="credit plate-cap">Equal Earth projection, which keeps areas true. Lettered sites are the portfolio in the order they were chosen; small dots are the other {b.sites.length - p.chosen.length} listed sites. Land outline: Natural Earth 1:110m.</p>
      </section>

      <section>
        <h2>The six sites and what each adds</h2>
        <ol className="roster">
          {chosen.map(({ c, s, i, letter, groups }) => (
            <li key={c.id} className={hover === c.id ? "on" : ""} onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}>
              <span className="letter">{letter}</span>
              <div className="who">
                <h3>{c.name.split(" · ").join(", ")}</h3>
                <p className="num small muted">{ddPair(s.lat, s.lon)} <span className={`tag ${s.kind === "known" ? "known" : "cand"}`}>{s.kind === "known" ? "established" : "candidate"}</span></p>
              </div>
              <ul className="plain">{[...groups.entries()].map(([k, ts]) => <li key={k} className="plus"><b>{flabel(b, k)}</b> for {ts.join(", ")}</li>)}</ul>
              <div className="tally"><b className="num">{c.gain.length}</b><span>added at pick {i + 1}</span><b className="num">{c.total}</b><span>covered in total</span>
                <button className="btn" onClick={() => openSite(c.id, c.gain[0][0])}>Open field report</button></div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>Coverage matrix</h2>
        <p className="lede">Each cell is one requirement. A letter means the portfolio covers it and which site does. A bare number is the best score any of the {b.sites.length} listed sites reaches, below the threshold. Point at a site above, or a letter here, to see its share.</p>
        <div className="sheet pad scroll-x">
          <table className="matrix">
            <thead><tr><th></th>{cols.map((k) => <th key={k} className="col">{flabel(b, k)}</th>)}</tr></thead>
            <tbody>
              {b.targets.map((t) => (
                <tr key={t.id}>
                  <th><i className="bodydot" style={{ background: bodyColor(t.body) }} />{t.name}</th>
                  {cols.map((k) => {
                    const key = `${t.id}|${k}`, best = p.best[key];
                    if (!best) return <td key={k} className="na" title="Not applicable to this region">·</td>;
                    const o = owner.get(key);
                    return o != null
                      ? <td key={k} className={`cov ${hover === p.chosen[o].id ? "on" : ""}`} title={`${p.chosen[o].name}`} onMouseEnter={() => setHover(p.chosen[o].id)} onMouseLeave={() => setHover(null)}>{letters[o]}</td>
                      : <td key={k} className="open" title={`Best available: ${best.name}`}><b style={{ width: `${Math.round(best.score * 100)}%` }} /><span>{fmt(best.score, 2)}</span></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Where the portfolio falls short</h2>
        <div className="grid2">
          <div>
            <h4>Requirements covered, by dimension</h4>
            {byFactor.filter((x) => x.tot > 0).map((x) => (
              <div className="fachead" key={x.k}>
                <span className="fn">{flabel(b, x.k)}</span>
                <div className="bar ink"><i style={{ width: `${(1 - x.n / x.tot) * 100}%` }} /></div>
                <span className="v">{x.tot - x.n}/{x.tot}</span>
              </div>
            ))}
            <p className="note">Thermal and atmosphere stay almost entirely open. That is a property of Earth, not of the search: the best cells on the planet still sit far from lunar and Martian values.</p>
          </div>
          <div>
            <h4>What no field site can supply</h4>
            <ul className="plain">{b.meta.limitations.slice(0, 5).map((l) => <li key={l.title}><b>{l.title}.</b> {l.body}</li>)}</ul>
          </div>
        </div>
      </section>
    </div></div>
  );
}

/* ------------------------------------------------------------------ METHOD */
const SECTIONS = [
  ["measure", "Same measurement on three worlds"], ["compare", "The comparison depends on the variable"], ["combine", "Combining, and keeping confidence separate"],
  ["sensitivity", "Sensitivity"], ["validate", "Validation against established analogs"], ["datasets", "Datasets and provenance"],
  ["layers", "Map layers that are shown, not scored"], ["assessed", "Outside sources examined"], ["limits", "Limits of this work"],
] as const;

export function Method({ b, openSite }: { b: Bundle; openSite: Open }) {
  const m = b.meta;
  const methodText: Record<string, string> = { distribution: "Distribution match", direct: "Direct match", direct_log: "Direct match (log)", gap: "Gap closure", gap_log: "Gap closure (log)", proxy_cryo: "Proxy", proxy_frozen: "Proxy" };
  const anchor = (f: any) => {
    const r = m.earth_ref[f.id];
    if (!r) return "—";
    if (f.method === "gap") return `Earth median ${smart(r.median)} ${f.unit}`;
    if (f.method === "gap_log") return `Earth median ${smart(Math.pow(10, r.median))} ${f.unit}`;
    if (f.method === "direct") return `τ = ${smart(m.params.tol_k * r.sigma)} ${f.unit}`;
    if (f.method === "direct_log" || f.method === "distribution") return `τ = ×${Math.pow(10, m.params.tol_k * r.sigma).toFixed(2)}`;
    return f.id === "cryo" ? "logistic at 271 K" : "months below 273 K";
  };
  const H = ({ id, n }: { id: string; n: number }) => <h2 id={id}><span className="secno">{n}</span>{SECTIONS[n - 1][1]}</h2>;
  const active = useActiveSection(SECTIONS.map(([id]) => id));
  return (
    <div className="page method"><div className="pagein doc">
      <nav className="toc" aria-label="On this page">
        <p>Contents</p>
        <ol>{SECTIONS.map(([id, t]) => <li key={id}><a href={`#${id}`} aria-current={active === id ? "true" : undefined} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{t}</a></li>)}</ol>
      </nav>
      <div className="docbody">
        <header className="pagehead">
          <h1>How a similarity score is made, and how far to trust it</h1>
          <p className="lede">The scoring code is short and public (<span className="num">pipeline/score.py</span>). Everything on this page is generated from the same run that produced the map: {m.generated}, {m.grid.land_cells.toLocaleString()} land cells at {m.grid.deg}°, {m.counts.targets} reference regions, {m.counts.sites} sites in the detailed tier.</p>
        </header>

        <H id="measure" n={1} />
        <p className="lede">Terrain is sampled identically everywhere: a {m.window.n} × {m.window.n} window at {m.window.step_km} km spacing ({m.window.size_km.toFixed(0)} km across) on a local equal-distance grid. The three global elevation models were chosen because their pixels are almost the same size on the ground: ETOPO 1.85 km, MOLA 1.85 km, LOLA 1.90 km. Climate and surface variables come from the datasets listed below, each tagged as measured, modelled or proxy.</p>

        <H id="compare" n={2} />
        <div className="rules3">
          <div><h4>Direct match</h4><p className="prose">For quantities Earth can actually reach: slopes, relief, albedo, dust loading.</p><div className="formula"><span className="eqline"><var>s</var> = 0.5<sup>|<var>x</var> − <var>x</var>★| / <var>τ</var></sup></span><span className="eqline"><var>τ</var> = {m.params.tol_k} × spread over Earth's land</span></div><p className="note">Similarity halves for every τ of mismatch. τ is set by how much the variable varies across Earth, not by hand.</p></div>
          <div><h4>Gap closure</h4><p className="prose">For quantities no place on Earth reaches: temperature, dryness, pressure.</p><div className="formula"><span className="eqline"><var>s</var> = <Frac n={<><var>x</var> − <var>x</var>⊕</>} d={<><var>x</var>★ − <var>x</var>⊕</>} /></span><span className="eqline"><var>x</var>⊕ = median of Earth's land</span></div><p className="note">1 means the site reaches the planetary value, 0 means it is no closer than ordinary land. A distance metric would read ~0 everywhere and hide real differences.</p></div>
          <div><h4>Category affinity</h4><p className="prose">For rock type, from independent geological maps, at listed sites only.</p><div className="formula"><span className="eqline"><var>s</var> = mean over documented lithologies</span><span className="eqline indent">of the best affinity mapped at the site</span></div><p className="note">Basalt for basalt scores 1; gabbro for basalt 0.6; any other exposed rock 0.15. Impact structures and lava tubes are not on maps and are not scored.</p></div>
        </div>
        <div className="sheet scroll-x">
          <table className="data">
            <thead><tr><th>Dimension</th><th>Variable</th><th>Method</th><th>Anchor / tolerance</th><th>Earth data</th></tr></thead>
            <tbody>{m.features.map((f) => (
              <tr key={f.id}><td>{flabel(b, f.factor)}</td><td>{f.label}{f.unit ? <span className="dim"> ({f.unit === "deg" ? "°" : f.unit})</span> : null}</td><td className="muted">{methodText[f.method]}</td><td className="num small">{anchor(f)}</td><td><span className={`tag ${f.earth_kind}`}>{f.earth_kind}</span></td></tr>
            ))}</tbody>
          </table>
        </div>

        <H id="combine" n={3} />
        <div className="grid2">
          <div><h4>Similarity</h4><div className="formula"><span className="eqline">dimension = geometric mean of its variables</span><span className="eqline">overall = exp <span className="paren">(</span><Frac n={<>Σ <var>w</var><sub>i</sub> ln max(<var>s</var><sub>i</sub>, {m.params.floor})</>} d={<>Σ <var>w</var><sub>i</sub></>} /><span className="paren">)</span></span></div><p className="note">Geometric means are deliberate: an ice sheet is bare but not rock-coloured, and a hot desert is dry but not cold. Neither should be able to average its way to a high score. Weights are the mission profile and are adjustable on the Explore page. A dimension counts as matched at {m.params.match_threshold}.</p></div>
          <div><h4>Confidence = coverage × evidence quality × rank stability</h4><ul className="plain">
            <li><b>Coverage</b>: share of the profile's weight backed by data at that site.</li>
            <li><b>Evidence quality</b>: the weaker of the Earth and planetary data kinds per variable ({Object.entries(m.evidence_grade).map(([k, v]) => `${k} ${v}`).join(", ")}).</li>
            <li><b>Rank stability</b>: how little the site's percentile moves across {m.sensitivity.runs} perturbed runs.</li>
          </ul><p className="note">High ≥ 0.55, moderate ≥ 0.35. Confidence never changes the similarity number. On every map and list it is drawn as a fill (<ConfMark label="high" />, <ConfMark label="moderate" />, <ConfMark label="low" />), while similarity alone uses colour.</p></div>
        </div>

        <H id="sensitivity" n={4} />
        <p className="lede">{m.sensitivity.description} The table gives the rank correlation between each perturbed global ranking and the baseline.</p>
        <div className="sheet scroll-x">
          <table className="data"><thead><tr><th>Reference region</th><th>Body</th><th className="r">Mean rank correlation</th><th className="r">Worst run</th><th style={{ width: "30%" }}>Worst run to mean</th></tr></thead>
            <tbody>{b.targets.map((t) => (
              <tr key={t.id}><td>{t.name}</td><td className="muted">{t.body}</td><td className="n">{fmt(t.sensitivity.rho_mean, 3)}</td><td className="n">{fmt(t.sensitivity.rho_min, 3)}</td>
                <td><div className="strip range"><b style={{ left: `${Math.max(0, t.sensitivity.rho_min) * 100}%`, width: `${(t.sensitivity.rho_mean - Math.max(0, t.sensitivity.rho_min)) * 100}%`, background: bodyColor(t.body) }} /><i className="env" style={{ left: `${t.sensitivity.rho_mean * 100}%` }} /></div></td></tr>
            ))}</tbody></table>
        </div>
        <p className="note">Global rankings are stable on average, but single runs that drop a dimension can reshuffle them substantially. That is why every site carries its own stability figure.</p>

        <H id="validate" n={5} />
        <p className="lede">See the Findings page for the reasoning. The table is repeated here so the method can be judged on one screen.</p>
        <ValidationTable b={b} openSite={openSite} />

        <H id="datasets" n={6} />
        <p className="lede">These are the datasets that enter a score or a label. All sources are public and need no login. Open a row for resolution, coverage, format and limits.</p>
        <div className="sheet">
          {m.datasets.map((d) => (
            <details className="ds" key={d.id}>
              <summary><span className={`tag ${d.kind === "measured" ? "measured" : d.kind === "model" ? "model" : ""}`}>{d.kind}</span><span><b>{d.name}</b><br /><span className="small muted">{d.agency} · {d.used_for}</span></span><span className="bodytag">{d.body}</span></summary>
              <dl className="body">
                <dt>Measures</dt><dd>{d.measures}</dd><dt>Resolution</dt><dd>{d.resolution}</dd><dt>Time span</dt><dd>{d.temporal}</dd><dt>Coverage</dt><dd>{d.coverage}</dd>
                <dt>Format</dt><dd>{d.format}</dd><dt>Limits</dt><dd>{d.limits}</dd><dt>Citation</dt><dd>{d.citation}</dd><dt>Access</dt><dd><a href={d.url} target="_blank" rel="noreferrer">{d.url}</a></dd>
              </dl>
            </details>
          ))}
        </div>

        <H id="layers" n={7} />
        <p className="lede">The maps can also draw pictures of data served by the agencies that made it. A picture is not the product: tiles are colour-mapped, resampled and sometimes compressed, so none of these layers is read as numbers and none can change a score. Where the pipeline scores the same product, it fetches and decodes it separately, and the last column says so.</p>
        <div className="sheet scroll-x">
          <table className="data layers">
            <thead><tr><th>Earth layer</th><th>Product and instrument</th><th>Resolution</th><th>Time</th><th>Served by</th><th>Relation to the score</th></tr></thead>
            <tbody>{EARTH_LAYERS.map((l) => (
              <tr key={l.id}><td><b>{l.name}</b><br /><span className="small muted">{l.role === "base" ? "basemap" : l.role === "observation" ? "observation overlay" : "reference overlay"}</span></td>
                <td>{l.product}<br /><span className="small muted">{l.units}</span></td><td className="num small">{l.resolution}</td><td className="small">{l.period}</td>
                <td className="small"><a href={l.info} target="_blank" rel="noreferrer">{l.source}</a></td><td className="small">{l.scored ?? "Not scored. Context only."}<br /><span className="muted">{l.limits}</span></td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="sheet scroll-x">
          <table className="data layers">
            <thead><tr><th>Moon and Mars layer</th><th>Product</th><th>Instrument</th><th>Resolution</th><th>Colours mean</th><th>Relation to the score</th></tr></thead>
            <tbody>{BODY_LAYERS.map((l) => (
              <tr key={l.id}><td><b>{l.name}</b><br /><span className="small muted">{l.body === "mars" ? "Mars" : "Moon"}, {l.role === "base" ? "basemap" : "overlay"}</span></td>
                <td>{l.product}</td><td className="small">{l.instrument}</td><td className="num small">{l.resolution}</td><td className="small">{l.units}</td><td className="small">{l.scored ?? "Not scored. Context only."}<br /><span className="muted">{l.limits}</span></td></tr>
            ))}</tbody>
          </table>
        </div>
        <p className="note">Moon and Mars tiles come from NASA Solar System Treks in plate-carrée form and are re-projected in the browser; nothing is drawn poleward of 85°. Earth observation tiles come from NASA GIBS in Web Mercator. Scale bars on the planetary maps use each body's own radius.</p>

        <H id="assessed" n={8} />
        <p className="lede">Each service below was examined for what it could add. A source was taken into the scoring only if its measurement belongs to a scored dimension, can be put on the same footing for Earth and for the Moon or Mars, and can be fetched without credentials. None of the newly examined sources met all three, so the scoring is unchanged; several improve what can be seen.</p>
        <div className="sheet">
          {ASSESSED.map((a) => (
            <details className="ds src" key={a.name}>
              <summary><span className="decisions">{a.decision.map((d) => <span key={d} className={`tag d-${d.replace(" ", "")}`}>{d}</span>)}</span><span><b>{a.name}</b><br /><span className="small muted">{a.agency}</span></span></summary>
              <dl className="body">
                <dt>Examined</dt><dd>{a.examined}</dd><dt>Outcome</dt><dd>{a.outcome}</dd><dt>Access</dt><dd>{a.access}</dd><dt>Link</dt><dd><a href={a.url} target="_blank" rel="noreferrer">{a.url}</a></dd>
              </dl>
            </details>
          ))}
        </div>
        <p className="note">The full assessment, with processing level, format, licence and attribution for every product, is in <span className="num">docs/DATA_SOURCES.md</span> in the repository.</p>

        <H id="limits" n={9} />
        <dl className="limits">{m.limitations.map((l) => <div key={l.title}><dt>{l.title}</dt><dd>{l.body}</dd></div>)}</dl>
      </div>
    </div></div>
  );
}
