# PROGRESS — Planetary Twin

Last updated: 2026-11-14

## Completed

- [x] Workspace inspected; dataset access verified from this machine (16 endpoints probed, all public, no login).
- [x] Data acquisition: ETOPO 2022, MOLA MEGDR, LOLA LDEM, TES albedo, MERRA-2 / CERES / IMERG (NASA POWER Zarr),
      MODIS LST / NDVI / albedo / land cover (NASA GIBS, decoded with official colormaps), Mars Climate Database
      queries for 8 sites × 12 seasons, Diviner GCP and PRP by HTTP range request, Macrostrat lithology, Natural Earth names.
- [x] Earth feature grid: 341,040 land cells at 0.25°.
- [x] Reference features for 8 Mars and 5 Moon regions, each value tagged measured / model / literature / definition.
- [x] Similarity engine (direct match, gap closure, category affinity; geometric aggregation; 5 mission profiles).
- [x] Candidate extraction (non-maximum suppression), site tier of 122 sites (27 established, 95 candidates).
- [x] Validation against 26 scoreable established analogs with a calibrated null.
- [x] Sensitivity analysis (150 perturbed runs per region) feeding per-site rank stability.
- [x] Portfolio by greedy set cover with an explicit uncovered list.
- [x] Three findings, each checked against independent literature.
- [x] Web application: Explore, Site dossier, Findings, Portfolio, Method & data. Responsive.
- [x] Tests: 10 pipeline checks, 90 browser end-to-end checks (the original set plus cartography and layout checks).
- [x] Field Atlas redesign: paper-and-ink identity, one composition per section, design system in `DESIGN.md`.
- [x] Observatory redesign (2026-11-14): dark instrument identity, map as a full-bleed well, Archivo and Source Serif 4,
      fixed-height readout console, report section index, evidence charts on Findings, typeset formulas, one-panel-at-a-time
      layout on phones. Scoring, data, routes and deep links unchanged. `DESIGN.md` rewritten.
- [x] Plate & margin redesign (2026-11-15, root app): dark plates for maps, readouts and imagery, drafting-film paper for
      the written analysis; Geologica and Newsreader; a neatline, title block, centre readout and segmented scale bar on
      the Explore map; legend and readout moved into a margin band under it, with a histogram painted in map colours;
      field report as a form with a label gutter; booktabs tables; numbered equations; full-bleed portfolio plate with a
      lettered manifest. Scoring, data, routes and deep links unchanged. `DESIGN.md` rewritten.
- [x] Night edition (2026-11-15): black base, graphite scale, navy keys with eased gradients, a brighter star field and
      a navy rim of light behind the globe, one entrance animation per view. Scoring, data, routes unchanged.
- [x] Cartography: classed similarity layer with numeric legend and histogram, cursor readout and pinned cells,
      coordinate navigation, globe / flat views, relief basemap, layer panel with 16 Earth layers, site maps with the
      scored window, interactive Moon and Mars maps (9 layers), equal-area portfolio map.
