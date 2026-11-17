# PLANETARY TWIN — OBSERVATORY

The design system of the web application, as implemented in `web/src/styles.css` and the components
under `web/src/components`. If this file and the code disagree, the code is wrong or this file is out
of date: fix whichever it is.

## 1. Identity

Planetary Twin is an instrument for looking at Earth as if it were another planet. The models are a
mission operations console, an observatory's plate archive and a planetary survey sheet: a dark room,
one bright globe, readouts in tabular figures, and notes that say how far a statement can be trusted.

Five rules give the interface its character. Everything else follows from them.

1. **The map owns the screen.** On Explore the globe sits in a full-bleed well with nothing around it
   but its own furniture. Space is shown only where there is space: a faint, static star field behind
   the globe, which the map covers in flat view.
2. **Colour is reserved for two things.** The three bodies (Earth, Mars, Moon) and the similarity
   layer. Interface chrome is chalk, silver and midnight.
3. **Confidence is a fill, never a colour.** A solid mark is high confidence, a half-filled mark
   moderate, an open mark low. Because similarity owns colour and confidence owns fill, the two cannot
   be confused on a map, in a list or in a tooltip.
4. **How a number was obtained is drawn as a pattern.** Solid means measured, hatched means model or
   blend, dotted means proxy. The same three patterns appear on tags, on score bars and on chart lines
   (model curves are dashed).
5. **Every map says what it is.** Title block, legend with numeric ranges, scale bar, credit line, and
   for outside layers the product, resolution, limits and whether the same product is scored.

Things the interface does not use: decorative gradients or glows, glass effects, cards nested in cards,
uppercase tracked labels, icon tiles, emoji, monospace type, entrance animations on scroll.

## 2. Colour

Grounds are midnight blue, darkest where the map sits. Text contrast is measured on `--bg`.

| Token | Hex | Use |
|---|---|---|
| `--void` | `#060A13` | The map well behind the globe (obsidian) |
| `--bg-sunk` | `#080D18` | Masthead, rails, readout console, sticky bars |
| `--bg` | `#0B1220` | Page ground (deep midnight) |
| `--bg-raised` | `#121B2D` | Selected rows, tooltips, formula blocks, open layer details |
| `--bg-hover` | `#162135` | Hover on rows and controls |
| `--line` | `#1D2839` | Hairlines inside a block |
| `--line-strong` | `#2E3B52` | Block edges, control borders at rest |
| `--fg` | `#ECE5D6` | Chalk (warm off-white): headings, values, symbols, selected controls. 14.9:1 |
| `--fg-2` | `#C9C3B6` | Reading text. 10.7:1 |
| `--silver` | `#A9B4C2` | Lunar silver: map furniture, annotation, frame marks. 8.9:1 |
| `--note` | `#8C95A5` | Labels and fine print. 6.2:1 |
| `--faint` | `#5D687B` | Non-text marks only (ticks, dashed outlines) |
| `--mars` / `--mars-hi` | `#D0713F` / `#EBA27C` | Mars: fills / text (oxidised copper) |
| `--moon` / `--moon-hi` | `#7FBAD3` / `#A9D6E8` | Moon: fills / text (ice blue) |
| `--earth` / `--earth-hi` | `#86A57F` / `#B3CCA8` | Earth: fills / text (mineral green) |
| `--sea` / `--land` | `#0A1628` / `#262C35` | Water and land on the SVG maps |

`--accent` and `--accent-hi` point at Mars or Moon, set by `data-body` on the app root (and on any
block that is about one body, such as a finding), so one switch re-colours every accent on the page.

Selected controls are chalk with midnight text. A selected row carries a 2 px bar in the accent.

### Similarity ramps

Every basemap is dark, so each body has one ramp, ordered in lightness so it survives greyscale and
colour-blind viewing (`web/src/lib/score.ts`). The strongest match is always the brightest cell.

| Ramp | Direction |
|---|---|
| `mars` | oxblood → copper → apricot → ivory |
| `moon` | slate teal → ice blue → near white. The low end is kept clear of the navy sea so that a weak land cell never reads as water |

The layer shows only the best-scoring 30% of land, in five classes by share of land area: top 30–10%,
10–3%, 3–1%, 1–0.1%, top 0.1%. Class limits are recomputed from the live distribution whenever the
region, dimension or weights change, and the legend prints the score range of each class. Classes are
drawn at 85% opacity so relief shading shows through. A continuous style is available. Classes are a
display choice only; they never touch a score or a rank.

