# PLANETARY TWIN — PLATE & MARGIN, NIGHT EDITION

The design system of the web application, as implemented in `src/styles.css` and the components under
`src/components` (the root app, which is what Vercel serves). `web/` still holds the earlier Observatory
build that GitHub Pages publishes. If this file and the code disagree, the code is wrong or this file is
out of date: fix whichever it is.

## 1. Identity

Planetary Twin reads like a sheet from a planetary atlas laid next to the instrument that made it. The
models are the USGS planetary geologic map sheets (a plate with a neatline, a title block and an
explanation in the margin), a geological expedition report, a scientific paper with booktabs tables
and numbered equations, and a mission planning table.

Five rules give the interface its character.

1. **The instrument is a step darker than the analysis.** Maps, live readouts and imagery sit on
   near-black plates; written evidence, rankings, reports and the method sit on the graphite page.
2. **Navy is the interface; colour is data.** Navy marks what is pressed, selected or focused. Beyond
   it, colour belongs to the three bodies and the similarity layer.
3. **Confidence is a fill, never a colour.** Solid is high, half-filled moderate, open low, on the map,
   in lists, in tooltips and in reports.
4. **How a number was obtained is drawn as a pattern.** Solid means measured, hatched means model or
   blend, dotted means proxy, on tags, score bars and chart lines (model curves are dashed).
5. **Every map is a plate.** Neatline or registration corners, title block, legend with numeric
   ranges, scale bar, credit line, and for outside layers the product, resolution and limits.

Things the interface does not use: gradients or glows as decoration, glass effects, cards nested in
cards, uppercase tracked labels, icon tiles, emoji, monospace type, entrance animations on scroll.

## 2. Colour

Night edition: a black page, a graphite scale, and navy for everything you press or that is selected.
Every component reads its colours from surface tokens (`--bg`, `--fg`, `--fg-2`, `--fg-3`, `--line`,
`--line-2`, `--earth`, `--mars`, `--moon`); `.plate` (also `.mapframe`, `.frame`, `.locator` and map
popups) redefines them a step blacker, so the instrument reads as deeper than the page around it.

### Page and plate

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#0A0B0E` | Page ground (rails, catalogue, reports, long pages) |
| `--sheet` / `--shade` | `#111318` / `#171A21` | Raised insets; selected rows and tab strips |
| `--ink` | `#E8EAEE` | Headings, values. 16:1 |
| `--ink-2` | `#B9BEC8` | Reading text. 10:1 |
| `--ink-3` | `#8B929E` | Labels, notes, credits. 6:1 |
| `--edge` / `--edge-2` | `#2F3540` / `#4A5260` | Borders of controls; booktabs rules |
| `--plate` / `--plate-0` | `#050608` / `#020304` | Map column and map wells |
| `--chalk` … `--chalk-4` | `#E8EAEE` … `#39404B` | Text and line work on plates |

### Navy

| Token | Hex | Use |
|---|---|---|
| `--navy` … `--navy-3` | `#1B3260` … `#3A5FA3` | Fills and borders of selected keys |
| `--navy-hi` | `#94ADDC` | Focus, the section marker, selection bars, matched squares, slider fills |
| `--key` | eased gradient `#2E5193` → `#1B3260` | Every selected key: chips, segments, body switch, primary buttons, covered cells |

Gradients are eased: their stops follow an ease-out curve instead of a straight line, so a glow never
shows a band. They are used for the page-head glow, the masthead, the selected keys, the hover sweep on
rows, the score bars (graphite to navy), the margin band and the rim of light around the globe.

### Bodies

Earth `#93B98F` (mineral green), Mars `#E8865A` (iron oxide), Moon `#9EC3D7` (anorthosite slate). They
mark data, not interface: chart series, the planetary values in comparisons, the similarity figure in a
report, the body discs. The compared body is set by `data-body` (`--acc-paper`, `--acc-plate`).

### The night sky

Behind the globe a star field is drawn on canvas from a fixed seed (two layers; the second breathes
slowly so a few stars twinkle), and a navy rim of light sits on the globe's limb, positioned from the
map's padding and sized from its zoom. They exist to set the Earth off; in flat view the map covers them.
The Atlas relief basemap uses graphite land on a navy sea.

### Similarity ramps

Every basemap is dark, so each body has one ramp, ordered in lightness so it survives greyscale and
colour-blind viewing (`src/lib/score.ts`); the strongest match is always the brightest cell. `mars` runs
oxblood → copper → apricot → ivory, `moon` slate teal → ice blue → near white. The layer shows the best
30% of land in five classes by share of land area (top 30–10%, 10–3%, 3–1%, 1–0.1%, 0.1%), recomputed
from the live distribution. Classes are a display choice only.

## 3. Typography

Two families from Google Fonts (`index.html`).

| Family | Role |
|---|---|
| **Geologica** (variable, 200–700) | Everything that is a name, a number or a control. Light (200–300) and tightly tracked for page titles, site names and large figures; 400–500 for interface text. Tabular figures wherever numbers are compared |
| **Newsreader** (optical sizes) | Running prose: ledes, report and finding text, list items, limits. Its italic is the instrument's own voice: "Where Earth resembles", "Compare Earth with", report lines, captions, cartographic names on the map |