- [x] Data-source assessment (`docs/DATA_SOURCES.md`): 12 outside services examined; scoring unchanged.
- [x] Lunar polar statistics from the Diviner Polar Resource Product, already computed, now shown in reports.
- [x] Documentation and presentation.
- [x] Published on GitHub Pages (https://tariatiineserguu.github.io/Nasa-Hackathon/), deployed from `main` by GitHub Actions.

## Research findings

1. **Validation.** Environment-motivated analogs: mean calibrated rank 0.88 (chance 0.50), 11 of 13 in the top quarter
   of land, p ≈ 9 × 10⁻⁷. Geology- or logistics-motivated analogs: mean 0.65, p ≈ 0.03. Río Tinto (0.16) and Ries
   (0.35) are not recovered, which is the expected behaviour: the scan cannot see mineralogy or impact structure.
2. **Harrat Khaybar ↔ Mare Tranquillitatis / Marius Hills**: 4 of 5 dimensions (terrain 0.73, aridity 0.65, surface
   0.77, geology 1.00; thermal 0.03). Top 0.05% of land before geology. Confidence moderate (percentile 92.9–100
   under perturbation). Umm Jirsan lava tube lies inside the 61 km window.
3. **West Kunlun ↔ Jezero**: rank 1 on Earth in 4 of 5 profiles, stable (99.96–100). Terrain 0.94, surface 0.97,
   aridity 0.56, thermal 0.27, atmosphere 0.11, geology 0.43.
4. **Gobi**: best cell is rank 1 on Earth for Mare Tranquillitatis in the gridded scan (terrain 0.88, surface 0.66),
   but geology 0.40 and aridity 0.50. For Mars the best Mongolian cells are in the top 0.2–4% of land and match at
   most 2 dimensions.
5. **What Earth cannot do**: best thermal score for any Mars region is 0.32, for any lunar region 0.21. No atmosphere
   requirement is met anywhere.

## Technical decisions (and why)

| Decision | Reason |
|---|---|
| Static web app + precomputed JSON/PNG, no server | Results are fixed after the pipeline; a static site is easy to host and demo offline. Re-weighting runs in the browser on per-factor rasters. |
| Vite + React + TypeScript + MapLibre GL; hand-written CSS and SVG charts | Small dependency set, full control of the visual identity. |
| One ~1.9 km terrain baseline for all bodies | ETOPO 60″, MOLA 32 px/deg and LOLA 16 px/deg have nearly identical ground pixels, so slopes are comparable without resampling one body to another's resolution. |
| Gap closure instead of distance for temperature, rainfall, pressure | Earth never reaches these values; a distance would be ~0 everywhere and hide real differences between sites. |
| Geometric mean inside factors and between them | First run used an arithmetic mean inside factors; ice sheets then scored 0.5 on "surface" (bare but white) and topped every ranking. A failed variable must not be averaged away. |
| Diurnal range from the 24 hourly MERRA-2 climatology fields | `TS_MAX_AVG / TS_MIN_AVG` turned out to be monthly extremes including weather, not a diurnal cycle (Dome C in polar night read 29 K). |
| Temperature = MERRA-2 sharpened with MODIS anomalies | MODIS two-overpass means run ~8 K warm in deserts; MERRA-2 alone cannot resolve valleys. |
| Rainfall = log-mean of IMERG and MERRA-2, floor 10 mm/yr; IMERG only within ±60° | Both over-read in hyper-arid cores (rough check against desert station normals); IMERG is zero-filled over polar ice. |
| Column water vapour moved from aridity to atmosphere | The Atacama coast is rainless but not vapour-poor; mixing the two hid the property that makes it an analog. |
| Geology only in the site tier, from Macrostrat | No global lithology raster was reachable without registration; a point lookup is also independent of the scan, so it doubles as verification. |
| Diviner read by HTTP range request | The polar product is a 605 MB fixed-width table on a regular mesh; byte offsets give exactly the rows needed. |
| Place labels from Natural Earth plus a four-entry gazetteer | Labels only, applied after scoring. |
| Outside map layers are display-only | A tile is a colour-mapped, resampled picture. Reading it as data would add false precision; the pipeline decodes scored products separately. |
| No new dataset entered the score | Each candidate failed at least one test: belongs to a scored dimension, comparable between Earth and the Moon or Mars, reachable without credentials. |
| Confidence drawn as a fill, similarity as colour | The two were both shown as coloured dots before and could be read as one scale. |
| Similarity shown in five classes by share of land | Class limits with printed score ranges can be read off the map; a continuous ramp cannot. The continuous style is kept as an option. |
| Radar shown only as a terrain-corrected product, never scored | Backscatter mixes roughness, moisture, slope and geometry; it is not a measure of rock type and has no like-for-like planetary counterpart. |
| Moon and Mars tiles re-projected in the browser | NASA Treks serves plate-carrée tiles; the map library needs Web Mercator. Scale bars use each body's radius. |
| Empty similarity layer is hidden, not swapped for a placeholder | The original placeholder pixel was half-transparent blue and could win a loading race, tinting the whole map. |
| Dark interface, every basemap dark, one similarity ramp per body | The globe is the subject; a dark well makes the similarity layer the brightest thing on screen. With no light basemap left, the second (light-ground) ramp per body was removed. |
| Moon ramp starts in slate teal, not navy | A navy low end matched the sea, so weak land cells read as water. |
| Readout console has a fixed height on wide screens | When it grew on hover the map shrank under the cursor, fired a mouseout and reset the reading. |
| Site tooltip ignores the pointer | A tooltip that can sit under the cursor takes hover away from the map. |
| No monospace face; Archivo tabular figures for numbers | One family with a width axis carries names, figures and controls; numbers still line up. |

## Known limitations

- See README "Limits you should know". In addition:
- Earth temperature anchor uses all land including Antarctica; changing it shifts gap-closure values slightly but not ranks.
- Albedo bands differ (MODIS 0.3–5 µm, TES 0.3–2.9 µm); lunar albedo is a literature constant by terrain type.
- Lunar polar reference windows mix sunlit ridge and permanent shadow at 1.9 km sampling.
- MODIS NDVI is a single year; albedo is seven dates.
- 22 of 122 site images are missing: 19 in the Antarctic interior (featureless snow) and 3 where the mosaic service returned a blank frame. The app falls back to shaded relief.
- Novelty statements rest on one web search each.

## Remaining / possible next steps

- Independent cross-checks from the JAXA Earth API (GCOM-C temperature and NDVI, GSMaP rainfall) at listed sites.
- Diviner high-resolution mosaics in place of the 0.5° bin for equatorial lunar regions, with re-validation.
- Fine-scale tier (≤100 m DEM, rock abundance) for shortlisted sites.
- Gridded lithology (GLiM) to bring geology into the global scan.
- Field-accessibility layer (roads, altitude, permits) for an operations profile.

## Blocking issues

None.
