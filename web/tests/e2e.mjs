// End-to-end UI checks against a running build.
//   cd web && npm run build && npx vite preview --port 4173 &
//   cd tests && npm i playwright && npx playwright install chromium-headless-shell && node e2e.mjs
// Part 1 keeps the original regression checks: the map initialises, client-side scores equal the Python
// pipeline's, profiles / sliders / filters / layers work, dossiers and deep links open, missing data degrades cleanly.
// Part 2 covers the cartography: classed legend, layer panel, cursor readout, coordinate navigation, the
// dossier site map, the Moon / Mars map, the portfolio world map, the layer and source tables, small screens.
// Checks marked (network) need the outside tile and catalogue services and are reported as SKIP when those are down.
const BASE = process.env.BASE_URL ?? "http://localhost:4173";
import { chromium } from "playwright";
import fs from "fs";
const sites = JSON.parse(fs.readFileSync("../web/public/data/sites.json", "utf8")).filter((s) => s.features);
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 300)));
let pass = 0, fail = 0, skip = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(cond ? "PASS" : "FAIL", name, extra); };
const net = (name, cond, extra = "") => { if (cond) { pass++; console.log("PASS", name, extra); } else { skip++; console.log("SKIP", name, "(outside service did not answer)", extra); } };
const mapReady = () => page.waitForFunction(() => window.__ptMap && window.__ptMap.getSource("heat") && window.__ptMap.getLayer("known"), null, { timeout: 40000 });
const heatPainted = () => page.waitForFunction(() => window.__ptHeat && window.__ptHeat.painted > 20000, null, { timeout: 30000 }).then(() => true, () => false);