There is no monospace face.

| Element | Size / line height |
|---|---|
| Page title | 38–68 px / 1.0, Geologica 300, −0.035 em |
| Result figure (Findings) | 112 px, Geologica 200 |
| Site name in a report | 36–58 px, Geologica 300 |
| Region name in the map title block | 30 px, Geologica 300 |
| Section title on a page | 30 px, Geologica 400 |
| Panel heading | 15 px, Geologica 500, phrased as the question the control answers |
| Lede | 19 px / 1.55, Newsreader |
| Prose | 17 px / 1.6, Newsreader, at most 66 characters |
| Interface text | 13.5–14 px |
| Labels, notes | 12–13 px, sentence case |
| Credits | 11.5–12 px |

## 4. Composition

Structure is square. Pressable controls take a 2 px radius. Two shapes are round on purpose: the body
discs, and the candidate tag, which is a pill because candidates are circles on the map (established
analogs are square there and square in their tag).

| Section | Composition |
|---|---|
| Explore | Paper rail (question, layers) · the plate (map with neatline, title block, controls; margin band with legend and readout; credit line) · paper catalogue (ranked sites, reference region) or the field report |
| Field report | A form: a sticky bar (back, section index), a title block with the site's station line (DMS, decimal, elevation), a four-cell measurement ledger, then sections whose titles sit in a left gutter that follows the reader |
| Findings | A paper: the question as a title, the three results as a ledger of label and giant figure, statement, evidence chart; then one article per finding with a sticky column of image plates |
| Portfolio | A planning table: an Equal Earth plate running edge to edge, a lettered manifest of the six sites under it, the coverage matrix as a requirement board, the shortfalls |
| Method & data | A manual: a numbered contents column that follows the reader, numbered sections, equation plates numbered (1)…(n) down the page, booktabs tables, expandable dataset rows |

## 5. Navigation

- Masthead on paper: the wordmark (Earth and its twin overlapping), the four sections, and the body
  switch. The section being read is marked by the lens, the shape where the two circles of the
  wordmark overlap, filled in the accent, and a 3 px ink bar on the masthead rule.
- Body switch: "Compare Earth with" then Mars and Moon as two keys with a disc in the body colour;
  the chosen key is ink with a filled disc.
- Routes are hash routes: `#/explore?t=<region>&s=<site>`, `#/findings`, `#/portfolio`, `#/method`.
  Explore also writes `l` (dimension), `b` (basemap) and `o` (observation overlay).
- Panel tabs are index tabs: the open tab is cut from the same paper as the panel under it.
- The field report and the Method page each keep a sticky index; the section being read is marked.
- 901–1180 px: the rail folds into the side column behind the tabs Sites, Region, Question, Layers.
  Under 900 px the same tabs choose one panel under the map.

## 6. Controls

| Control | Rule |
|---|---|
| Button | 1 px ink border; primary is ink with paper text |
| Chip | Presets (mission profiles); selected is ink |
| Filter keys | Chips joined into one row per question (status; minimum confidence) |
| Segmented control | One border around the group; the selected segment is filled with the surface's ink |
| Range | A ruled scale with a tick at every whole step, filled to the value in the accent, and a slide-rule cursor; the value in tabular figures beside it |
| Radio / checkbox rows | Native inputs in ink, with a name, one sentence of purpose and a source line; an open row turns to sheet and shows its facts |
| Date control | Previous, native date field, next; steps by the layer's period |
| Go to coordinates | A plate panel; the frame brightens on focus; an error is stated in words |

Button text says what will happen. There are no arrow glyphs in button text.

States: loading shows the wordmark, "Loading the analysis" in italic and a thin ink bar; "Loading map
tiles" appears on a map after a third of a second. Empty filters say so and offer "Show every site".
A data-load failure names what failed and how to fix it; a map layer or the satellite catalogue that
does not answer says so beside the map.

## 7. Tables and indicators

- `table.data`, `table.ledger`: booktabs rules (1.5 px ink above and below, 1 px ink under the header,
  hairlines between rows), tabular figures, numbers right-aligned. A ledger has an italic caption.
  Rows that open a report underline their name on hover and respond to Enter.
- `table.matrix`: a covered requirement shows the site letter on an ink tint; an open one shows the
  best available score over a thin bar. Pointing at a site turns its cells ink.
- Position on a 0–1 scale is a mark on a strip with reference ticks.
- Pips: one square per dimension the region needs; filled in the accent when matched, open when not,
  dotted when there is no data. Matched and failed list items use the same filled and open squares.
- Score bars: accent fill with an ink tick at the match threshold; per-variable bars take the pattern
  of their weakest evidence kind; confidence meters are grey ink, never the body colour.

## 8. Charts