## 3. Typography

Two families, loaded from Google Fonts in `web/index.html`.

| Family | Role |
|---|---|
| **Archivo** (variable width 62–125, weight 100–900) | Everything that is a name, a number or a control. Width carries the role: expanded (125%) for the wordmark, page titles, site and region names and large figures; 112% for readout values and scores; normal for controls, tables and labels; 94% with tabular figures for coordinates and measurements (`.num`) |
| **Source Serif 4** (optical sizes) | Reading text: ledes, prose, section titles inside documents, article headlines, italic remarks from the instrument itself ("Where Earth resembles", the report line, the idle readout) |

There is no monospace face. Numbers line up because Archivo's tabular figures are switched on wherever
numbers are compared.

| Element | Size / line height | Notes |
|---|---|---|
| Page title | 34–58 px / 1.04, Archivo 125%, weight 300 | `clamp`, balanced wrap, max 17 characters per line |
| Result figure (Findings) | 68 px, Archivo 125%, weight 250 | the "of N" in normal width |
| Site name in a report | 30–46 px, Archivo 125%, weight 330 | scales with the report column |
| Region name on the map | 30 px, Archivo 125%, weight 350 | |
| Section title in a document or report | 22–30 px / 1.15–1.2, serif 500 | |
| Panel heading in a rail | 15 px, Archivo 600 | phrased as the question the control answers |
| Lede | 18.5 px / 1.55, serif | max 64 characters |
| Prose | 16.5 px / 1.6, serif | max 66 characters |
| Interface text | 14 px / 1.45 | |
| Labels and annotation | 12–12.5 px, `--note` | sentence case, never uppercase |
| Fine print and credits | 11.5 px | |

## 4. Space and layout

- Base gutter 20 px (16 px on small screens). Blocks are separated by rules, not by boxes.
- Structure is square. Anything you press or that floats over the map has a 4 px radius. The body
  switch is the one pill, because choosing a body is the one choice that changes everything.
- Shadows only where something floats over moving content (the map tooltip).
- Each section has its own composition:

| Section | Composition |
|---|---|
| Explore | Instrument rail, map well, ranked catalogue or field report. The readout console runs under the map |
| Field report | One reading column with a sticky bar (back, section index), a title ledger, then sections divided by rules |
| Findings | An asymmetric title block, then the three results as a ledger of label and figure, statement, evidence chart; then articles with a sticky figure column |
| Portfolio | Title block, a framed Equal Earth plate, a roster, the matrix, the shortfalls |
| Method & data | A document: a numbered contents column that follows the reader, beside one text column with typeset formulas |

Long-form pages use a 7 : 5 split for the title block (title left, lede right, aligned to the base).

## 5. Navigation

- Masthead: wordmark (Earth and its twin overlapping), the four sections, and the body switch
  ("Compare Earth with Mars / Moon", each with a disc in the body colour that fills when selected).
  The current section carries a 2 px chalk bar on the masthead rule.
- Routes are hash routes and are kept from the original application: `#/explore?t=<region>&s=<site>`,
  `#/findings`, `#/portfolio`, `#/method`. Explore also writes `l` (dimension), `b` (basemap) and
  `o` (observation overlay) when they differ from the defaults, so a view can be shared.
- Tabs inside a column (Question / Map layers, Ranked sites / Reference region) use the same chalk bar.
- The field report has a sticky index of its twelve sections; the one being read is underlined.
  The Method page's contents column does the same.
- On screens under 900 px the four side panels share one place under the map, chosen from a sticky
  bar: Sites, Region, Question, Layers.

## 6. Controls

| Control | Rule |
|---|---|
| Button | 1 px border, transparent fill; primary is a chalk fill with midnight text |
| Chip | 1 px border; selected is a chalk fill. Used for presets and filters |
| Segmented control | One border around the group, segments inset by 2 px; the selected segment is chalk. Used for either/or choices on and beside maps |
| Range slider | A 2 px track filled to the value in the body colour, a chalk thumb, the value in tabular figures beside it |
| Radio / checkbox rows | Native inputs with a name, one sentence of purpose and a source line. An open row turns `--bg-raised` and shows its facts |
| Date control | Previous, native date field, next; steps by the layer's own period (day, month, year) and stops at the latest date the service is expected to hold |
| Text field (go to coordinates) | No inner box; the frame brightens on focus; an error is stated in words above the field |