/* ================================================================ Part 1: regression */
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".rk", { timeout: 30000 });
await mapReady();
ok("map initialised with heat + sites sources", await page.evaluate(() => !!window.__ptMap.getSource("sites")));
// 1. ranking numbers equal the pipeline's own balanced overall (client aggregation == Python aggregation)
const top = await page.$$eval(".rk", (els) => els.slice(0, 5).map((e) => [e.querySelector(".nm").textContent, e.querySelector(".sc").textContent]));
const py = sites.map((s) => [s.name, s.scores.jezero.overall.balanced]).sort((a, b) => b[1] - a[1]).slice(0, 5);
ok("client ranking == pipeline ranking (Jezero, balanced)", top.every((t, i) => t[0] === py[i][0] && Math.abs(+t[1] - py[i][1]) < 0.006), JSON.stringify(top[0]) + " vs " + JSON.stringify(py[0]));
// 2. similarity layer actually painted
ok("similarity layer painted", await heatPainted(), "cells=" + (await page.evaluate(() => window.__ptHeat?.painted)));
const nfeat = await page.evaluate(() => window.__ptMap.querySourceFeatures("sites").length);
ok("site symbols on map", nfeat > 20, "features in view=" + nfeat);
// 3. switch body -> Moon
await page.click('.bodyswitch button[data-b="moon"]');
await page.waitForTimeout(2500);
ok("moon mode lists lunar regions", (await page.$$eval(".titem .n", (e) => e.map((x) => x.textContent))).includes("Mare Tranquillitatis"));
await page.click('.titem:has-text("Mare Tranquillitatis")');
await page.waitForTimeout(2500);
const first = await page.$eval(".rk .nm", (e) => e.textContent);
ok("Mare Tranquillitatis top site is Harrat Khaybar", /Harrat Khaybar/.test(first), first);
// 4. profile preset + slider change re-rank
const before = await page.$$eval(".rk .sc", (e) => e.slice(0, 3).map((x) => x.textContent).join(","));
await page.click('.chip:has-text("Rover mobility")');
await page.waitForTimeout(1500);
const after = await page.$$eval(".rk .sc", (e) => e.slice(0, 3).map((x) => x.textContent).join(","));
ok("mission profile changes scores", before !== after, before + " -> " + after);
await page.locator('input[aria-label="Thermal weight"]').fill("4");
await page.waitForTimeout(1500);
const after2 = await page.$$eval(".rk .sc", (e) => e.slice(0, 3).map((x) => x.textContent).join(","));
ok("weight slider re-ranks live", after2 !== after, after + " -> " + after2);
// 5. factor layer
await page.click('.segs button:has-text("Terrain")');
await page.waitForTimeout(1500);
ok("factor layer selectable", (await page.$eval(".legendticks", (e) => e.textContent)).includes("terrain"));
ok("factor layer is in the url", page.url().includes("l=terrain"), page.url().split("?")[1]);
// 6. filters
await page.click('.chip:has-text("Established")');
await page.waitForTimeout(600);
ok("filter: established only", (await page.$$eval(".rk .tag", (e) => e.map((x) => x.textContent))).every((t) => t === "established"));
const onMap = await page.evaluate(() => window.__ptMap.querySourceFeatures("sites").every((f) => f.properties.kind === "known"));
ok("filter also applies to the map symbols", onMap);
await page.click('.filters .chip:has-text("All")');
await page.click('.chip:has-text("High only")');
await page.waitForTimeout(600);
ok("confidence filter: high only", await page.$$eval(".rk .meta .conf", (e) => e.length > 0 && e.every((x) => x.classList.contains("high"))));
await page.click('.chip:has-text("Any")');
await page.click('.chip:has-text("Balanced")');
await page.click('.segs button:has-text("Overall")');
// 7. open dossier from ranking
await page.click(".rk >> nth=0");
await page.waitForSelector(".dhead h2");
await page.waitForTimeout(2500);
ok("dossier opens", /Harrat Khaybar/.test(await page.$eval(".dhead h2", (e) => e.textContent)));
ok("dossier images load", await page.$$eval(".dsec .frame img", (els) => els.length >= 2 && els.every((i) => i.complete && i.naturalWidth > 100)));
ok("dossier charts drawn", (await page.$$("svg.chart")).length >= 3 && (await page.$$(".frame canvas")).length >= 3);
ok("url carries state", page.url().includes("t=tranquillitatis") && page.url().includes("s="), page.url());
await page.click('.tabs2 button:has-text("Relief")');
ok("relief toggle", (await page.$$(".twocol .frame canvas")).length === 2);
// 8. map click selects a site
await page.click(".back");
await page.waitForTimeout(1500);
const pt = await page.evaluate(() => {
  const m = window.__ptMap, r = m.getCanvas().getBoundingClientRect();
  for (const f of m.queryRenderedFeatures({ layers: ["known", "cand"] })) {
    const p = m.project(f.geometry.coordinates), x = r.left + p.x, y = r.top + p.y;
    if (document.elementFromPoint(x, y) === m.getCanvas()) return { x, y, id: f.properties.id }; // not under the legend or title block
  }
  return null;
});
if (pt) { await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(1500); ok("clicking a map symbol opens its dossier", page.url().includes("s=" + pt.id), pt.id + " " + page.url().split("?")[1]); } else ok("clicking a map symbol opens its dossier", false, "no rendered feature");
// 9. other pages
for (const [tab, sel, min] of [["Findings", ".finding", 3], ["Portfolio", ".matrix td.cov", 20], ["Method & data", "details.ds", 12]]) {
  await page.click(`.nav button:has-text("${tab}")`);
  await page.waitForTimeout(1200);
  const n = (await page.$$(sel)).length;
  ok(`${tab} page renders`, n >= min, `${sel} x${n}`);
}
await page.click('.nav button:has-text("Findings")');
await page.click('.finding >> nth=1 >> .btn.primary');
await page.waitForSelector(".dhead h2");
ok("finding -> dossier deep link", /West Kunlun/.test(await page.$eval(".dhead h2", (e) => e.textContent)) && page.url().includes("t=jezero"));
// 10. missing-data behaviour: a site with no imagery / no geology still renders
const noGeo = sites.find((s) => !s.geology || !s.geology.units.length) || sites.find((s) => s.scores.jezero.fac.geology == null);
if (noGeo) { await page.goto(`${BASE}/#/explore?t=jezero&s=${noGeo.id}`); await page.reload(); await page.waitForSelector(".dhead h2"); ok("site without geology renders (n/a shown)", (await page.content()).includes("n/a") || (await page.content()).includes("no mapped unit"), noGeo.name); }
await page.goto(BASE + "/#/explore?t=jezero&s=does-not-exist"); await page.reload(); await page.waitForSelector(".rk");
ok("unknown site id falls back to ranking", true);