Hand-drawn SVG (`src/components/charts.tsx`, `Pages.tsx`). Axis text Geologica 10.5 px in tabular
figures, grid lines in `--line`, no chart borders. Earth is always green, the planetary body rust or
slate, 1.6 px lines. Model curves are dashed. Chart colours are CSS variables, so a chart takes the
tone of the surface it sits on. Shaded relief panels are drawn from the 32 × 32 elevation window the
terrain score uses, with shared exaggeration and light.

## 9. Maps

### The Explore plate

- **Neatline** inset 10 px from the frame: a ruled line with minor ticks every 48 px, major ticks
  every 240 px, and registration crosses at the four corners.
- **Title block**, top left: "Where Earth resembles", the region, its body and coordinates, the
  dimension and weight profile in force. The dimension selector hangs under it as an index strip.
- **View controls**, top right: zoom in, zoom out, reset, globe / flat.
- **Centre readout**, bottom left: the coordinates the map is pointed at, the zoom, the projection.
- **Scale bar**, bottom right, in alternating segments; computed with each body's radius.
- **Go to** field above the scale bar.

### The margin band

Under the plate, as the explanation sits under a map sheet, at a fixed height on wide screens so the
map never resizes under the cursor:

- **Legend**: unit boxes with each class's share of land and score range, beside the land-area
  histogram whose bars are painted in the colour that cell gets on the map (grey for the 70% not
  drawn); then the key to site shape and fill. Observation overlays add their official legend.
- **Readout**: the cursor or pinned cell's coordinates, its similarity and share of land, and every
  dimension score with a bar against the threshold. A click pins the cell and names the nearest site.

When the map column is narrower than 720 px (beside an open report, on tablets) the band stacks: the
legend in two columns of classes, the readout under it.

### On the map

- Atlas relief basemap: hypsometric basalt tints on a slate sea under hill shading lit from the
  north-west; chalk coastlines and graticule, dashed boundaries.
- Site symbols: circle = candidate, square = established; fill = confidence; chalk on a plate halo.
  The eight best-ranked sites carry numbered flags when zoomed in; the selected site gets a reticle.
- Names of deserts, plateaus and ranges in italic Newsreader, letter-spaced for the largest regions.
- Tooltips are plate panels that never take the pointer.

### Other maps

- Site map and Moon/Mars maps sit in plate wells with registration corners, with their segmented
  controls on the paper above and their facts and credits below.
- Locator globes are small dark discs on paper (orthographic; planetary locators show a graticule only).
- The Portfolio plate uses Equal Earth, which keeps areas true.

The layer registry (`src/lib/layers.ts`) requires every outside layer to state its purpose, product,
resolution, units, period, limits, source and relation to the score. Outside layers are pictures of
data and never enter a score.

## 10. Motion

One entrance per view, then motion only in answer to an action. Curves: `--ease-out`
(`cubic-bezier(0.16, 1, 0.3, 1)`) for arrivals, `--ease-io` for loops.

- Explore: the neatline opens from the centre, the globe fades in when the map is ready, the title block
  slides in, the controls and margin band follow; the first ranked rows rise in sequence.
- A field report slides in beside the map and its site name is written on.
- Long pages: the title is written on, the lede rises, the rule under them draws from the left in navy.
- The section marker and tab indicators draw in; score bars ease to new values when weights change;
  rows take a navy sweep on hover; keys press down a pixel.
- Stars twinkle on a slow loop. Map moves are animated by MapLibre.
- `prefers-reduced-motion` removes all transitions, animations, twinkling and smooth scrolling.

## 11. Responsive behaviour

| Width | Behaviour |
|---|---|
| ≥ 1540 px | Three columns; a report opens beside the rail and the map |
| 1180–1540 px | With a report open the rail gives its space to the map |
| < 1320 px | Masthead tagline and "Compare Earth with" are dropped; rails narrow |
| 901–1180 px | Map and one side column; the rail's panels move behind the side column's tabs |
| < 1180 px | Title blocks stack; the results ledger moves its chart under the statement; Method contents move above the text; the portfolio manifest goes to two columns |
| < 900 px | One column: the map (56% of the screen height), the margin band, then one panel at a time chosen from sticky tabs. With a report open the map shrinks and its furniture steps aside. Tables scroll sideways inside their own box |
| < 560 px | Report locator globes are dropped; legend classes go to two columns |

Nothing scientific is removed at any width.

## 12. Accessibility

- Text contrast is at least 4.5:1 everywhere: labels (`--ink-3`) are 6.3:1 on the page and 4.6:1 on the
  most saturated selected row; text on navy keys is 7–11:1. `--ink-4` and `--chalk-4` are for non-text marks only.
- Focus is a 2 px outline in `--navy-hi`; inside clipping strips (masthead, tabs, lists) it is drawn
  inside the control. Rows and map marks that open a report are focusable and respond to Enter.
- State is never carried by colour alone: confidence by fill, evidence by pattern, matched dimensions
  by filled against open squares, the chosen body by a filled disc and a pressed key.
- Maps have text equivalents: the ranked list, the readout, the legend's class ranges, coordinates in
  every report. The histogram has a text description.
- Toggles use `aria-pressed`, tabs `aria-selected`, section indexes `aria-current`.
- Map rotation and tilt are off, so north is always up.
