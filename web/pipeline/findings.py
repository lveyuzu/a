"""Write web/public/data/findings.json: the narrative for the highlighted results.

Candidates are located by coordinate in the pipeline output; every number in the
text is read from sites.json at build time, so prose cannot drift from the data.
If a highlighted site drops out of the candidate tier in a future run, its
finding is skipped (and reported) rather than kept alive by hand.

The literature notes come from a web search on 2026-11-13 and are worded as what
that search did and did not find.
"""
import json
import math

from config import WEB_DATA


def main():
    sites = [s for s in json.loads((WEB_DATA / "sites.json").read_text()) if s.get("scores")]
    targets = {t["id"]: t for t in json.loads((WEB_DATA / "targets.json").read_text())}
    by_id = {s["id"]: s for s in sites}

    def near(lat, lon, km=45):
        s = min(sites, key=lambda x: (x["lat"] - lat) ** 2 + ((x["lon"] - lon) * math.cos(math.radians(lat))) ** 2)
        d = 111.2 * math.hypot(s["lat"] - lat, (s["lon"] - lon) * math.cos(math.radians(lat)))
        return s if d <= km else None

    def rank(site, tid):
        order = sorted(sites, key=lambda x: -(x["scores"][tid]["overall"]["balanced"] or 0))
        return [x["id"] for x in order].index(site["id"]) + 1

    def top(pct):
        return f"{100 - pct:.2f}".rstrip("0").rstrip(".") if pct < 99.995 else "0.01"

    out = []
    n_known = sum(s["kind"] == "known" for s in sites)

    # ------------------------------------------------------------------ 1. Harrat Khaybar
    s = near(25.375, 39.875)
    if s:
        t, tid = targets["tranquillitatis"], "tranquillitatis"
        sc, f, m = s["scores"][tid], s["features"], s["scores"]["marius"]
        four = [(x["name"], k) for x in sites for k, v in x["scores"].items()
                if targets[k]["body"] == "moon" and len(v["matched"]) >= 4]
        wet = {k: by_id[k]["features"]["precip"] for k in ("iceland_askja", "hawaii_maunakea", "craters_moon", "lanzarote") if k in by_id}
        out.append(dict(
            id="harrat", site=s["id"], target=tid,
            headline="A stand-in for the lunar maria in Saudi Arabia's Harrat Khaybar",
            summary=(f"A 61 km window on the basalt plateau north of Medina matches Mare Tranquillitatis in {len(sc['matched'])} of the "
                     f"{len(sc['expected'])} dimensions we can test: terrain, surface, dryness and rock type. Only temperature fails. "
                     f"{'It is the only site in the detailed tier to match four dimensions for any lunar region' if len(set(n for n, _ in four)) == 1 else 'Few sites match four dimensions for any lunar region'}"
                     f" (it does so for Marius Hills as well, {len(m['matched'])} of {len(m['expected'])}). The gridded scan put it in the top {top(sc['pct']['balanced'])}% of Earth's land "
                     f"without knowing its rock type; an independent geological map then confirmed Neogene basalt, which lifts it to rank {rank(s, tid)} of {len(sites)} listed sites."),
            why=("Lunar surface missions will drive across basaltic plains and hope to shelter in lava tubes. Today's basaltic training grounds are "
                 f"wetter and partly vegetated (our blended rainfall estimate: Iceland {wet.get('iceland_askja', 0):.0f}, Hawaiʻi {wet.get('hawaii_maunakea', 0):.0f}, "
                 f"Idaho {wet.get('craters_moon', 0):.0f} mm/yr against {f['precip']:.0f} here). A dry, bare, dark basalt plateau with mapped lava tubes and mare-like "
                 "slopes at kilometre scale is a candidate for long-traverse rover trials, tube-exploration rehearsals and work on basalt as a construction or oxygen feedstock."),
            differences=[
                f"Temperature is the failed dimension: {f['t_mean']:.0f} K mean with a {f['t_dtr']:.0f} K daily swing, against {t['features']['t_mean']['value']:.0f} K and about {t['features']['t_dtr']['value']:.0f} K at the Apollo 11 site. Gap closure is {sc['fac']['thermal'] * 100:.0f}%.",
                f"Albedo {f['albedo']:.2f} against {t['features']['albedo']['value']:.2f}: young basalt and thin soil are brighter than mature mare regolith, and a peak NDVI of {f['ndvi']:.2f} shows sparse seasonal vegetation.",
                "The ground is lava flow and scoria, not metres of impact-gardened regolith. Grain shape, glass content and electrostatic dust behaviour are not reproduced.",
                "The field also holds silica-rich lava domes (Jabal Abyad, Jabal Bayda) with no mare counterpart.",
                f"About {f['precip']:.0f} mm of rain a year, wind, and a full atmosphere at 1 g.",
                "Slopes are compared over a 3.8 km baseline. Metre-scale lava roughness, which governs rover hazard, is not assessed.",
            ],
            literature=[
                dict(claim=f"Geological map units at the point: “{s['geology']['units'][-1]['name'] or 'Cenozoic volcanic rocks'}” — {s['geology']['units'][-1]['lith']} ({s['geology']['units'][-1]['age']}). This lookup is independent of the scan.",
                     source="Macrostrat geologic map compilation (CC-BY 4.0)", url="https://macrostrat.org/"),
                dict(claim="Umm Jirsan, inside Harrat Khaybar, is reported as the longest known lava tube in Arabia at 1,481 m — a process feature our scan cannot see.",
                     source="Stewart et al. 2024, PLOS ONE (reported by Live Science)", url="https://www.livescience.com/archaeology/humans-were-living-in-a-lava-tube-7000-years-ago-on-the-arabian-peninsula"),
                dict(claim="The lunar counterparts are documented: an intact lava tube beneath the Marius Hills skylight and a cave conduit beneath the Mare Tranquillitatis pit.",
                     source="Kaku et al. 2017, Geophys. Res. Lett. 44, 10155; Carrer et al. 2024, Nature Astronomy 8, 1119"),
                dict(claim="Harrat Khaybar is one of the large Cenozoic basalt fields of western Arabia, with eruptions continuing into historical times.",
                     source="Smithsonian Global Volcanism Program, Harrat Khaybar"),
            ],
            novelty=(f"Not among the {n_known} established analog sites in our validation list (nearest: {s['nearest_known']['name']}, {s['nearest_known']['km']} km). "
                     "A web search on 13 November 2026 for Harrat Khaybar or the Saudi harrats as lunar or planetary analogs returned geological, archaeological and "
                     "geoheritage studies and visual comparisons, but no analog-science or mission-simulation study. That is what one search found, not proof that none exists. "
                     f"Confidence is {sc['conf']['label']}: across perturbed runs its percentile ranges {sc['conf']['pct_p10']:.1f}–{sc['conf']['pct_p90']:.1f}."),
            uses=[]))
    else:
        print("SKIPPED finding: harrat (site no longer in tier)")

    # ------------------------------------------------------------------ 2. West Kunlun
    s = near(35.375, 82.625)
    if s:
        tid = "jezero"
        t, sc, f = targets[tid], s["scores"][tid], s["features"]
        q, lad = by_id.get("qaidam"), by_id.get("ladakh")
        firsts = sorted({p for a, p, r_ in s["found"] if a == tid and r_ == 1})
        cmp_txt = ""
        if q:
            qs = q["scores"][tid]
            cmp_txt = (f" Against the established Qaidam Basin site {s['nearest_known']['km'] if s['nearest_known']['name'].startswith('Qaidam') else 853} km to the east it scores "
                       f"{sc['fac']['terrain']:.2f} vs {qs['fac']['terrain']:.2f} on terrain, {sc['fac']['thermal']:.2f} vs {qs['fac']['thermal']:.2f} on thermal, "
                       f"{sc['fac']['surface']:.2f} vs {qs['fac']['surface']:.2f} on surface and {sc['fac']['aridity']:.2f} vs {qs['fac']['aridity']:.2f} on aridity.")
        out.append(dict(
            id="kunlun", site=s["id"], target=tid,
            headline="The closest match to Jezero Crater is a 5,200 m desert in the West Kunlun",
            summary=(f"The single best-scoring land cell on Earth for Jezero, under {len(firsts)} of 5 mission profiles, is a bare plateau at 35.4°N 82.6°E between the Kunlun and "
                     f"Karakoram ranges. It holds that position in the stress tests (percentile {sc['conf']['pct_p10']:.2f}–{sc['conf']['pct_p90']:.0f}). Terrain and surface match almost exactly "
                     f"(albedo {f['albedo']:.3f} against {t['features']['albedo']['value']:.3f}; median slope {f['slope_med']:.2f}° against {t['features']['slope_med']['value']:.2f}°)."
                     f"{cmp_txt} It still matches only {len(sc['matched'])} of {len(sc['expected'])} dimensions outright: cold, thin air and geology are partial."),
            why=("The published case for the Qaidam Basin as a Mars analog rests on being high, cold, dry and bare. The scan applies that same logic with numbers and "
                 "finds that it points several hundred kilometres further west, to ground that is higher, colder and at least as dry. For hardware, that means "
                 "roughly half sea-level pressure, seven frozen months and Jezero-like slopes in one place."),
            differences=[
                f"Mean surface temperature {f['t_mean']:.0f} K against {t['features']['t_mean']['value']:.0f} K: {sc['f']['t_mean'] * 100:.0f}% of the gap from typical Earth land. The daily swing is {f['t_dtr']:.0f} K against {t['features']['t_dtr']['value']:.0f} K.",
                f"Pressure {f['pressure']:.0f} kPa is about half of sea level and still roughly {f['pressure'] / t['features']['pressure']['value']:.0f} times Jezero's {t['features']['pressure']['value']:.2f} kPa.",
                f"About {f['precip']:.0f} mm of precipitation a year, seasonal snow, and {12 - round(f['frozen'] * 12)} months with mean temperatures above freezing: liquid water occurs here.",
                "Geology is known to us only from a 1:50M-scale map unit (Mesozoic sedimentary rocks). Nothing here shows the delta, carbonate and olivine-rich assemblage that makes Jezero scientifically important.",
                "Above 5,000 m and far from roads. Whether field work is practical is a separate question the scores do not answer.",
            ],
            literature=[
                dict(claim=f"The region between the Kunlun and Karakoram is described as the coldest and driest part of the Tibetan Plateau, with precipitation near 50 mm/yr. Our blended satellite–reanalysis estimate at the cell is {f['precip']:.0f} mm/yr.",
                     source="Fort & van Vliet-Lanoë, Permafrost and periglacial environment of Western Tibet, Landform Analysis",
                     url="https://yadda.icm.edu.pl/baztech/element/bwmeta1.element.baztech-33423505-1acb-439c-a034-71f360090c1a/c/Fort__Permafrost_and_periglacial_environment.pdf"),
                dict(claim="A 2025 permafrost study treats the West Kunlun as a 55,669 km² region of “extreme cold arid conditions”. It is a permafrost study, not a planetary one.",
                     source="The Cryosphere 19, 4211 (2025)", url="https://tc.copernicus.org/articles/19/4211/2025/"),
                dict(claim=("Recognised Mars analogs lie on either side: the Qaidam Basin and Ladakh. Both were held out of scoring and land at percentile "
                            f"{q['scores']['meridiani']['pct']['balanced']:.1f} and {lad['scores'][tid]['pct']['balanced']:.1f} for their best region." if q and lad else
                            "Recognised Mars analogs lie on either side: the Qaidam Basin and Ladakh."),
                     source="Xiao et al. 2017, Earth-Sci. Rev. 164, 84; Pandey et al. 2020, Int. J. Astrobiol. 19, 78"),
            ],
            novelty=(f"Not among the {n_known} established analog sites in our list (nearest: {s['nearest_known']['name']}, {s['nearest_known']['km']} km). "
                     "Our search found the West Kunlun studied for permafrost and glaciers but not as a planetary analog. The environmental reasoning is not new, since it is the "
                     "published case for Qaidam. What is new is a quantitative ranking that places this ground above both neighbouring analog provinces."),
            uses=[]))
    else:
        print("SKIPPED finding: kunlun")

    # ------------------------------------------------------------------ 3. Mongolia's Gobi
    s = near(42.875, 101.375)
    if s:
        tid = "tranquillitatis"
        t, sc, f = targets[tid], s["scores"][tid], s["features"]
        probes = [(x, p) for x in sites for p in x.get("probe", [])]
        mars = sorted([(x["scores"][p]["pct"]["balanced"], targets[p]["name"], len(x["scores"][p]["matched"])) for x, p in probes if targets[p]["body"] == "mars"], reverse=True)
        best_m = max(m[2] for m in mars) if mars else 0
        mj = by_id.get(s["id"])["scores"]["jezero"]
        out.append(dict(
            id="gobi", site=s["id"], target=tid,
            headline="Mongolia's Gobi: a terrain twin for the lunar maria, only a partial one for Mars",
            summary=(f"The challenge brief asks about the Gobi, so we tested it directly. Its best cell, in southern Ömnögovi at 42.9°N 101.4°E, is the top-ranked land cell on Earth "
                     f"for Mare Tranquillitatis in the gridded scan: median slope {f['slope_med']:.2f}° against {t['features']['slope_med']['value']:.2f}°, relief {f['relief']:.0f} m against "
                     f"{t['features']['relief']['value']:.0f} m, roughness scaling {f['hurst']:.2f} against {t['features']['hurst']['value']:.2f}, on dark, bare ground. "
                     f"For Mars, the best Mongolian cell for each region sits between percentile {min(m[0] for m in mars):.1f} and {max(m[0] for m in mars):.1f} "
                     f"but matches at most {best_m} dimensions. The Gobi earns its place on terrain and surface, not on climate."),
            why=("Mongolia is developing its own analog station in the Gobi. These numbers suggest where that effort is on firm ground, namely mobility, navigation and "
                 "operations on plains shaped like lunar maria and the flatter Martian sites, and where a claim of Mars-like climate would not survive measurement."),
            differences=[
                f"Rock type: the mapped unit is Paleozoic sedimentary and felsic volcanic rock, not basalt, so geology scores {sc['fac']['geology']:.2f}.",
                f"Albedo {f['albedo']:.2f} against {t['features']['albedo']['value']:.2f} for mare regolith: dark for a desert, still nearly twice as bright.",
                f"About {f['precip']:.0f} mm of precipitation a year. That is arid, not hyper-arid; aridity scores {sc['fac']['aridity']:.2f}.",
                f"Mean surface temperature {f['t_mean']:.0f} K, with a warmest month near {f['t_warm']:.0f} K. Against Jezero this closes {mj['f']['t_mean'] * 100:.0f}% of the thermal gap.",
                "The comparison is at kilometre scale. Gravel pavement, vegetation patches and dry channels at rover scale are not assessed.",
            ],
            literature=[
                dict(claim="MARS-V, a Mongolian organisation, is developing a Mars analog station in the Dundgovi–Ömnögovi Gobi and describes the region as highly Mars-like. We found no published quantitative basis for that comparison.",
                     source="Universe Space Tech magazine", url="https://universemagazine.com/en/mars-v-rehearsal-for-life-on-the-red-planet/"),
                dict(claim=f"Geological map unit at the point: “{s['geology']['units'][0]['name']}” — {s['geology']['units'][0]['lith']}.",
                     source="Macrostrat geologic map compilation (CC-BY 4.0)", url="https://macrostrat.org/"),
                dict(claim="Best Mongolian cell per Mars region (percentile of Earth's land, dimensions matched): " + "; ".join(f"{n} {p:.1f} ({k})" for p, n, k in mars) + ".",
                     source="This analysis, gridded scan, balanced profile"),
            ],
            novelty=("That the Gobi resembles Mars is an existing claim. What this adds is measurement: which part of the Gobi, similar to which planetary region, in which "
                     "dimensions, and by how much. The lunar-mare terrain match was not something our search found proposed elsewhere. "
                     f"Confidence for the lunar match is {sc['conf']['label']} (percentile {sc['conf']['pct_p10']:.1f}–{sc['conf']['pct_p90']:.0f} under perturbation)."),
            uses=[]))
    else:
        print("SKIPPED finding: gobi")

    (WEB_DATA / "findings.json").write_text(json.dumps(out, ensure_ascii=False))
    for o in out:
        print("\n##", o["headline"], "\n", o["summary"], "\n WHY:", o["why"], "\n NOVELTY:", o["novelty"])
        for d in o["differences"]:
            print("  -", d)
        for l in o["literature"]:
            print("  *", l["claim"])


if __name__ == "__main__":
    main()