/* ================================================================ Part 2: cartography */
await page.goto(BASE + "/#/explore?t=jezero"); await page.reload();
await page.waitForSelector(".rk"); await mapReady(); await heatPainted();
// 11. legend: five classes with numeric ranges, ordered, and they match the painted raster
const rows = await page.$$eval(".legend .classes li:not(.head):not(.none)", (e) => e.map((x) => x.textContent));
const ranges = rows.map((t) => t.match(/(\d\.\d\d)–(\d\.\d\d)/)).filter(Boolean).map((m) => [+m[1], +m[2]]);
ok("legend shows five classes with score ranges", rows.length === 5 && ranges.length === 5 && ranges.every((r) => r[1] >= r[0]), rows.join(" | "));
ok("legend classes are contiguous and descending", ranges.every((r, i) => i === 0 || Math.abs(ranges[i - 1][0] - r[1]) < 0.011));
ok("similarity is classed by default", await page.evaluate(() => window.__ptHeat.classed === true));
// 12. regression for the inherited placeholder bug: the map must never be washed blue
const blueShare = async () => {
  const box = await page.locator(".mapwrap .mapframe").boundingBox();
  const png = await page.screenshot({ clip: { x: box.x + box.width * 0.45, y: box.y + box.height * 0.3, width: 200, height: 200 } });
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = c.height = 200; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, 200, 200).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 2] > d[i] + 60 && d[i + 2] > d[i + 1] + 40) n++;
    return n / 40000;
  }, png.toString("base64"));
};
ok("no blue wash over the map", (await blueShare()) < 0.02);
// 13. layer panel
await page.click('.rail .railtabs button:has-text("Map layers")');
await page.click('.layerpanel label.opt:has-text("Show similarity")');
await page.waitForTimeout(500);
ok("similarity layer can be hidden", await page.evaluate(() => window.__ptMap.getLayoutProperty("heat", "visibility") === "none"));
ok("hidden similarity leaves no tint", (await blueShare()) < 0.02);
await page.click('.layerpanel label.opt:has-text("Show similarity")');
await page.click('.layerpanel .seg button:has-text("Continuous")');
await page.waitForFunction(() => window.__ptHeat && window.__ptHeat.classed === false, null, { timeout: 8000 }).catch(() => {});
ok("continuous style available", await page.evaluate(() => window.__ptHeat.classed === false) && (await page.$$(".legend .legendbar")).length === 1);
await page.click('.layerpanel .seg button:has-text("Five classes")');
await page.click('.layerpanel label.opt:has-text("Sentinel-2 cloudless")');
await page.waitForTimeout(800);
ok("basemap switch: Sentinel-2", await page.evaluate(() => !!window.__ptMap.getLayer("base") && window.__ptMap.getLayoutProperty("relief-shade", "visibility") === "none") && page.url().includes("b=s2"));
ok("attribution follows the basemap", /EOX/.test(await page.$eval(".mapfoot", (e) => e.textContent)));
await page.click('.layerpanel label.opt:has-text("Atlas relief")');
await page.click('.layerpanel label.opt:has-text("Vegetation index")');
await page.waitForTimeout(800);
const obsTiles = await page.evaluate(() => window.__ptMap.getSource("obs")?.tiles?.[0] ?? "");
ok("observation overlay: NDVI with a dated tile url", /MODIS_Terra_L3_NDVI_Monthly\/default\/\d{4}-\d\d-01\//.test(obsTiles) && page.url().includes("o=ndvi"), obsTiles.slice(60, 130));
ok("overlay facts name product, limits and score relation", /MOD13/.test(await page.$eval(".optwrap.on .layerfacts", (e) => e.textContent)) && /In the score/.test(await page.$eval(".optwrap.on .layerfacts", (e) => e.textContent)));
ok("overlay draws below the similarity layer", await page.evaluate(() => { const ids = window.__ptMap.getStyle().layers.map((l) => l.id); return ids.indexOf("obs") < ids.indexOf("heat") && ids.indexOf("heat") < ids.indexOf("coast"); }));
const d0 = await page.$eval('.optwrap.on .datebar input[type="date"]', (e) => e.value);
await page.click('.optwrap.on .datebar button[aria-label="Previous month"]');
await page.waitForTimeout(500);
const d1 = await page.$eval('.optwrap.on .datebar input[type="date"]', (e) => e.value);
ok("date control steps the overlay back one month", d1 < d0 && (await page.evaluate(() => window.__ptMap.getSource("obs").tiles[0])).includes(d1), d0 + " -> " + d1);
await page.waitForTimeout(4000);
net("official legend image loads (network)", await page.$eval(".obsleg img", (i) => i.complete && i.naturalWidth > 50).catch(() => false));
net("overlay tiles load (network)", await page.evaluate(() => window.__ptMap.isSourceLoaded("obs") && window.__ptMap.querySourceFeatures !== undefined));
ok("overlay and similarity together: no blue wash", (await blueShare()) < 0.02);
await page.click('.layerpanel label.opt:has-text("None")');
await page.click('.layerpanel label.opt:has-text("Geologic map units")');
await page.waitForTimeout(600);
ok("reference overlay: geologic units", await page.evaluate(() => /macrostrat/.test(window.__ptMap.getSource("geology")?.tiles?.[0] ?? "")));
await page.click('.layerpanel label.opt:has-text("Geologic map units")');
await page.click('.layerpanel label.opt:has-text("Graticule")');
ok("graticule toggles", await page.evaluate(() => window.__ptMap.getLayoutProperty("graticule", "visibility") === "none"));
await page.click('.layerpanel label.opt:has-text("Graticule")');
await page.click('.rail .railtabs button:has-text("Question")');
// 14. cursor readout, pin, coordinate navigation, projection, reset
const box = await page.locator(".mapwrap .mapframe").boundingBox();
const land = await page.evaluate(() => { const m = window.__ptMap, p = m.project([84, 36]), r = m.getCanvas().getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; });
await page.mouse.move(land.x + 3, land.y + 3); await page.mouse.move(land.x, land.y);
await page.waitForTimeout(500);
const probe = await page.$eval(".probe", (e) => e.textContent);
ok("cursor readout gives coordinates, score, percentile and dimensions", /°N/.test(probe) && /similarity to Jezero Crater/.test(probe) && /of land/.test(probe) && /Terrain \d\.\d\d/.test(probe), probe.slice(0, 110));
await page.fill("#goto", "25.375 N, 39.875 E");
await page.press("#goto", "Enter");
await page.waitForTimeout(3500);
const c = await page.evaluate(() => window.__ptMap.getCenter());
ok("go-to-coordinates moves the map and pins the cell", Math.abs(c.lat - 25.375) < 0.5 && Math.abs(c.lng - 39.875) < 0.5 && (await page.$eval(".probe", (e) => e.classList.contains("pinned"))));
ok("pinned cell offers the nearest listed site", /Harrat Khaybar/.test(await page.$eval(".probe .pinnote", (e) => e.textContent)));
await page.fill("#goto", "nonsense"); await page.press("#goto", "Enter");
ok("bad coordinates are reported, not ignored", (await page.$$('.goto [role="alert"]')).length === 1);
await page.click('.mapctl button:has-text("Flat")');
await page.waitForTimeout(800);
ok("projection toggle: flat", await page.evaluate(() => window.__ptMap.getProjection()?.type === "mercator"));
await page.click('.mapctl button:has-text("Globe")');
await page.click('.mapctl button:has-text("Reset")');
await page.waitForTimeout(3000);
ok("reset returns to the whole-Earth view", await page.evaluate(() => window.__ptMap.getZoom() < 2.7));
ok("scale bar shows a round distance", /^\d[\d,]* (km|m)$/.test((await page.$eval(".mapwrap .scalebar span", (e) => e.textContent)).trim()));
// 15. site tooltip
const tipPt = await page.evaluate(() => {
  const m = window.__ptMap, r = m.getCanvas().getBoundingClientRect();
  for (const f of m.queryRenderedFeatures({ layers: ["known", "cand"] })) { const p = m.project(f.geometry.coordinates), x = r.left + p.x, y = r.top + p.y; if (document.elementFromPoint(x, y) === m.getCanvas()) return { x, y }; }
  return null;
});
if (tipPt) { await page.mouse.move(tipPt.x + 2, tipPt.y + 2); await page.mouse.move(tipPt.x, tipPt.y); await page.waitForTimeout(600); }
const tip = await page.$eval(".maplibregl-popup .tip", (e) => e.textContent).catch(() => "");
ok("tooltip: name, similarity, confidence, reference region, dimensions", /Similarity/.test(tip) && /Confidence/.test(tip) && /Jezero Crater/.test(tip) && /Terrain/.test(tip), tip.replace(/\s+/g, " ").slice(0, 90));
await page.mouse.move(box.x + 5, box.y + box.height - 5);
// 16. reference region tab with the Mars map
await page.click('.side .railtabs button:has-text("Reference region")');
await page.waitForFunction(() => window.__ptBodyMap && window.__ptBodyMap.getSource("base"), null, { timeout: 60000 }).catch(() => {});
ok("Mars map uses re-projected Trek tiles", await page.evaluate(() => /^trek:\/\/jpg\/7\/\{z\}/.test(window.__ptBodyMap?.getSource("base")?.tiles?.[0] ?? "")));
ok("Mars map marks all eight reference regions", (await page.$$(".bodymap .bmark")).length === 8 && (await page.$$(".bodymap .bmark.on")).length === 1);
await page.click('.bodymap .seg button:has-text("Geologic units")');
await page.waitForTimeout(600);
ok("planetary overlay toggles and states its limits", await page.evaluate(() => !!window.__ptBodyMap.getLayer("over")) && /SIM 3292/.test(await page.$eval(".bodymap .layerfacts", (e) => e.textContent)));
ok("planetary scale bar uses the body's radius", /Mars radius/.test(await page.$eval(".bodymap .credit", (e) => e.textContent)));
await page.waitForTimeout(6000);
net("Mars imagery tiles load (network)", await page.evaluate(() => window.__ptBodyMap.isSourceLoaded("base")));
ok("reference sheet lists the measured values with their sources", (await page.$$(".refsheet .ftable.ref tr")).length === 6);
// 17. dossier cartography
await page.goto(BASE + "/#/explore?t=tranquillitatis&s=c117"); await page.reload();
await page.waitForSelector(".dhead h2");
await page.waitForFunction(() => window.__ptSiteMap && window.__ptSiteMap.getLayer("win"), null, { timeout: 30000 });
ok("field report: coordinates in two forms and a locator globe", /25°22′30″N/.test(await page.$eval(".coords", (e) => e.textContent)) && (await page.$$(".dhead .locator svg")).length === 1);
ok("field report splits what holds from what fails", (await page.$$(".holdfail section")).length === 2 && (await page.$$(".holdfail li.plus")).length === 4 && (await page.$$(".holdfail li.minus")).length === 1);
ok("site map draws the analysis window, north arrow and scale", await page.evaluate(() => !!window.__ptSiteMap.getLayer("win")) && (await page.$$(".sitemap .north")).length === 1 && (await page.$$(".sitemap .scalebar")).length === 1);
const span = await page.evaluate(() => { const g = window.__ptSiteMap.getSource("win").serialize().data.geometry.coordinates; const lats = g.map((p) => p[1]); return (Math.max(...lats) - Math.min(...lats)) * 111.19; });
ok("analysis window is 61 km across", Math.abs(span - 60.8) < 0.6, span.toFixed(1) + " km");
await page.click('.sitemap .seg button:has-text("Geologic units")');
await page.waitForTimeout(500);
ok("site map: geologic units overlay", await page.evaluate(() => !!window.__ptSiteMap.getLayer("geology")));
await page.click('.sitemap .seg button:has-text("Radar")');
await page.waitForTimeout(500);
ok("site map: radar overlay comes with its caution and a date", await page.evaluate(() => /OPERA_L2_Radiometric/.test(window.__ptSiteMap.getSource("obs")?.tiles?.[0] ?? "")) && /does not identify rock type/.test(await page.$eval(".sitemap", (e) => e.textContent)) && (await page.$$('.sitemap .datebar input[type="date"]')).length === 1);
await page.click('.sitemap .seg button:has-text("Region")');
await page.waitForTimeout(2500);
ok("site map: region extent", await page.evaluate(() => window.__ptSiteMap.getZoom() < 5));
ok("comparability table explains what can be compared", (await page.$$("table.compare tbody tr")).length === 5);
ok("score bars are drawn by evidence kind", (await page.$$(".ftable .bar.k-measured")).length > 0 && (await page.$$(".ftable .bar.k-model")).length > 0);
ok("Moon map present in the report", (await page.$$(".report .bodymap .bmark")).length === 5);
await page.locator("#passes").scrollIntoViewIfNeeded();
await page.click('#passes button:has-text("Search the Copernicus catalogue")');
const passes = await page.waitForSelector("table.passes tbody tr td.num", { timeout: 25000 }).then(() => true, () => false);
net("live Sentinel pass search returns scenes (network)", passes, passes ? (await page.$$("table.passes tbody tr")).length + " rows" : "");
if (passes) {
  ok("radar passes list mode, polarisation and pass direction", /IW/.test(await page.$eval("table.passes >> nth=1", (e) => e.textContent)) && /VV/.test(await page.$eval("table.passes >> nth=1", (e) => e.textContent)));
  await page.click('table.passes >> nth=0 >> button:has-text("Show on map") >> nth=0');
  await page.waitForTimeout(800);
  ok("a pass can be drawn on the site map by date", await page.evaluate(() => /HLS_S30/.test(window.__ptSiteMap.getSource("obs")?.tiles?.[0] ?? "")));
} else ok("pass search failure is explained to the reader", (await page.$$("#passes .caution")).length >= 1 || (await page.$$('#passes [role="status"]')).length >= 1);
// polar region: cold-trap figures from the Diviner polar product
const polarSite = sites.find((s) => s.scores.shackleton);
await page.goto(`${BASE}/#/explore?t=shackleton&s=${polarSite.id}`); await page.reload();
await page.waitForSelector(".dhead h2");
ok("polar report shows Diviner cold-trap figures and the polar caveat", (await page.$$(".polar .facts > div")).length === 6 && /beyond 80° latitude/.test(await page.$eval(".report .bodymap", (e) => e.textContent)));
// 18. portfolio map and matrix
await page.click('.nav button:has-text("Portfolio")');
await page.waitForSelector(".worldmap .wm-site");
ok("portfolio world map: six lettered sites and the other listed sites", (await page.$$(".worldmap .wm-site")).length === 6 && (await page.$$(".worldmap > circle")).length === sites.length - 6);
await page.hover(".roster > li >> nth=0");
await page.waitForTimeout(300);
ok("pointing at a site highlights its matrix cells and its map mark", (await page.$$(".matrix td.cov.on")).length === 30 && (await page.$$(".worldmap .wm-site.on")).length === 1);
await page.locator(".worldmap .wm-site >> nth=3").focus();
await page.keyboard.press("Enter");
await page.waitForSelector(".dhead h2");
ok("portfolio map mark opens its field report", /Harrat Khaybar/.test(await page.$eval(".dhead h2", (e) => e.textContent)));
// 19. method tables
await page.click('.nav button:has-text("Method & data")');
await page.waitForSelector("table.layers");
const layerRows = await page.$$eval("table.layers tbody tr", (e) => e.length);
ok("every outside map layer is documented", layerRows === 16 + 9, "rows=" + layerRows);
ok("outside sources assessed with a decision each", (await page.$$("details.ds.src")).length >= 10 && (await page.$$("details.ds.src .decisions .tag")).length >= 10);
ok("original dataset provenance kept", (await page.$$("details.ds:not(.src)")).length === 17);
ok("table of contents covers nine sections", (await page.$$(".toc li")).length === 9 && (await page.$$(".method h2")).length === 9);
// 20. deep link with layer state, then small screens
await page.goto(BASE + "/#/explore?t=gale&l=terrain&b=bluemarble&o=snow"); await page.reload();
await page.waitForSelector(".rk"); await mapReady();
ok("deep link restores region, dimension, basemap and overlay", /Gale Crater/.test(await page.$eval(".cartouche h2", (e) => e.textContent)) && (await page.$eval('.segs button[aria-pressed="true"]', (e) => e.textContent)) === "Terrain"
  && await page.evaluate(() => /BlueMarble/.test(window.__ptMap.getSource("base")?.tiles?.[0] ?? "") && /Snow_Cover/.test(window.__ptMap.getSource("obs")?.tiles?.[0] ?? "")));
for (const [w, h, name] of [[390, 844, "phone"], [820, 1180, "tablet"]]) {
  await page.setViewportSize({ width: w, height: h });
  for (const hash of ["#/explore?t=jezero", "#/explore?t=jezero&s=c027", "#/findings", "#/portfolio", "#/method"]) {
    await page.goto(BASE + "/" + hash); await page.reload(); await page.waitForTimeout(1800);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`${name} ${hash}: no sideways scroll`, over <= 1, "overflow=" + over);
  }
}
await page.goto(BASE + "/#/explore?t=jezero"); await page.reload(); await page.waitForSelector(".rk");
ok("small screen keeps map, legend, ranking and controls", (await page.$$(".mapframe .map")).length >= 1 && (await page.$$(".legend .classes li")).length >= 6 && (await page.$$(".rk")).length > 10 && (await page.$$(".wrow input")).length === 7);

const real = errors.filter((e) => !/Failed to load resource|net::ERR|AbortError|signal is aborted/.test(e));
console.log("console/page errors:", real.length ? real : "none");
console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped (network)`);
await browser.close();
process.exit(fail ? 1 : 0);