Button text says what will happen ("Open the field report for Harrat Khaybar", "Search the Copernicus
catalogue", "Show every site"). There are no arrow glyphs in button text; previous/next and back use
drawn chevrons.

### States

- **Loading:** the wordmark, "Loading the analysis" and a thin indeterminate bar. "Loading map tiles"
  appears on a map if tiles take more than a third of a second.
- **Empty:** when filters leave no site, the ranking says so, says why that is not the end, and offers
  "Show every site".
- **Error:** the data-load failure names what failed and how to fix it. A map layer or the satellite
  catalogue that does not answer says so beside the map; everything scored keeps working.

## 7. Tables

- `table.data`: full width, strong rule under the header, hairlines between rows, numbers in tabular
  figures and right-aligned. Rows that open a report highlight on hover and respond to Enter.
- `table.ledger`: the same, inside reports, with a caption that states what the table is.
- `table.matrix`: the coverage matrix. A covered requirement shows the site letter on a faint chalk
  tint; an open one shows the best available score with a thin bar. Pointing at a site turns its cells
  chalk.
- Position on a 0–1 scale is drawn as a mark on a strip with reference ticks, not as a filled bar, so a
  low value is as visible as a high one.

## 8. Charts

Hand-drawn SVG in `web/src/components/charts.tsx` and `Pages.tsx`.

- Axis text in Archivo 10.5 px with tabular figures, grid lines in `--line`, no chart borders.
- Earth is always mineral green, the planetary body copper or ice blue. Line weight 1.6 px.
- Model curves (Mars Climate Database) are dashed; measured curves (Diviner) are solid.
- Shaded relief panels are drawn from the same 32 × 32 elevation window the terrain score uses, with a
  shared vertical exaggeration and light direction on both sides of a comparison.
- Score bars: body colour, with a chalk tick at the match threshold. Per-variable bars take the pattern
  of their weakest evidence kind. Confidence meters are chalk-grey, never the body colour.
- The three results on Findings each carry their evidence as a figure: a strip of every established
  analog's calibrated rank (filled = chosen for environment), the lead site's dimension bars against
  the threshold, and one square per portfolio requirement (filled = covered).

## 9. Maps

### Frames and furniture

The main map is a well with small cross marks at its four corners, as on a survey photograph. Smaller
maps sit in a 1 px frame. Furniture floats in midnight panels at 90% opacity with a 1 px border:

- **Title block** (top left): "Where Earth resembles", the region, its coordinates, the dimension and
  weight profile in force.
- **Dimension selector** under it.
- **View controls** (top right): zoom in, zoom out, reset, globe / flat.
- **Legend** (bottom left): class swatches with score ranges, a histogram of land area by score, the
  official legend of any observation overlay, and the key to site symbols.
- **Scale bar** (bottom right): a round distance measured at the map centre. On Moon and Mars maps it
  is computed with that body's radius.
- **Go to** field for coordinates.
- **Readout console** under the map, at a fixed height on wide screens so the map never resizes under
  the cursor: coordinates, the cell's similarity and share of land, and every dimension score with a
  small bar against the threshold. A click pins the cell and names the nearest listed site.
- **Credit line** under the console, rebuilt from the layers that are on.

### The relief basemap

"Atlas relief" is drawn in the browser from open elevation tiles: a hypsometric tint in basalt tones
(steps at 0, 500, 1500, 3000, 4500, 6000 m) under silver hill shading lit from the north-west, on a
flat midnight sea. Coastlines and graticule are chalk at reduced opacity; country boundaries are dashed.

### Site symbols

| Shape | Meaning | Fill | Meaning |
|---|---|---|---|
| Circle | candidate from the scan | solid | high confidence |
| Square | established analog | half | moderate confidence |
| | | open | low confidence |

Symbols are chalk with a midnight halo, so they read on relief and on imagery. The eight best-ranked
sites carry a small numbered flag once the map is zoomed in enough to separate them. The selected site
is marked with a survey reticle.

Place names of deserts, plateaus and ranges are set in letter-spaced italic serif in silver, as on a
printed atlas, and thin out with zoom.

### Tooltips

A raised panel with chalk text. It never takes the pointer, so it cannot steal hover from the map.
Order: site name, place, similarity with the reference region, confidence, status, then a small bar per
dimension with matched dimensions in the body colour.

### Layer system

Layers are defined in one registry, `web/src/lib/layers.ts`. A layer cannot be added without its
purpose, product, resolution, units, period, limits, source link and its relation to the score.

| Group | Behaviour | Layers |
|---|---|---|
| Similarity | Pipeline output, 0.25° cells, classed or continuous, opacity control | overall and one per dimension |
| Basemap | One at a time | Atlas relief, Sentinel-2 cloudless, Blue Marble with relief, MODIS true colour by day |
| Observations | One at a time, below the similarity layer, with date and opacity | land surface temperature day and night, vegetation index, albedo, land cover, precipitation, surface pressure, column water vapour, snow cover, Sentinel-2 passes, Sentinel-1 radar |
| Reference | Any combination | graticule, coastlines, country boundaries, place names, geologic map units |

Drawing order, bottom to top: basemap, geologic units, observation, similarity, graticule, boundaries,
coastline, cell outline, site symbols.

Conventions:

- An active layer is a filled radio or checkbox, and an active overlay opens to show its facts.
- A layer whose product is also scored carries the tag "same product is scored". It is still only a
  picture here.
- Outside layers are pictures of data. They are never read as numbers and never enter a score.
- Imagery basemaps are desaturated and dimmed while the similarity layer is on, so the ramp stays legible.
- Radar always appears with a note on what backscatter can and cannot show.

Moon and Mars maps use their own registry of layers from NASA Solar System Treks. The tiles arrive in
plate-carrée form and are re-projected to the map projection in the browser (`web/src/lib/trek.ts`).
Their globes float in the same star field as the Earth map. Colourised layers that come without a
numeric legend say so.

### Small static maps

- **Locator globe** (SVG, orthographic): where a site is on Earth, or a region on Mars or the Moon.
  Planetary locators show a graticule only, since there is no coastline to draw.
- **Portfolio plate** (SVG, Equal Earth): an equal-area world map, the right projection for showing
  how sites are spread. Labels are placed so they do not collide.

## 10. Motion

Motion answers an action; nothing moves on its own except the loading indicators.

- Map moves (fly to a site, reset) are animated, and MapLibre skips them when the reader asks for
  reduced motion.
- Switching section fades the new view in over 200 ms. Opening a field report slides it 14 px in from
  the right while it fades in (240 ms).
- Tiles fade in over 120 ms. Controls change colour over 120 ms.
- Nothing animates on scroll or on page load.
- `prefers-reduced-motion` removes all transitions, animations and smooth scrolling.

## 11. Responsive behaviour

| Width | Behaviour |
|---|---|
| ≥ 1540 px | Three columns; the report opens beside the rail and the map |
| 1180–1540 px | With a report open the rail gives its space to the map |
| < 1280 px | Masthead tagline and the "Compare Earth with" label are dropped; rails narrow |
| < 1180 px | Title blocks stack; the results ledger moves its chart under the statement; Method contents move above the text |
| < 900 px | One column: the map (54% of the screen height), the readout, the legend as a strip, then one panel at a time chosen from a sticky bar. With a report open the map shrinks to a third of the screen and its furniture steps aside. Multi-column blocks stack; tables scroll sideways inside their own box |
| < 520 px | Locator globes in report headers are dropped; legend classes become one column |

When the map column is narrower than 600 px (a container query, so it also applies beside an open
report) the legend keeps only its classes and the readout tightens. Nothing scientific is removed at any
width: every table, chart, map and note is still present on a phone.

## 12. Accessibility

- Text contrast is at least 6:1 on the page ground (`--note`); `--faint` is used only for non-text marks.
- Focus is a 2 px chalk outline on every control. Table rows and map marks that open a report are
  focusable and respond to Enter.
- State is never carried by colour alone: confidence by fill, evidence kind by pattern, matched
  dimensions by filled against open squares, the selected body by a filled disc and a pressed button.
- Maps have text equivalents: the ranked list for site positions, the readout console for cell values,
  the legend for class ranges, and coordinates in every report.
- Controls have accessible names; toggles use `aria-pressed`, tabs `aria-selected`, the section
  indexes `aria-current`.
- Map rotation and tilt are off, so north is always up and the north arrow is always true.
